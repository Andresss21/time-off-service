import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TimeOffRequest } from '@prisma/client';

import { SyncService } from '../sync';
import { HcmClientService, HcmBalancesDeltaResponse, HcmLedgerEntry } from '../hcm-client/hcm-client.service';
import { AuditService } from '../audit';
import {
  RequestState,
  AuditEventType,
  AuditEventSeverity,
  AuditEventSourceSubsystem,
} from '../common/types';
import { SYNC_IMMEDIATE_REQUESTED } from '../sync/sync.events';
import { ReconciliationRepository } from './reconciliation.repository';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const TERMINAL_STATES = new Set<string>([
  RequestState.APPROVED,
  RequestState.REJECTED_PRE_VALIDATION,
  RequestState.REJECTED_HCM,
  RequestState.REJECTED_INVALID,
  RequestState.FAILED_CREDENTIAL_ERROR,
  RequestState.FAILED_EXHAUSTED,
]);

const MAX_POST_ATTEMPTS = 5;
const MAX_TIME_WINDOW_MS = 60 * 60 * 1000; // 1 hour

@Injectable()
export class ReconciliationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    private readonly repository: ReconciliationRepository,
    private readonly syncService: SyncService,
    private readonly hcmClient: HcmClientService,
    private readonly auditService: AuditService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.logger.log('ReconciliationService: starting startup sync and orphan recovery');

    await this.syncService.runStartupSync();

    const orphans = await this.repository.findOrphanedRequests([
      RequestState.NEEDS_RECONCILIATION,
      RequestState.PENDING_HCM,
    ]);

    const needsRecon = orphans.filter((r) => r.state === RequestState.NEEDS_RECONCILIATION);
    const pendingHcm = orphans.filter((r) => r.state === RequestState.PENDING_HCM);

    this.logger.log({
      message: 'ReconciliationService: orphaned requests found',
      needsRecon: needsRecon.length,
      pendingHcm: pendingHcm.length,
    });

    const processedIds = new Set<string>();

    for (let i = 0; i < needsRecon.length; i++) {
      const req = needsRecon[i];
      if (!processedIds.has(req.id)) {
        const ids = await this.runGroupReconciliation(req, orphans);
        ids.forEach((id) => processedIds.add(id));
      }
      if (i < needsRecon.length - 1) await sleep(100);
    }

    for (let i = 0; i < pendingHcm.length; i++) {
      const req = pendingHcm[i];
      if (!processedIds.has(req.id)) {
        const ids = await this.runGroupReconciliation(req, orphans);
        ids.forEach((id) => processedIds.add(id));
      }
      if (i < pendingHcm.length - 1) await sleep(100);
    }

    this.logger.log('ReconciliationService: startup recovery complete');
  }

  async reconcile(requestId: string): Promise<void> {
    const request = await this.repository.findById(requestId);
    if (!request || TERMINAL_STATES.has(request.state)) return;

    const allOrphans = await this.repository.findOrphanedRequests([
      RequestState.NEEDS_RECONCILIATION,
      RequestState.PENDING_HCM,
    ]);

    // Include the target request if it's not in the orphans list (e.g. SUBMITTED state)
    if (!allOrphans.find((r) => r.id === request.id)) {
      allOrphans.push(request);
    }

    await this.runGroupReconciliation(request, allOrphans);
  }

  /**
   * Processes the reconciliation group for a given request.
   * Applies M-of-N positional matching when multiple requests share the same
   * (employeeId, locationId, requestedDays) triple.
   * Returns the set of request IDs that were processed.
   */
  private async runGroupReconciliation(
    anchor: TimeOffRequest,
    allOrphans: TimeOffRequest[],
  ): Promise<Set<string>> {
    const processed = new Set<string>();

    // Find all requests in the group (same triple, non-terminal, with hcmPrePostSequence set)
    const group = allOrphans.filter(
      (r) =>
        r.employeeId === anchor.employeeId &&
        r.locationId === anchor.locationId &&
        r.requestedDays === anchor.requestedDays &&
        !TERMINAL_STATES.has(r.state) &&
        r.hcmPrePostSequence != null,
    );

    // Handle requests without hcmPrePostSequence (no POST dispatched yet)
    if (anchor.hcmPrePostSequence == null) {
      processed.add(anchor.id);
      await this.dispatchFirstPost(anchor);
      return processed;
    }

    if (group.length === 0) {
      // Only anchor, with null hcmPrePostSequence handled above; shouldn't reach here
      return processed;
    }

    // Sort group by hcmPrePostSequence ascending
    group.sort((a, b) => (a.hcmPrePostSequence ?? 0) - (b.hcmPrePostSequence ?? 0));

    // Check retryNotBefore for PENDING_HCM requests at startup (handled per-request in group)
    // For requests where retryNotBefore is in the future: schedule timer and skip
    const now = Date.now();

    // Delta sync from minimum hcmPrePostSequence in the group
    const minSequence = group[0].hcmPrePostSequence!;

    let confirmingEvents: HcmLedgerEntry[] = [];
    try {
      const response = await this.hcmClient.getBalances(minSequence);
      if (response.status === 200) {
        const delta = response.data as HcmBalancesDeltaResponse;
        const entries = delta.entries ?? [];
        confirmingEvents = entries.filter((e) => this.isConfirmingEvent(e, anchor));
        confirmingEvents.sort((a, b) => a.sequence - b.sequence);
      } else {
        this.logger.warn({
          message: 'ReconciliationService: delta sync returned non-200',
          status: response.status,
          minSequence,
        });
        // Cannot reconcile without delta sync — skip group (will be retried on next run)
        return processed;
      }
    } catch (err) {
      this.logger.error({ message: 'ReconciliationService: delta sync threw', err, minSequence });
      return processed;
    }

    const M = confirmingEvents.length;
    const N = group.length;

    for (let i = 0; i < N; i++) {
      const req = group[i];
      processed.add(req.id);

      // Check retryNotBefore for PENDING_HCM requests
      if (
        req.state === RequestState.PENDING_HCM &&
        req.retryNotBefore != null &&
        req.retryNotBefore.getTime() > now
      ) {
        // Schedule in-memory timer for this exact timestamp
        const delay = req.retryNotBefore.getTime() - now;
        this.logger.log({
          message: 'ReconciliationService: scheduling retry for retryNotBefore',
          requestId: req.id,
          retryNotBefore: req.retryNotBefore.toISOString(),
        });
        setTimeout(() => {
          this.reconcile(req.id).catch((err) =>
            this.logger.error({ message: 'Scheduled retry threw', requestId: req.id, err }),
          );
        }, delay);
        continue;
      }

      if (i < M) {
        // Confirming event found — transition to APPROVED
        await this.repository.updateToApproved(req.id);
        this.logger.log({ message: 'ReconciliationService: request approved', requestId: req.id });
      } else {
        // No confirming event — evaluate retry safety invariant
        await this.handleNoConfirmingEvent(req);
      }
    }

    return processed;
  }

  private isConfirmingEvent(entry: HcmLedgerEntry, req: TimeOffRequest): boolean {
    return (
      entry.type === 'DEDUCTION' &&
      entry.source === 'TIME_OFF_SERVICE' &&
      entry.reason === 'TIME_OFF_TAKEN' &&
      entry.employeeId === req.employeeId &&
      entry.locationId === req.locationId &&
      entry.delta === -(req.requestedDays)
    );
  }

  /**
   * Handles the case where no confirming event was found for a request.
   * Evaluates the retry safety invariant and dispatches a new POST or transitions
   * to FAILED_EXHAUSTED.
   */
  private async handleNoConfirmingEvent(req: TimeOffRequest): Promise<void> {
    const now = Date.now();
    const attemptCount = req.postAttemptCount;
    const firstAttemptAt = req.firstPostAttemptAt;

    const withinAttemptLimit = attemptCount < MAX_POST_ATTEMPTS;
    const withinTimeWindow =
      firstAttemptAt == null || now - firstAttemptAt.getTime() < MAX_TIME_WINDOW_MS;

    if (withinAttemptLimit && withinTimeWindow) {
      // Check retryNotBefore
      if (req.retryNotBefore != null && req.retryNotBefore.getTime() > now) {
        const delay = req.retryNotBefore.getTime() - now;
        setTimeout(() => {
          this.reconcile(req.id).catch((err) =>
            this.logger.error({ message: 'Scheduled retry threw', requestId: req.id, err }),
          );
        }, delay);
        return;
      }

      // Dispatch retry POST
      await this.dispatchRetryPost(req);
    } else {
      // Exhausted
      const exhaustionReason: 'attempt_limit' | 'time_window' = withinAttemptLimit
        ? 'time_window'
        : 'attempt_limit';
      await this.transitionToFailedExhausted(req, exhaustionReason);
    }
  }

  /**
   * Dispatches the first POST for a request that has never been dispatched before.
   */
  private async dispatchFirstPost(req: TimeOffRequest): Promise<void> {
    const now = Date.now();

    if (req.postAttemptCount >= MAX_POST_ATTEMPTS) {
      await this.transitionToFailedExhausted(req, 'attempt_limit');
      return;
    }
    if (
      req.firstPostAttemptAt != null &&
      now - req.firstPostAttemptAt.getTime() >= MAX_TIME_WINDOW_MS
    ) {
      await this.transitionToFailedExhausted(req, 'time_window');
      return;
    }

    await this.dispatchRetryPost(req);
  }

  /**
   * Executes the pre-POST persistence contract and dispatches a POST to HCM.
   * (1) Read global cursor
   * (2) Commit reconciliation fields atomically
   * (3) Dispatch POST
   */
  private async dispatchRetryPost(req: TimeOffRequest): Promise<void> {
    const cursor = await this.repository.readGlobalCursor();
    const newPostAttemptCount = req.postAttemptCount + 1;
    const firstPostAttemptAt = req.firstPostAttemptAt ?? new Date();

    // Pre-POST persistence contract: commit before dispatching
    await this.repository.updateReconciliationFields(req.id, {
      hcmPrePostSequence: cursor ?? 0,
      postAttemptCount: newPostAttemptCount,
      firstPostAttemptAt,
      retryNotBefore: null,
    });

    this.logger.log({
      message: 'ReconciliationService: dispatching POST to HCM',
      requestId: req.id,
      postAttemptCount: newPostAttemptCount,
    });

    let response;
    try {
      response = await this.hcmClient.postTimeOff({
        requestId: req.id,
        employeeId: req.employeeId,
        locationId: req.locationId,
        requestedDays: req.requestedDays,
      });
    } catch {
      // Timeout or network error — transition to NEEDS_RECONCILIATION
      this.logger.warn({
        message: 'ReconciliationService: POST to HCM timed out or errored',
        requestId: req.id,
      });
      await this.repository.updateToNeedsReconciliation(req.id);
      return;
    }

    await this.handlePostResponse(
      { ...req, postAttemptCount: newPostAttemptCount, firstPostAttemptAt },
      response.status,
      response.headers,
    );
  }

  private async handlePostResponse(
    req: TimeOffRequest & { postAttemptCount: number; firstPostAttemptAt: Date },
    status: number,
    headers: Record<string, string>,
  ): Promise<void> {
    if (status === 200) {
      await this.repository.updateToApproved(req.id);
      this.logger.log({
        message: 'ReconciliationService: POST succeeded, request approved',
        requestId: req.id,
      });
      return;
    }

    if (status === 422) {
      await this.repository.updateToRejectedHcm(req.id);
      return;
    }

    if (status === 404) {
      await this.repository.updateToRejectedInvalid(req.id);
      return;
    }

    if (status === 401 || status === 403) {
      await this.repository.updateToFailedCredentialError(req.id, status as 401 | 403);
      return;
    }

    if (status === 429) {
      const retryAfterHeader = headers['retry-after'];
      let retryAfterSeconds = 60;
      if (retryAfterHeader) {
        const parsed = parseInt(retryAfterHeader, 10);
        if (!isNaN(parsed) && parsed > 0) {
          retryAfterSeconds = parsed;
        }
      }
      const retryNotBefore = new Date(Date.now() + retryAfterSeconds * 1000);
      await this.repository.updateRetryNotBefore(req.id, retryNotBefore);

      this.logger.log({
        message: 'ReconciliationService: POST received 429, scheduled retry',
        requestId: req.id,
        retryNotBefore: retryNotBefore.toISOString(),
      });

      const delay = retryNotBefore.getTime() - Date.now();
      setTimeout(() => {
        this.reconcile(req.id).catch((err) =>
          this.logger.error({ message: 'Scheduled retry threw', requestId: req.id, err }),
        );
      }, delay);
      return;
    }

    // Unexpected status — transition to NEEDS_RECONCILIATION
    this.logger.warn({
      message: 'ReconciliationService: unexpected POST response status',
      requestId: req.id,
      status,
    });
    await this.repository.updateToNeedsReconciliation(req.id);
  }

  private async transitionToFailedExhausted(
    req: TimeOffRequest,
    exhaustionReason: 'attempt_limit' | 'time_window',
  ): Promise<void> {
    await this.repository.updateToFailedExhausted(req.id, exhaustionReason);

    this.logger.warn({
      message: 'ReconciliationService: request transitioned to FAILED_EXHAUSTED',
      requestId: req.id,
      exhaustionReason,
    });

    await this.auditService.record({
      eventType: AuditEventType.REQUEST_EXHAUSTED,
      occurredAt: new Date().toISOString(),
      severity: AuditEventSeverity.HIGH,
      sourceSubsystem: AuditEventSourceSubsystem.DEDUCTION_FLOW,
      requestId: req.id,
      employeeId: req.employeeId,
      locationId: req.locationId,
      requestedDays: req.requestedDays,
      postAttemptCount: req.postAttemptCount,
      firstPostAttemptAt: req.firstPostAttemptAt?.toISOString() ?? new Date().toISOString(),
      hcmPrePostSequenceAtLastAttempt: req.hcmPrePostSequence ?? 0,
      exhaustionReason,
    });

    this.eventEmitter.emit(SYNC_IMMEDIATE_REQUESTED);
  }
}
