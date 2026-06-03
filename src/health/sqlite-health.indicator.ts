import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { PrismaService } from '../database';

@Injectable()
export class SqliteHealthIndicator extends HealthIndicator {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('SELECT 1 timeout after 500ms')), 500),
        ),
      ]);
      return this.getStatus(key, true);
    } catch (err) {
      return this.getStatus(key, false, {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async checkServiceInfo(key: string): Promise<HealthIndicatorResult> {
    let lastSuccessfulSyncAt: string | null = null;
    try {
      const syncState = await this.prisma.syncState.findUnique({
        where: { id: 'singleton' },
      });
      lastSuccessfulSyncAt = syncState?.lastSuccessfulSyncAt?.toISOString() ?? null;
    } catch {
      // DB read failure must not fail this indicator
    }
    return this.getStatus(key, true, {
      serviceVersion:
        process.env.SERVICE_VERSION ?? process.env.npm_package_version ?? 'unknown',
      uptimeSeconds: Math.round(process.uptime()),
      lastSuccessfulSyncAt,
    });
  }
}
