import { registerAs } from '@nestjs/config';
import { CronExpression } from '@nestjs/schedule';

export const auditConfig = registerAs('audit', () => ({
  retentionDays:       parseInt(process.env.AUDIT_RETENTION_DAYS ?? '365', 10),
  archiveCronSchedule: process.env.AUDIT_ARCHIVE_CRON ?? CronExpression.EVERY_DAY_AT_3AM,
  activeWindowDays:    parseInt(process.env.AUDIT_ACTIVE_DAYS ?? '90', 10),
}));
