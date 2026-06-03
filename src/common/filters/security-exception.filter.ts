import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import { Response, Request } from 'express';
import { ClsService } from 'nestjs-cls';
import { SecurityException } from '../errors/security.exception';

@Catch(SecurityException)
export class SecurityExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SecurityExceptionFilter.name);

  constructor(private readonly cls: ClsService) {}

  catch(exception: SecurityException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const statusCode = exception.getStatus();

    this.logger.warn({
      requestId: this.cls.getId(),
      method: request.method,
      path: request.url,
      statusCode,
    });

    response.status(statusCode).json(exception.getResponse());
  }
}
