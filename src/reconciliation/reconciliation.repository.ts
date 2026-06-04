import { Injectable } from '@nestjs/common';
import { TimeOffRequest } from '@prisma/client';

import { PrismaService } from '../database';
import { RequestState } from '../common/types';

@Injectable()
export class ReconciliationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findOrphanedRequests(states: RequestState[]): Promise<TimeOffRequest[]> {
    return this.prisma.timeOffRequest.findMany({
      where: { state: { in: states } },
    });
  }

  async findById(requestId: string): Promise<TimeOffRequest | null> {
    return this.prisma.timeOffRequest.findUnique({
      where: { id: requestId },
    });
  }

  async updateToApproved(requestId: string): Promise<void> {
    await this.prisma.timeOffRequest.update({
      where: { id: requestId },
      data: { state: RequestState.APPROVED, resolvedAt: new Date() },
    });
  }

  async updateToFailedExhausted(
    requestId: string,
    _exhaustionReason: 'attempt_limit' | 'time_window',
  ): Promise<void> {
    await this.prisma.timeOffRequest.update({
      where: { id: requestId },
      data: { state: RequestState.FAILED_EXHAUSTED, resolvedAt: new Date() },
    });
  }

  async updateReconciliationFields(
    requestId: string,
    fields: {
      hcmPrePostSequence: number;
      postAttemptCount: number;
      firstPostAttemptAt: Date | null;
      retryNotBefore: Date | null;
    },
  ): Promise<void> {
    await this.prisma.timeOffRequest.update({
      where: { id: requestId },
      data: {
        hcmPrePostSequence: fields.hcmPrePostSequence,
        postAttemptCount: fields.postAttemptCount,
        ...(fields.firstPostAttemptAt !== null
          ? { firstPostAttemptAt: fields.firstPostAttemptAt }
          : {}),
        retryNotBefore: fields.retryNotBefore,
      },
    });
  }

  async readGlobalCursor(): Promise<number | null> {
    const row = await this.prisma.syncState.findUnique({
      where: { id: 'singleton' },
    });
    return row?.globalCursor ?? null;
  }

  async updateRetryNotBefore(requestId: string, retryNotBefore: Date): Promise<void> {
    await this.prisma.timeOffRequest.update({
      where: { id: requestId },
      data: { retryNotBefore },
    });
  }

  async updateToRejectedHcm(requestId: string): Promise<void> {
    await this.prisma.timeOffRequest.update({
      where: { id: requestId },
      data: {
        state: RequestState.REJECTED_HCM,
        resolvedAt: new Date(),
        hcmOutcomeStatus: 422,
      },
    });
  }

  async updateToRejectedInvalid(requestId: string): Promise<void> {
    await this.prisma.timeOffRequest.update({
      where: { id: requestId },
      data: {
        state: RequestState.REJECTED_INVALID,
        resolvedAt: new Date(),
        hcmOutcomeStatus: 404,
      },
    });
  }

  async updateToFailedCredentialError(requestId: string, httpStatus: 401 | 403): Promise<void> {
    await this.prisma.timeOffRequest.update({
      where: { id: requestId },
      data: {
        state: RequestState.FAILED_CREDENTIAL_ERROR,
        resolvedAt: new Date(),
        hcmOutcomeStatus: httpStatus,
      },
    });
  }

  async updateToNeedsReconciliation(requestId: string): Promise<void> {
    await this.prisma.timeOffRequest.update({
      where: { id: requestId },
      data: { state: RequestState.NEEDS_RECONCILIATION },
    });
  }
}
