import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SchedulerRegistry, CronExpression } from '@nestjs/schedule';
import { CronJob } from 'cron';

import { PrismaService } from '../database';
import { executeExclusiveTransaction } from '../database';
import { AuditService } from '../audit';
import { HcmClientService, HcmLedgerEntry, HcmBalanceRecord, HcmBalancesFullResponse, HcmBalancesDeltaResponse } from '../hcm-client/hcm-client.service';
import { AuditEventType, AuditEventSeverity, AuditEventSourceSubsystem } from '../common/types';
import { SyncRepository } from './sync.repository';
import { SYNC_IMMEDIATE_REQUESTED } from './sync.events';

@Injectable()
export class SyncService implements OnModuleInit {
  private readonly logger = new Logger(SyncService.name);
  private isRunning = false;

  constructor(
    private readonly syncRepository: SyncRepository,
    private readonly hcmClientService: HcmClientService,
    private readonly auditService: AuditService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    const job = new CronJob(CronExpression.EVERY_30_SECONDS, () => {
      this.runScheduledCycle().catch((err) =>
        this.logger.error({ err }, 'sync scheduled cycle threw an unhandled error'),
      );
    });
    this.schedulerRegistry.addCronJob('sync-delta-poll', job);
    job.start();
  }

  async runStartupSync(): Promise<void> {
    const cursor = await this.syncRepository.readGlobalCursor();

    if (cursor === null) {
      const response = await this.hcmClientService.getBalances();
      const fullData = response.data as HcmBalancesFullResponse;
      const records = fullData.records;
      const newCursor = Math.max(...records.map((r) => r.lastSequence));
      await this.syncRepository.upsertBalanceCacheChunked(
        records.map((r) => ({
          employeeId: r.employeeId,
          locationId: r.locationId,
          balanceDays: r.balanceDays,
          lastHcmSequence: r.lastSequence,
        })),
        newCursor,
        new Date(),
      );
      this.logger.log({ recordCount: records.length, newCursor }, 'startup sync: full corpus pull complete');
    } else {
      const response = await this.hcmClientService.getBalances(cursor);
      const deltaData = response.data as HcmBalancesDeltaResponse;
      const entries = deltaData.entries;
      await this.applyLedgerEvents(entries, cursor);
      this.logger.log({ entryCount: entries.length, cursor }, 'startup sync: delta sync complete');
    }
  }

  async applyLedgerEvents(entries: HcmLedgerEntry[], since: number): Promise<void> {
    const invalidResets = entries.filter(
      (e) => e.type === 'RESET' && e.setTo !== undefined && e.setTo < 0,
    );

    for (const entry of invalidResets) {
      await this.auditService.record({
        eventType: AuditEventType.SYNC_RESET_INVALID,
        occurredAt: new Date().toISOString(),
        severity: AuditEventSeverity.MEDIUM,
        sourceSubsystem: AuditEventSourceSubsystem.SYNC_ENGINE,
        employeeId: entry.employeeId,
        locationId: entry.locationId,
        presentedSetTo: entry.setTo as number,
        ledgerSequence: entry.sequence,
      });
    }

    const newCursor =
      entries.length > 0
        ? Math.max(since, ...entries.map((e) => e.sequence))
        : since;

    const validEntries = entries.filter(
      (e) => !(e.type === 'RESET' && e.setTo !== undefined && e.setTo < 0),
    );

    await executeExclusiveTransaction(this.prisma, async (prisma) => {
      const now = new Date();
      for (const entry of validEntries) {
        if (entry.type === 'RESET') {
          await prisma.balanceCache.upsert({
            where: { employeeId_locationId: { employeeId: entry.employeeId, locationId: entry.locationId } },
            create: {
              employeeId: entry.employeeId,
              locationId: entry.locationId,
              balanceDays: entry.setTo as number,
              lastHcmSequence: entry.sequence,
              lastSyncedAt: now,
            },
            update: {
              balanceDays: entry.setTo as number,
              lastHcmSequence: entry.sequence,
              lastSyncedAt: now,
            },
          });
        } else {
          await prisma.balanceCache.upsert({
            where: { employeeId_locationId: { employeeId: entry.employeeId, locationId: entry.locationId } },
            create: {
              employeeId: entry.employeeId,
              locationId: entry.locationId,
              balanceDays: entry.delta as number,
              lastHcmSequence: entry.sequence,
              lastSyncedAt: now,
            },
            update: {
              balanceDays: { increment: entry.delta as number },
              lastHcmSequence: entry.sequence,
              lastSyncedAt: now,
            },
          });
        }
        // No branching on entry.source — all sources processed identically (FM-14)
      }

      await prisma.syncState.upsert({
        where: { id: 'singleton' },
        create: { id: 'singleton', globalCursor: newCursor, lastSuccessfulSyncAt: now },
        update: { globalCursor: newCursor, lastSuccessfulSyncAt: now },
      });
    });

    this.logger.log(
      { entriesApplied: validEntries.length, newCursor, since },
      'ledger events applied',
    );
  }

  async readGlobalCursor(): Promise<number | null> {
    return this.syncRepository.readGlobalCursor();
  }

  async applyCorpusPush(records: HcmBalanceRecord[]): Promise<void> {
    const newCursor = Math.max(...records.map((r) => r.lastSequence));
    await this.syncRepository.upsertBalanceCacheChunked(
      records.map((r) => ({
        employeeId: r.employeeId,
        locationId: r.locationId,
        balanceDays: r.balanceDays,
        lastHcmSequence: r.lastSequence,
      })),
      newCursor,
      new Date(),
    );
  }

  @OnEvent(SYNC_IMMEDIATE_REQUESTED)
  async handleImmediateSyncRequested(_payload: { syncRunId: string }): Promise<void> {
    await this.runScheduledCycle();
  }

  private async runScheduledCycle(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('sync cycle skipped — previous cycle still in progress');
      return;
    }
    this.isRunning = true;
    try {
      const cursor = await this.syncRepository.readGlobalCursor();
      if (cursor === null) {
        await this.runStartupSync();
        return;
      }
      const response = await this.hcmClientService.getBalances(cursor);
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers['retry-after'] ?? '30', 10);
        this.logger.warn(
          { retryAfterSeconds: retryAfter, cursor },
          'sync cycle skipped — HCM returned 429 (FM-06)',
        );
        return;
      }
      const deltaData = response.data as HcmBalancesDeltaResponse;
      await this.applyLedgerEvents(deltaData.entries ?? [], cursor);
    } finally {
      this.isRunning = false;
    }
  }
}
