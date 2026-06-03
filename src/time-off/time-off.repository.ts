import { Injectable } from '@nestjs/common';
import { TimeOffRequest } from '@prisma/client';

import { PrismaService } from '../database';
import { RequestState, PrismaTransactionClient } from '../common/types';

@Injectable()
export class TimeOffRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    employeeId: string;
    locationId: string;
    requestedDays: number;
    idempotencyKey: string;
  }): Promise<TimeOffRequest> {
    return this.prisma.timeOffRequest.create({
      data: {
        employeeId: data.employeeId,
        locationId: data.locationId,
        requestedDays: data.requestedDays,
        idempotencyKey: data.idempotencyKey,
        state: RequestState.SUBMITTED,
        postAttemptCount: 0,
        integrityFlag: false,
      },
    });
  }

  async findByIdempotencyKey(key: string): Promise<TimeOffRequest | null> {
    return this.prisma.timeOffRequest.findUnique({
      where: { idempotencyKey: key },
    });
  }

  async findById(requestId: string): Promise<TimeOffRequest | null> {
    return this.prisma.timeOffRequest.findUnique({
      where: { id: requestId },
    });
  }

  async updateState(
    requestId: string,
    state: RequestState,
    outcomeFields?: {
      hcmOutcomeStatus?: number | null;
      resolvedAt?: Date;
      integrityFlag?: boolean;
    },
    tx?: PrismaTransactionClient,
  ): Promise<TimeOffRequest> {
    const client = tx ?? this.prisma;
    return client.timeOffRequest.update({
      where: { id: requestId },
      data: { state, ...outcomeFields },
    });
  }

  async updateReconciliationFields(
    requestId: string,
    fields: {
      hcmPrePostSequence: number;
      postAttemptCount: number;
      firstPostAttemptAt?: Date;
      retryNotBefore?: Date | null;
    },
  ): Promise<TimeOffRequest> {
    return this.prisma.timeOffRequest.update({
      where: { id: requestId },
      data: fields,
    });
  }

  async sumPendingReservations(
    employeeId: string,
    locationId: string,
    tx?: PrismaTransactionClient,
  ): Promise<number> {
    const where = {
      employeeId,
      locationId,
      state: { in: [RequestState.PENDING_HCM, RequestState.NEEDS_RECONCILIATION] },
    };

    const result = tx
      ? await tx.timeOffRequest.aggregate({ where, _sum: { requestedDays: true } })
      : await this.prisma.timeOffRequest.aggregate({ where, _sum: { requestedDays: true } });

    return result._sum.requestedDays ?? 0;
  }
}
