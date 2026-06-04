import { Injectable, CanActivate, ExecutionContext, Inject } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import * as crypto from 'crypto';
import { Request } from 'express';

import { AuditService } from '../../audit';
import { ErrorFactory } from '../../common/errors';
import { hcmConfig } from '../../common/config';
import {
  AuditEventType,
  AuditEventSeverity,
  AuditEventSourceSubsystem,
} from '../../common/types';

type RawBodyRequest = Request & { rawBody?: Buffer };

@Injectable()
export class HmacVerificationGuard implements CanActivate {
  constructor(
    private readonly auditService: AuditService,
    private readonly errorFactory: ErrorFactory,
    @Inject(hcmConfig.KEY) private readonly hcm: ConfigType<typeof hcmConfig>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RawBodyRequest>();

    // Misconfiguration path — fail loudly so the operator notices immediately
    if (!Buffer.isBuffer(request.rawBody)) {
      throw new Error(
        'rawBody not available — ensure NestFactory.create() was called with { rawBody: true }',
      );
    }

    const timestampHeader = request.headers['x-hcm-timestamp'];
    const signatureHeader = request.headers['x-hcm-signature'];
    const timestamp = Array.isArray(timestampHeader) ? timestampHeader[0] : timestampHeader;
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;

    if (!timestamp || !signature) {
      await this.reject(request);
    }

    // Validate signature format
    if (!signature!.startsWith('sha256=')) {
      await this.reject(request);
    }

    const receivedHex = signature!.slice(7); // strip 'sha256='

    // Pre-check length: SHA-256 produces 32 bytes = 64 hex chars
    // If different length, reject immediately without calling timingSafeEqual
    if (receivedHex.length !== 64) {
      await this.reject(request);
    }

    // Reconstruct signed message: {timestamp}\n{rawBody}
    const signedMessage = Buffer.concat([
      Buffer.from(timestamp!, 'utf8'),
      Buffer.from('\n', 'utf8'),
      request.rawBody,
    ]);

    // Compute HMAC-SHA256 — digest value is NEVER logged
    const computedHex = crypto
      .createHmac('sha256', this.hcm.webhookSecret)
      .update(signedMessage)
      .digest('hex');

    const computedBuf = Buffer.from(computedHex, 'hex');
    const receivedBuf = Buffer.from(receivedHex, 'hex');

    if (!crypto.timingSafeEqual(computedBuf, receivedBuf)) {
      await this.reject(request);
    }

    return true;
  }

  private async reject(request: RawBodyRequest): Promise<never> {
    const sourceIp = request.ip ?? (request.socket?.remoteAddress ?? null);
    const contentLengthHeader = request.headers['content-length'];
    const requestContentLength = contentLengthHeader
      ? parseInt(contentLengthHeader, 10) || 0
      : 0;

    await this.auditService.record({
      eventType: AuditEventType.PUSH_SIGNATURE_INVALID,
      occurredAt: new Date().toISOString(),
      severity: AuditEventSeverity.HIGH,
      sourceSubsystem: AuditEventSourceSubsystem.PUSH_VERIFICATION,
      sourceIp: sourceIp ?? null,
      requestContentLength,
      rejectionGate: 'Gate 2',
      // CRITICAL: computed digest and received digest values are never included here
    });
    throw this.errorFactory.unauthorized('push_signature_invalid');
  }
}
