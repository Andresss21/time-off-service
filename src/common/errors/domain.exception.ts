import { HttpStatus } from '@nestjs/common';
import { HttpAppException } from './http-app.exception';

export class DomainException extends HttpAppException {
  constructor(
    status: HttpStatus,
    public readonly code: string,
    message: string,
    internalContext?: Record<string, unknown>,
  ) {
    super({ code, message }, status, internalContext);
  }
}
