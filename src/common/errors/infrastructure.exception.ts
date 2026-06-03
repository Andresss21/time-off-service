import { HttpStatus } from '@nestjs/common';
import { HttpAppException } from './http-app.exception';

export class InfrastructureException extends HttpAppException {
  constructor(
    status: HttpStatus.SERVICE_UNAVAILABLE | HttpStatus.INTERNAL_SERVER_ERROR,
    message: string,
    internalContext?: Record<string, unknown>,
  ) {
    super(message, status, internalContext);
  }
}
