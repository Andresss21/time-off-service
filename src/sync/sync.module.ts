import { Module } from '@nestjs/common';

import { HcmClientModule } from '../hcm-client';
import { SyncService } from './sync.service';
import { SyncRepository } from './sync.repository';
import { SyncAdminController } from './sync.admin.controller';

@Module({
  imports: [HcmClientModule],
  providers: [SyncService, SyncRepository],
  controllers: [SyncAdminController],
  exports: [SyncService],
})
export class SyncModule {}
