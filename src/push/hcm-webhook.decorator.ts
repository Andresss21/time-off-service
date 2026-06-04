import {
  applyDecorators,
  UseGuards,
  UsePipes,
  ValidationPipe,
  HttpException,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

import { Public } from '../common/guards';
import { SkipInterceptors } from '../common/interceptors';
import {
  TimestampCheckGuard,
  HmacVerificationGuard,
  PushSchemaValidationGuard,
} from './guards';

export const HcmWebhook = () =>
  applyDecorators(
    Public(),
    SkipThrottle(),
    HttpCode(HttpStatus.OK),
    UseGuards(TimestampCheckGuard, HmacVerificationGuard, PushSchemaValidationGuard),
    SkipInterceptors(),
    UsePipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        exceptionFactory: () =>
          new HttpException({ error: 'Bad Request' }, HttpStatus.BAD_REQUEST),
      }),
    ),
  );
