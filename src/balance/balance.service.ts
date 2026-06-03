import { Injectable } from '@nestjs/common';

import { PrismaService } from '../database';
import { ErrorFactory } from '../common/errors';
import { RequestState } from '../common/types';

export interface C4BalanceObject {
  employeeId: string;
  locationId: string;
  rawCachedBalanceDays: number;
  pendingDays: number;
  effectiveAvailableBalanceDays: number;
  lastSyncedAt: string;
  lastHcmSequence: number;
}

@Injectable()
export class BalanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly errorFactory: ErrorFactory,
  ) {}

  async getEffectiveBalance(employeeId: string, locationId: string): Promise<C4BalanceObject> {
    const cache = await this.prisma.balanceCache.findUnique({
      where: { employeeId_locationId: { employeeId, locationId } },
    });

    if (cache === null) {
      throw this.errorFactory.notFound(
        'balance',
        `${employeeId}/${locationId}`,
        {
          code: 'BALANCE_NOT_FOUND',
          message: 'No balance record found for the specified employee and location.',
        },
      );
    }

    const aggregate = await this.prisma.timeOffRequest.aggregate({
      _sum: { requestedDays: true },
      where: {
        employeeId,
        locationId,
        state: { in: [RequestState.PENDING_HCM, RequestState.NEEDS_RECONCILIATION] },
      },
    });
    const pendingDays = aggregate._sum.requestedDays ?? 0;

    const effectiveAvailableBalanceDays = cache.balanceDays - pendingDays;

    return {
      employeeId: cache.employeeId,
      locationId: cache.locationId,
      rawCachedBalanceDays: cache.balanceDays,
      pendingDays,
      effectiveAvailableBalanceDays,
      lastSyncedAt: cache.lastSyncedAt.toISOString(),
      lastHcmSequence: cache.lastHcmSequence,
    };
  }
}
