import { Module } from '@nestjs/common';

import { BalanceController } from './balance.controller';
import { BalanceService } from './balance.service';
import { ErrorFactory } from '../common/errors';

@Module({
  controllers: [BalanceController],
  providers: [BalanceService, ErrorFactory],
})
export class BalanceModule {}
