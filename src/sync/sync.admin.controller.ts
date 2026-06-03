import { Controller, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'node:crypto';

import { AdminOnly } from '../common/guards';
import { SYNC_IMMEDIATE_REQUESTED } from './sync.events';

@AdminOnly()
@Controller('admin/sync')
export class SyncAdminController {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  @Post('trigger')
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerSync(): Promise<{ syncRunId: string; triggeredAt: string }> {
    const syncRunId = randomUUID();
    const triggeredAt = new Date().toISOString();
    this.eventEmitter.emit(SYNC_IMMEDIATE_REQUESTED, { syncRunId });
    return { syncRunId, triggeredAt };
  }
}
