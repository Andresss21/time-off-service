import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Response, Request } from 'express';
import { ClsService } from 'nestjs-cls';
import { IntegrityException } from '../errors/integrity.exception';

@Catch()
export class FallbackExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(FallbackExceptionFilter.name);

  constructor(private readonly cls: ClsService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = this.cls.getId();

    if (exception instanceof IntegrityException) {
      this.logger.error({
        message: 'Unhandled IntegrityException reached global filter — defect',
        requestId,
        method: request.method,
        path: request.url,
        severity: exception.severity,
        context: exception.context,
      });
      response.status(500).json({ error: 'Internal Server Error' });
      return;
    }

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      this.logger.warn({
        requestId,
        method: request.method,
        path: request.url,
        statusCode,
      });
      response.status(statusCode).json(exception.getResponse());
      return;
    }

    const err = exception instanceof Error ? exception : new Error(String(exception));
    this.logger.error({
      requestId,
      method: request.method,
      path: request.url,
      message: err.message,
    });
    response.status(500).json({ error: 'Internal Server Error' });
  }
}
