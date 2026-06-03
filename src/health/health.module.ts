import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { HealthController } from './health.controller';
import { SqliteHealthIndicator } from './sqlite-health.indicator';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [SqliteHealthIndicator],
})
export class HealthModule {}
