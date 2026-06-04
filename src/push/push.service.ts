import { Injectable, Logger } from '@nestjs/common';

import { SyncService } from '../sync';
import { HcmLedgerEntry } from '../hcm-client/hcm-client.service';
import { HcmPushDto } from './dto/hcm-push.dto';

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(private readonly syncService: SyncService) {}

  async handlePush(dto: HcmPushDto): Promise<void> {
    const globalCursor = await this.syncService.readGlobalCursor();

    if (dto.records && dto.records.length > 0) {
      const maxLastSequence = Math.max(...dto.records.map((r) => r.lastSequence));

      if (globalCursor !== null && maxLastSequence < globalCursor) {
        this.logger.warn({
          reason: 'stale_push_skipped',
          pushMaxSequence: maxLastSequence,
          globalCursor,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      await this.syncService.applyCorpusPush(dto.records);
    } else if (dto.entries && dto.entries.length > 0) {
      const maxSequence = Math.max(...dto.entries.map((e) => e.sequence));
      const since = globalCursor ?? 0;

      if (globalCursor !== null && maxSequence < globalCursor) {
        this.logger.warn({
          reason: 'stale_push_skipped',
          pushMaxSequence: maxSequence,
          globalCursor,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      await this.syncService.applyLedgerEvents(
        dto.entries as unknown as HcmLedgerEntry[],
        since,
      );
    }
  }
}
