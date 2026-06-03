import { Injectable } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import { SecurityException } from './security.exception';
import { DomainException } from './domain.exception';
import { InfrastructureException } from './infrastructure.exception';
import { IntegrityException } from './integrity.exception';

@Injectable()
export class ErrorFactory {
  unauthorized(internalReason: string): SecurityException {
    return new SecurityException({ error: 'Unauthorized' }, HttpStatus.UNAUTHORIZED, { reason: internalReason });
  }

  badRequest(internalReason: string): SecurityException {
    return new SecurityException({ error: 'Bad Request' }, HttpStatus.BAD_REQUEST, { reason: internalReason });
  }

  notFound(resource: string, identifier: string): DomainException {
    return new DomainException(HttpStatus.NOT_FOUND, 'NOT_FOUND', `${resource} '${identifier}' not found`);
  }

  conflict(message: string, code?: string): DomainException {
    return new DomainException(HttpStatus.CONFLICT, code ?? 'CONFLICT', message);
  }

  preValidationFailed(context: Record<string, unknown>): DomainException {
    return new DomainException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'REJECTED_PRE_VALIDATION',
      'Insufficient available balance',
      context,
    );
  }

  integrityViolation(severity: 'HIGH' | 'LOW', context: Record<string, unknown>): IntegrityException {
    return new IntegrityException(severity, context);
  }

  databaseError(cause: unknown): InfrastructureException {
    return new InfrastructureException(HttpStatus.SERVICE_UNAVAILABLE, 'Database error', { cause: String(cause) });
  }

  externalServiceUnavailable(service: string, cause: unknown): InfrastructureException {
    return new InfrastructureException(HttpStatus.SERVICE_UNAVAILABLE, `External service unavailable: ${service}`, {
      service,
      cause: String(cause),
    });
  }
}
