import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClsModule } from 'nestjs-cls';
import { LoggerModule } from 'nestjs-pino';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import * as crypto from 'crypto';

@Module({
  imports: [
    // Global infrastructure — initialization order matters
    ConfigModule.forRoot({ isGlobal: true }),
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        generateId: true,
        idGenerator: () => crypto.randomUUID(),
      },
    }),
    LoggerModule.forRootAsync({
      useFactory: () => ({
        pinoHttp: { level: process.env.LOG_LEVEL ?? 'info' },
      }),
    }),
    EventEmitterModule.forRoot({ global: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      useFactory: () => [{ ttl: 60000, limit: 120 }],
    }),

    // Phase 1 — DatabaseModule, AuditModule (added in story-shared-infrastructure)
    // Phase 3 — HealthModule
    // Phase 4 — HcmClientModule
    // Phase 5 — BalanceModule
    // Phase 6 — SyncModule
    // Phase 7 — TimeOffModule
    // Phase 8 — ReconciliationModule
    // Phase 9 — PushModule
  ],
  providers: [
    // Phase 1 — APP_FILTER (x4), APP_INTERCEPTOR, APP_GUARD (x2), ErrorFactory
    // (added in story-shared-infrastructure)
  ],
})
export class AppModule {}
