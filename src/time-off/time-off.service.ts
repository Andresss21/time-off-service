import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TimeOffRequest } from '@prisma/client';

import { PrismaService, executeExclusiveTransaction } from '../database';
import { HcmClientService } from '../hcm-client';
import {
  HcmPostTimeOffSuccessResponse,
  HcmBalancesDeltaResponse,
} from '../hcm-client/hcm-client.service';
import { AuditService } from '../audit';
import { ErrorFactory } from '../common/errors';
import {
  RequestState,
  AuditEventType,
  AuditEventSeverity,
  AuditEventSourceSubsystem,
  PrismaTransactionClient,
} from '../common/types';
import { SYNC_IMMEDIATE_REQUESTED } from '../sync/sync.events';
import { TimeOffRepository } from './time-off.repository';
import { CreateTimeOffRequestDto } from './dto/create-time-off-request.dto';

export interface C5RequestStatus {
  requestId: string;
  employeeId: string;
  locationId: string;
  requestedDays: number;
  state: string;
  integrityFlag: boolean;
  hcmOutcomeStatus: number | null;
  submittedAt: string;
  resolvedAt: string | null;
  idempotencyKey: string;
}

@Injectable()
export class TimeOffService {
  private readonly logger = new Logger(TimeOffService.name);

  constructor(
    private readonly repository: TimeOffRepository,
    private readonly hcmClient: HcmClientService,
    private readonly auditService: AuditService,
    private readonly eventEmitter: EventEmitter2,
    private readonly prisma: PrismaService,
    private readonly errorFactory: ErrorFactory,
  ) {}

  async submitRequest(
    dto: CreateTimeOffRequestDto,
    idempotencyKey: string,
  ): Promise<{ data: C5RequestStatus; isNew: boolean }> {
    if (!idempotencyKey || idempotencyKey.trim() === '') {
      throw this.errorFactory.validationError('Idempotency-Key header is required.');
    }

    const existing = await this.repository.findByIdempotencyKey(idempotencyKey);
    if (existing) {
      return { data: this.mapToC5(existing), isNew: false };
    }

    const submitted = await this.repository.create({
      employeeId: dto.employeeId,
      locationId: dto.locationId,
      requestedDays: dto.requestedDays,
      idempotencyKey,
    });

    // Transaction 1 — BEGIN EXCLUSIVE: validate → reserve → transition
    const finalRequest = await executeExclusiveTransaction(this.prisma, async (txPrisma) => {
      const balanceCache = await txPrisma.balanceCache.findUnique({
        where: {
          employeeId_locationId: {
            employeeId: dto.employeeId,
            locationId: dto.locationId,
          },
        },
      });

      const rawBalance = balanceCache?.balanceDays ?? 0;
      const pendingDays = await this.repository.sumPendingReservations(
        dto.employeeId,
        dto.locationId,
        txPrisma as unknown as PrismaTransactionClient,
      );
      const effectiveBalance = rawBalance - pendingDays;

      const txClient = txPrisma as unknown as PrismaTransactionClient;

      if (dto.requestedDays > effectiveBalance) {
        return this.repository.updateState(
          submitted.id,
          RequestState.REJECTED_PRE_VALIDATION,
          { resolvedAt: new Date() },
          txClient,
        );
      }

      return this.repository.updateState(submitted.id, RequestState.PENDING_HCM, undefined, txClient);
    });

    // Asynchronous HCM POST — fires after HTTP response is returned
    if (finalRequest.state === RequestState.PENDING_HCM) {
      this.dispatchHcmPost(finalRequest).catch((err) => {
        this.logger.error({ message: 'HCM dispatch threw unexpectedly', requestId: finalRequest.id, err });
      });
    }

    return { data: this.mapToC5(finalRequest), isNew: true };
  }

  async getRequestById(requestId: string): Promise<C5RequestStatus> {
    const request = await this.repository.findById(requestId);
    if (!request) {
      throw this.errorFactory.notFound('time-off request', requestId, {
        code: 'REQUEST_NOT_FOUND',
        message: 'No time-off request found with the specified ID.',
      });
    }
    return this.mapToC5(request);
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private mapToC5(request: TimeOffRequest): C5RequestStatus {
    return {
      requestId:       request.id,
      employeeId:      request.employeeId,
      locationId:      request.locationId,
      requestedDays:   request.requestedDays,
      state:           request.state,
      integrityFlag:   request.integrityFlag,
      hcmOutcomeStatus: request.hcmOutcomeStatus,
      submittedAt:     request.submittedAt.toISOString(),
      resolvedAt:      request.resolvedAt?.toISOString() ?? null,
      idempotencyKey:  request.idempotencyKey,
    };
  }

  // Transaction 2 + HCM call. Runs asynchronously after HTTP response.
  private async dispatchHcmPost(request: TimeOffRequest): Promise<void> {
    const cursor = await this.readGlobalCursor();
    const isFirstAttempt = request.postAttemptCount === 0;

    // Transaction 2: pre-POST persistence contract
    const updated = await this.repository.updateReconciliationFields(request.id, {
      hcmPrePostSequence: cursor,
      postAttemptCount:   request.postAttemptCount + 1,
      firstPostAttemptAt: isFirstAttempt ? new Date() : undefined,
      retryNotBefore:     null,
    });

    // HTTP call must not happen until Transaction 2 commits (line above awaits)
    let response: { status: number; headers: Record<string, string>; data: unknown };
    try {
      response = await this.hcmClient.postTimeOff({
        requestId:    request.id,
        employeeId:   request.employeeId,
        locationId:   request.locationId,
        requestedDays: request.requestedDays,
      });
    } catch (err) {
      const isTimeout =
        (err instanceof DOMException && err.name === 'TimeoutError') ||
        (err instanceof Error && err.name === 'TimeoutError');

      if (isTimeout) {
        await this.handleTimeout(updated);
      } else {
        // FM-01: connection refused / DNS / TLS
        await this.handleConnectionError(updated);
      }
      return;
    }

    await this.handleHcmResponse(updated, response);
  }

  private async handleHcmResponse(
    request: TimeOffRequest,
    response: { status: number; headers: Record<string, string>; data: unknown },
  ): Promise<void> {
    if (response.status === 200) {
      const balanceDays = (response.data as HcmPostTimeOffSuccessResponse).balanceDays;
      const integrityFlag = balanceDays <= 0;

      const approved = await this.repository.updateState(request.id, RequestState.APPROVED, {
        hcmOutcomeStatus: 200,
        resolvedAt:       new Date(),
        integrityFlag,
      });

      await this.runPostValidation(approved, balanceDays);
    } else if (response.status === 422) {
      await this.repository.updateState(request.id, RequestState.REJECTED_HCM, {
        hcmOutcomeStatus: 422,
        resolvedAt:       new Date(),
      });
    } else if (response.status === 404) {
      await this.repository.updateState(request.id, RequestState.REJECTED_INVALID, {
        hcmOutcomeStatus: 404,
        resolvedAt:       new Date(),
      });
    } else if (response.status === 401 || response.status === 403) {
      // FM-15
      await this.handleCredentialError(request, response.status as 401 | 403);
    } else if (response.status === 429) {
      // FM-05
      await this.handle429(request, response.headers);
    } else {
      // Treat unexpected status as a transient connection error
      await this.handleConnectionError(request);
    }
  }

  // FM-02: response timeout → NEEDS_RECONCILIATION + immediate async reconcile
  private async handleTimeout(request: TimeOffRequest): Promise<void> {
    await this.repository.updateState(request.id, RequestState.NEEDS_RECONCILIATION);

    this.runImmediateReconciliation(request.id).catch((err) => {
      this.logger.error({
        message: 'Immediate post-timeout reconciliation threw',
        requestId: request.id,
        err,
      });
    });
  }

  // Issued after FM-02: delta sync from hcmPrePostSequence
  private async runImmediateReconciliation(requestId: string): Promise<void> {
    const request = await this.repository.findById(requestId);
    if (!request || request.hcmPrePostSequence == null) return;

    const confirmed = await this.performDeltaSyncCheck(request);
    if (confirmed) {
      // Confirming event found → APPROVED; no post-validation on reconciliation path
      await this.repository.updateState(request.id, RequestState.APPROVED, {
        resolvedAt: new Date(),
        // hcmOutcomeStatus and integrityFlag remain null/false
      });
    } else {
      await this.retryOrExhaust(request);
    }
  }

  // FM-01: connection error; request stays in PENDING_HCM; delta sync then retry/exhaust
  private async handleConnectionError(request: TimeOffRequest): Promise<void> {
    const fresh = await this.repository.findById(request.id);
    if (!fresh || fresh.hcmPrePostSequence == null) return;

    const confirmed = await this.performDeltaSyncCheck(fresh);
    if (confirmed) {
      await this.repository.updateState(fresh.id, RequestState.APPROVED, {
        resolvedAt: new Date(),
      });
    } else {
      await this.retryOrExhaust(fresh);
    }
  }

  // FM-05: HCM returns 429 — persist retryNotBefore, schedule in-memory timer
  private async handle429(
    request: TimeOffRequest,
    headers: Record<string, string>,
  ): Promise<void> {
    const retryAfterRaw = parseInt(headers['retry-after'] ?? '', 10);
    const delaySeconds = Number.isFinite(retryAfterRaw) && retryAfterRaw > 0 ? retryAfterRaw : 60;
    const retryNotBefore = new Date(Date.now() + delaySeconds * 1000);

    // Persist retryNotBefore immediately. Re-state existing cursor/count values
    // (they were already written in Transaction 2 before this HCM call).
    await this.repository.updateReconciliationFields(request.id, {
      hcmPrePostSequence: request.hcmPrePostSequence!,
      postAttemptCount:   request.postAttemptCount,
      retryNotBefore,
    });

    // In-memory timer; restart recovery is ReconciliationModule's responsibility
    setTimeout(() => {
      this.on429TimerFired(request.id).catch((err) => {
        this.logger.error({ message: '429 retry timer threw', requestId: request.id, err });
      });
    }, delaySeconds * 1000);
  }

  private async on429TimerFired(requestId: string): Promise<void> {
    const request = await this.repository.findById(requestId);
    if (!request || request.state !== RequestState.PENDING_HCM) return;
    if (request.hcmPrePostSequence == null) return;

    // Retry safety invariant condition 1: delta sync check before new POST
    const confirmed = await this.performDeltaSyncCheck(request);
    if (confirmed) {
      await this.repository.updateState(request.id, RequestState.APPROVED, {
        resolvedAt: new Date(),
      });
      return;
    }

    await this.retryOrExhaust(request);
  }

  // FM-15: HCM returns 401 or 403
  private async handleCredentialError(
    request: TimeOffRequest,
    status: 401 | 403,
  ): Promise<void> {
    await this.repository.updateState(request.id, RequestState.FAILED_CREDENTIAL_ERROR, {
      hcmOutcomeStatus: status,
      resolvedAt:       new Date(),
    });

    await this.auditService.record({
      eventType:       AuditEventType.CREDENTIAL_ERROR,
      occurredAt:      new Date().toISOString(),
      severity:        AuditEventSeverity.CRITICAL,
      sourceSubsystem: AuditEventSourceSubsystem.DEDUCTION_FLOW,
      requestId:       request.id,
      employeeId:      request.employeeId,
      locationId:      request.locationId,
      httpStatus:      status,
    });
  }

  // Post-validation: runs only on live POST → 200 path
  private async runPostValidation(
    request: TimeOffRequest,
    balanceDays: number,
  ): Promise<void> {
    if (balanceDays < 0) {
      // Trigger A: negative balance — integrity violation
      await this.auditService.record({
        eventType:          AuditEventType.INTEGRITY_VIOLATION_NEGATIVE_BALANCE,
        occurredAt:         new Date().toISOString(),
        severity:           AuditEventSeverity.HIGH,
        sourceSubsystem:    AuditEventSourceSubsystem.DEDUCTION_FLOW,
        requestId:          request.id,
        employeeId:         request.employeeId,
        locationId:         request.locationId,
        requestedDays:      request.requestedDays,
        returnedBalanceDays: balanceDays,
      });
      this.eventEmitter.emit(SYNC_IMMEDIATE_REQUESTED);
    } else if (balanceDays === 0) {
      // Trigger B: zero balance — annotation
      await this.auditService.record({
        eventType:          AuditEventType.INTEGRITY_ANNOTATION_ZERO_BALANCE,
        occurredAt:         new Date().toISOString(),
        severity:           AuditEventSeverity.LOW,
        sourceSubsystem:    AuditEventSourceSubsystem.DEDUCTION_FLOW,
        requestId:          request.id,
        employeeId:         request.employeeId,
        locationId:         request.locationId,
        requestedDays:      request.requestedDays,
        returnedBalanceDays: 0,
      });
      // No SYNC_IMMEDIATE_REQUESTED on Trigger B
    }
    // balanceDays > 0: no action
  }

  // Issues GET /balances?since=hcmPrePostSequence and checks for confirming event
  private async performDeltaSyncCheck(request: TimeOffRequest): Promise<boolean> {
    if (request.hcmPrePostSequence == null) return false;

    let balancesResponse: { status: number; data: unknown };
    try {
      balancesResponse = await this.hcmClient.getBalances(request.hcmPrePostSequence);
    } catch {
      return false;
    }

    if (balancesResponse.status !== 200) return false;

    const data = balancesResponse.data as HcmBalancesDeltaResponse;
    const entries = data.entries ?? [];

    return entries.some(
      (entry) =>
        entry.type       === 'DEDUCTION' &&
        entry.source     === 'TIME_OFF_SERVICE' &&
        entry.reason     === 'TIME_OFF_TAKEN' &&
        entry.employeeId === request.employeeId &&
        entry.locationId === request.locationId &&
        entry.delta      === -(request.requestedDays),
    );
  }

  // Checks retry limits; either retries via dispatchHcmPost or transitions to FAILED_EXHAUSTED
  private async retryOrExhaust(request: TimeOffRequest): Promise<void> {
    const now = new Date();

    const attemptExhausted = request.postAttemptCount >= 5;
    const timeExhausted =
      request.firstPostAttemptAt != null &&
      now.getTime() - request.firstPostAttemptAt.getTime() >= 3_600_000;

    if (attemptExhausted || timeExhausted) {
      await this.transitionToFailedExhausted(
        request,
        attemptExhausted ? 'attempt_limit' : 'time_window',
      );
    } else {
      await this.dispatchHcmPost(request);
    }
  }

  private async transitionToFailedExhausted(
    request: TimeOffRequest,
    exhaustionReason: 'attempt_limit' | 'time_window',
  ): Promise<void> {
    await this.repository.updateState(request.id, RequestState.FAILED_EXHAUSTED, {
      resolvedAt: new Date(),
    });

    await this.auditService.record({
      eventType:                       AuditEventType.REQUEST_EXHAUSTED,
      occurredAt:                      new Date().toISOString(),
      severity:                        AuditEventSeverity.HIGH,
      sourceSubsystem:                 AuditEventSourceSubsystem.DEDUCTION_FLOW,
      requestId:                       request.id,
      employeeId:                      request.employeeId,
      locationId:                      request.locationId,
      requestedDays:                   request.requestedDays,
      postAttemptCount:                request.postAttemptCount,
      firstPostAttemptAt:              request.firstPostAttemptAt!.toISOString(),
      hcmPrePostSequenceAtLastAttempt: request.hcmPrePostSequence!,
      exhaustionReason,
    });
  }

  private async readGlobalCursor(): Promise<number> {
    const syncState = await this.prisma.syncState.findUnique({
      where: { id: 'singleton' },
    });
    return syncState?.globalCursor ?? 0;
  }
}
