import { Module } from '@nestjs/common';

import { HcmClientModule } from '../hcm-client';
import { ErrorFactory } from '../common/errors';
import { TimeOffController } from './time-off.controller';
import { TimeOffService } from './time-off.service';
import { TimeOffRepository } from './time-off.repository';

@Module({
  imports: [HcmClientModule],
  controllers: [TimeOffController],
  providers: [TimeOffService, TimeOffRepository, ErrorFactory],
})
export class TimeOffModule {}
