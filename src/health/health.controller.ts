import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckResult, HealthCheckService } from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';

import { Public } from '../common/guards';
import { SkipInterceptors } from '../common/interceptors';
import { SqliteHealthIndicator } from './sqlite-health.indicator';

@Controller('health')
@Public()
@SkipThrottle()
@SkipInterceptors()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly sqliteIndicator: SqliteHealthIndicator,
  ) {}

  @Get('live')
  @HealthCheck()
  liveness(): Promise<HealthCheckResult> {
    return this.health.check([]);
  }

  @Get('ready')
  @HealthCheck()
  readiness(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.sqliteIndicator.isHealthy('sqlite'),
      () => this.sqliteIndicator.checkServiceInfo('serviceInfo'),
    ]);
  }
}
