import { Injectable, Logger, OnModuleInit, Inject } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../database';
import { auditConfig } from '../common/config';
import { AuditEvent } from '../common/types';
import { AuditQueryDto } from './dto/audit-query.dto';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export interface AuditLogRecord {
  id:              string;
  eventType:       string;
  occurredAt:      Date;
  severity:        string;
  sourceSubsystem: string;
  context:         Record<string, unknown>;
}

@Injectable()
export class AuditService implements OnModuleInit {
  private static readonly RETRY_DELAYS_MS = [50, 200, 500];
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(auditConfig.KEY)
    private readonly config: ConfigType<typeof auditConfig>,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  async onModuleInit(): Promise<void> {
    const job = new CronJob(
      this.config.archiveCronSchedule,
      () => {
        this.runArchival().catch((err) =>
          this.logger.error({ message: 'Audit archival job threw unexpectedly', err }),
        );
      },
    );
    this.schedulerRegistry.addCronJob('audit-archival', job);
    job.start();
  }

  async record(event: AuditEvent): Promise<void> {
    const maxAttempts = AuditService.RETRY_DELAYS_MS.length + 1;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        await this.prisma.auditLog.create({ data: this.mapEventToRecord(event) });
        return;
      } catch (err) {
        if (attempt < maxAttempts - 1) {
          await sleep(AuditService.RETRY_DELAYS_MS[attempt]);
          continue;
        }
        const isSevere =
          event.severity === 'CRITICAL' || event.severity === 'HIGH';
        this.logger[isSevere ? 'fatal' : 'error']({
          message: 'Audit log write failed after all retries — event may be lost',
          eventType: event.eventType,
          severity:  event.severity,
          attempts:  maxAttempts,
        });
      }
    }
  }

  async query(
    params: AuditQueryDto,
  ): Promise<{ items: AuditLogRecord[]; nextCursor: string | null }> {
    const limit = Math.min(params.limit ?? 50, 100);

    const conditions: Prisma.AuditLogWhereInput[] = [];
    if (params.severity)        conditions.push({ severity: params.severity });
    if (params.eventType)       conditions.push({ eventType: params.eventType });
    if (params.employeeId)      conditions.push({ employeeId: params.employeeId });
    if (params.occurredAtSince) conditions.push({ occurredAt: { gte: new Date(params.occurredAtSince) } });
    if (params.occurredAtUntil) conditions.push({ occurredAt: { lte: new Date(params.occurredAtUntil) } });

    if (params.cursor) {
      const { occurredAt, id } = JSON.parse(
        Buffer.from(params.cursor, 'base64').toString('utf8'),
      ) as { occurredAt: string; id: string };
      const cursorDate = new Date(occurredAt);
      conditions.push({
        OR: [
          { occurredAt: { lt: cursorDate } },
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore Prisma accepts exact DateTime match with additional field filters
          { occurredAt: cursorDate, id: { lt: id } },
        ],
      });
    }

    const rows = await this.prisma.auditLog.findMany({
      where: conditions.length > 0 ? { AND: conditions } : {},
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    let nextCursor: string | null = null;
    if (rows.length > limit) {
      rows.pop();
      const last = rows[rows.length - 1];
      nextCursor = Buffer.from(
        JSON.stringify({ occurredAt: last.occurredAt.toISOString(), id: last.id }),
      ).toString('base64');
    }

    const items: AuditLogRecord[] = rows.map((row) => ({
      id:              row.id,
      eventType:       row.eventType,
      occurredAt:      row.occurredAt,
      severity:        row.severity,
      sourceSubsystem: row.sourceSubsystem,
      context:         JSON.parse(row.context) as Record<string, unknown>,
    }));

    return { items, nextCursor };
  }

  async runArchival(): Promise<void> {
    const jobId = randomUUID();
    try {
      this.logger.log({ message: 'Audit archival job started', jobId });

      const activeCutoff = new Date(
        Date.now() - this.config.activeWindowDays * 24 * 60 * 60 * 1000,
      );
      const archiveResult = await this.prisma.auditLog.updateMany({
        where: { archivedAt: null, occurredAt: { lt: activeCutoff } },
        data:  { archivedAt: new Date() },
      });
      this.logger.log({
        message: 'Audit records soft-archived',
        jobId,
        count: archiveResult.count,
      });

      const expiryCutoff = new Date(
        Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1000,
      );
      const deleteResult = await this.prisma.auditLog.deleteMany({
        where: { archivedAt: { lt: expiryCutoff } },
      });
      this.logger.log({
        message: 'Expired audit records deleted',
        jobId,
        count: deleteResult.count,
      });

      this.logger.log({ message: 'Audit archival job completed', jobId });
    } catch (err) {
      this.logger.error({ message: 'Audit archival job failed', jobId, err });
    }
  }

  private mapEventToRecord(event: AuditEvent) {
    const baseKeys = new Set(['eventType', 'occurredAt', 'severity', 'sourceSubsystem']);
    const context: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(event)) {
      if (!baseKeys.has(k)) context[k] = v;
    }

    return {
      eventType:       event.eventType,
      occurredAt:      new Date(event.occurredAt),
      severity:        event.severity,
      sourceSubsystem: event.sourceSubsystem,
      employeeId:      typeof context['employeeId'] === 'string' ? context['employeeId'] : undefined,
      requestId:       typeof context['requestId']  === 'string' ? context['requestId']  : undefined,
      context:         JSON.stringify(context),
    };
  }
}
