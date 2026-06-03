import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const RawBody = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): Buffer => {
    const request = ctx.switchToHttp().getRequest<{ rawBody?: Buffer }>();
    if (!request.rawBody) {
      throw new Error(
        'rawBody is not available. Ensure NestFactory.create() was called with { rawBody: true }.',
      );
    }
    return request.rawBody;
  },
);
