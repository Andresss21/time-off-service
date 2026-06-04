import { Module } from '@nestjs/common';

import { SyncModule } from '../sync';
import { HcmClientModule } from '../hcm-client';
import { ErrorFactory } from '../common/errors';
import { ReconciliationService } from './reconciliation.service';
import { ReconciliationRepository } from './reconciliation.repository';
import { ReconciliationAdminController } from './reconciliation.admin.controller';

@Module({
  imports: [SyncModule, HcmClientModule],
  providers: [ReconciliationService, ReconciliationRepository, ErrorFactory],
  controllers: [ReconciliationAdminController],
})
export class ReconciliationModule {}
