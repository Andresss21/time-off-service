import { Injectable } from '@nestjs/common';

import { PrismaService } from '../database';
import { executeExclusiveTransaction } from '../database';

@Injectable()
export class SyncRepository {
  constructor(private readonly prisma: PrismaService) {}

  async readGlobalCursor(): Promise<number | null> {
    const record = await this.prisma.syncState.findUnique({ where: { id: 'singleton' } });
    return record?.globalCursor ?? null;
  }

  async upsertBalanceCacheChunked(
    records: Array<{ employeeId: string; locationId: string; balanceDays: number; lastHcmSequence: number }>,
    cursor: number,
    lastSuccessfulSyncAt: Date,
    chunkSize = 500,
  ): Promise<void> {
    await executeExclusiveTransaction(this.prisma, async (prisma) => {
      for (let i = 0; i < records.length; i += chunkSize) {
        const chunk = records.slice(i, i + chunkSize);
        for (const r of chunk) {
          await prisma.balanceCache.upsert({
            where: { employeeId_locationId: { employeeId: r.employeeId, locationId: r.locationId } },
            create: {
              employeeId: r.employeeId,
              locationId: r.locationId,
              balanceDays: r.balanceDays,
              lastHcmSequence: r.lastHcmSequence,
              lastSyncedAt: lastSuccessfulSyncAt,
            },
            update: {
              balanceDays: r.balanceDays,
              lastHcmSequence: r.lastHcmSequence,
              lastSyncedAt: lastSuccessfulSyncAt,
            },
          });
        }
      }

      await prisma.syncState.upsert({
        where: { id: 'singleton' },
        create: { id: 'singleton', globalCursor: cursor, lastSuccessfulSyncAt },
        update: { globalCursor: cursor, lastSuccessfulSyncAt },
      });
    });
  }

  async upsertSyncState(cursor: number, lastSuccessfulSyncAt: Date): Promise<void> {
    await this.prisma.syncState.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', globalCursor: cursor, lastSuccessfulSyncAt },
      update: { globalCursor: cursor, lastSuccessfulSyncAt },
    });
  }
}
