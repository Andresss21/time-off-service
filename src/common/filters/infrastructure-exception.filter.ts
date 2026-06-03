import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import { Response, Request } from 'express';
import { ClsService } from 'nestjs-cls';
import { InfrastructureException } from '../errors/infrastructure.exception';

@Catch(InfrastructureException)
export class InfrastructureExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(InfrastructureExceptionFilter.name);

  constructor(private readonly cls: ClsService) {}

  catch(exception: InfrastructureException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const statusCode = exception.getStatus();

    const body =
      statusCode === 503
        ? { error: 'Service Unavailable' }
        : { error: 'Internal Server Error' };

    this.logger.error({
      requestId: this.cls.getId(),
      method: request.method,
      path: request.url,
      statusCode,
      internalContext: exception.internalContext,
    });

    response.status(statusCode).json(body);
  }
}
