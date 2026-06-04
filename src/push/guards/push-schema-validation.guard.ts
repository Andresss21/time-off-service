import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { Request } from 'express';

import { AuditService } from '../../audit';
import { ErrorFactory } from '../../common/errors';
import {
  AuditEventType,
  AuditEventSeverity,
  AuditEventSourceSubsystem,
} from '../../common/types';
import { HcmPushDto } from '../dto/hcm-push.dto';

@Injectable()
export class PushSchemaValidationGuard implements CanActivate {
  constructor(
    private readonly auditService: AuditService,
    private readonly errorFactory: ErrorFactory,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const dto = plainToInstance(HcmPushDto, request.body);
    const errors = await validate(dto, { whitelist: true });

    if (errors.length > 0) {
      const sanitizedFailureDescription = this.buildSanitizedDescription(errors);
      await this.auditService.record({
        eventType: AuditEventType.PUSH_SCHEMA_INVALID,
        occurredAt: new Date().toISOString(),
        severity: AuditEventSeverity.MEDIUM,
        sourceSubsystem: AuditEventSourceSubsystem.PUSH_VERIFICATION,
        sanitizedFailureDescription,
        rejectionGate: 'Gate 3',
      });
      throw this.errorFactory.badRequest('push_schema_invalid');
    }

    return true;
  }

  private buildSanitizedDescription(errors: ValidationError[]): string {
    const parts: string[] = [];

    for (const error of errors) {
      if (error.children && error.children.length > 0) {
        // Array field (records or entries) — descend into array-index children
        for (const indexError of error.children) {
          if (indexError.children && indexError.children.length > 0) {
            for (const fieldError of indexError.children) {
              parts.push(
                `invalid field: ${fieldError.property} in ${error.property}[${indexError.property}]`,
              );
            }
          } else if (indexError.constraints) {
            parts.push(
              `invalid field: ${error.property}[${indexError.property}]`,
            );
          }
          if (parts.length >= 5) break;
        }
      } else if (error.constraints) {
        const constraintKeys = Object.keys(error.constraints);
        parts.push(`invalid field: ${error.property} (${constraintKeys[0]})`);
      }
      if (parts.length >= 5) break;
    }

    return parts.length > 0 ? parts.join('; ') : 'schema validation failed';
  }
}
