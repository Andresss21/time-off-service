import { Controller, Get, Post, Body, Headers, Param, HttpCode, Res } from '@nestjs/common';
import { Response } from 'express';

import { TimeOffService } from './time-off.service';
import { CreateTimeOffRequestDto } from './dto/create-time-off-request.dto';
import { TimeOffParamsDto } from './dto/time-off-params.dto';

@Controller()
export class TimeOffController {
  constructor(private readonly timeOffService: TimeOffService) {}

  @Post('time-off-requests')
  @HttpCode(201)
  async submit(
    @Headers('Idempotency-Key') idempotencyKey: string,
    @Body() dto: CreateTimeOffRequestDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { data, isNew } = await this.timeOffService.submitRequest(dto, idempotencyKey);
    if (!isNew) {
      res.status(200);
    }
    return data;
  }

  @Get('time-off-requests/:requestId')
  async getStatus(@Param() params: TimeOffParamsDto) {
    return this.timeOffService.getRequestById(params.requestId);
  }
}
