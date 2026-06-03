import { HttpException } from '@nestjs/common';

export abstract class HttpAppException extends HttpException {
  constructor(
    response: string | Record<string, unknown>,
    status: number,
    public readonly internalContext?: Record<string, unknown>,
  ) {
    super(response, status);
  }
}
