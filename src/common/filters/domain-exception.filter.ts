import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import { Response, Request } from 'express';
import { ClsService } from 'nestjs-cls';
import { DomainException } from '../errors/domain.exception';

@Catch(DomainException)
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  constructor(private readonly cls: ClsService) {}

  catch(exception: DomainException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const statusCode = exception.getStatus();

    this.logger.log({
      requestId: this.cls.getId(),
      method: request.method,
      path: request.url,
      statusCode,
      internalContext: exception.internalContext,
    });

    response.status(statusCode).json(exception.getResponse());
  }
}
