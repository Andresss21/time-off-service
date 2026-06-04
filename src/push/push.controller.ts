import { Controller, Post, Body } from '@nestjs/common';

import { RawBody } from '../common/decorators';
import { PushService } from './push.service';
import { HcmWebhook } from './hcm-webhook.decorator';
import { HcmPushDto } from './dto/hcm-push.dto';

@Controller('hcm/push')
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Post()
  @HcmWebhook()
  async handlePush(
    @RawBody() rawBody: Buffer,
    @Body() dto: HcmPushDto,
  ): Promise<void> {
    void rawBody; // rawBody is consumed by HmacVerificationGuard via request.rawBody
    await this.pushService.handlePush(dto);
  }
}
