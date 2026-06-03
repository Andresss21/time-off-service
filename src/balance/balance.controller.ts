import { Controller, Get, Param } from '@nestjs/common';

import { BalanceService } from './balance.service';
import { BalanceParamsDto } from './dto/balance-params.dto';

@Controller('balances')
export class BalanceController {
  constructor(private readonly balanceService: BalanceService) {}

  @Get(':employeeId/:locationId')
  async getBalance(@Param() params: BalanceParamsDto) {
    return this.balanceService.getEffectiveBalance(params.employeeId, params.locationId);
  }
}
