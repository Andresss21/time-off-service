import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

import { AuditService } from '../../audit';
import { ErrorFactory } from '../../common/errors';
import {
  AuditEventType,
  AuditEventSeverity,
  AuditEventSourceSubsystem,
} from '../../common/types';

@Injectable()
export class TimestampCheckGuard implements CanActivate {
  constructor(
    private readonly auditService: AuditService,
    private readonly errorFactory: ErrorFactory,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const headerValue = request.headers['x-hcm-timestamp'];
    const timestampStr = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    const serverNow = Date.now();

    if (!timestampStr) {
      await this.rejectMissing(serverNow);
    }

    const presentedTimestamp = parseInt(timestampStr!, 10);

    if (isNaN(presentedTimestamp)) {
      await this.rejectMissing(serverNow);
    }

    const deviationMs = Math.abs(serverNow - presentedTimestamp);
    if (deviationMs > 300_000) {
      await this.auditService.record({
        eventType: AuditEventType.PUSH_REPLAY_DETECTED,
        occurredAt: new Date().toISOString(),
        severity: AuditEventSeverity.HIGH,
        sourceSubsystem: AuditEventSourceSubsystem.PUSH_VERIFICATION,
        presentedTimestamp,
        serverTimeAtRejection: serverNow,
        deviationMs,
        rejectionGate: 'Gate 1',
      });
      throw this.errorFactory.unauthorized('push_replay_detected');
    }

    return true;
  }

  private async rejectMissing(serverNow: number): Promise<never> {
    await this.auditService.record({
      eventType: AuditEventType.PUSH_REPLAY_DETECTED,
      occurredAt: new Date().toISOString(),
      severity: AuditEventSeverity.HIGH,
      sourceSubsystem: AuditEventSourceSubsystem.PUSH_VERIFICATION,
      presentedTimestamp: 0,
      serverTimeAtRejection: serverNow,
      deviationMs: serverNow,
      rejectionGate: 'Gate 1',
    });
    throw this.errorFactory.unauthorized('push_replay_detected');
  }
}
