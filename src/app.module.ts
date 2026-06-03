import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClsModule } from 'nestjs-cls';
import { LoggerModule } from 'nestjs-pino';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import * as crypto from 'crypto';

import { validateEnv } from './common/config';
import { DatabaseModule } from './database';
import { AuditModule } from './audit';
import { HealthModule } from './health';
import { BalanceModule } from './balance';
import { SyncModule } from './sync';
import {
  FallbackExceptionFilter,
  InfrastructureExceptionFilter,
  DomainExceptionFilter,
  SecurityExceptionFilter,
} from './common/filters';
import { ResponseEnvelopeInterceptor } from './common/interceptors';
import { ApiKeyThrottlerGuard, GlobalAuthGuard } from './common/guards';
import { ErrorFactory } from './common/errors';
import { hcmConfig, auditConfig, throttlerConfig } from './common/config';

@Module({
  imports: [
    // Global infrastructure — initialization order matters
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      load: [hcmConfig, auditConfig, throttlerConfig],
    }),
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        generateId: true,
        idGenerator: () => crypto.randomUUID(),
      },
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        pinoHttp: {
          level: configService.get<string>('LOG_LEVEL') ?? 'info',
          base: { service: 'time-off-service' },
          customLogLevel: (req: { url?: string }, res: { statusCode: number }, err: unknown) => {
            if (req.url?.startsWith('/health')) {
              if (res.statusCode >= 500) return 'error';
              if (res.statusCode >= 400) return 'warn';
              return 'debug';
            }
            if (res.statusCode >= 500 || err) return 'error';
            if (res.statusCode >= 400) return 'warn';
            return 'info';
          },
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers["x-api-key"]',
              'req.headers["x-hcm-signature"]',
            ],
            censor: '[REDACTED]',
          },
          serializers: {
            req: (req: { method: string; url?: string }) => {
              const serialized = { method: req.method, url: req.url };
              if (req.url?.startsWith('/hcm/push')) {
                return { ...serialized, body: '[REDACTED]' };
              }
              return serialized;
            },
          },
        },
      }),
    }),
    EventEmitterModule.forRoot({ global: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      useFactory: () => [{ ttl: 60000, limit: 120 }],
    }),

    // Phase 1 — Database
    DatabaseModule,

    // Phase 2 — AuditModule
    AuditModule,

    // Phase 3 — HealthModule
    HealthModule,

    // Phase 4 — HcmClientModule
    // Phase 5 — BalanceModule
    BalanceModule,
    // Phase 6 — SyncModule
    SyncModule,
    // Phase 7 — TimeOffModule
    // Phase 8 — ReconciliationModule
    // Phase 9 — PushModule
  ],
  providers: [
    // Exception filters (registered in reverse; SecurityExceptionFilter evaluated first)
    { provide: APP_FILTER, useClass: FallbackExceptionFilter },
    { provide: APP_FILTER, useClass: InfrastructureExceptionFilter },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
    { provide: APP_FILTER, useClass: SecurityExceptionFilter },

    // Interceptors
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },

    // Guards (evaluated in registration order: throttle before auth)
    { provide: APP_GUARD, useClass: ApiKeyThrottlerGuard },
    { provide: APP_GUARD, useClass: GlobalAuthGuard },

    // Global shared providers
    ErrorFactory,
  ],
})
export class AppModule {}
