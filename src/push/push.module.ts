import { Module } from '@nestjs/common';

import { SyncModule } from '../sync';
import { ErrorFactory } from '../common/errors';
import { PushController } from './push.controller';
import { PushService } from './push.service';
import {
  TimestampCheckGuard,
  HmacVerificationGuard,
  PushSchemaValidationGuard,
} from './guards';

@Module({
  imports: [SyncModule],
  controllers: [PushController],
  providers: [
    ErrorFactory,
    PushService,
    TimestampCheckGuard,
    HmacVerificationGuard,
    PushSchemaValidationGuard,
  ],
})
export class PushModule {}
