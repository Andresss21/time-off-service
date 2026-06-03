import { HttpStatus } from '@nestjs/common';
import { HttpAppException } from './http-app.exception';

export class SecurityException extends HttpAppException {
  private readonly opaqueBody: Record<string, string>;

  constructor(
    opaqueBody: { error: string },
    status: HttpStatus.UNAUTHORIZED | HttpStatus.BAD_REQUEST,
    internalContext?: Record<string, unknown>,
  ) {
    super(opaqueBody, status, internalContext);
    this.opaqueBody = opaqueBody;
  }

  override getResponse(): Record<string, string> {
    return this.opaqueBody;
  }
}
