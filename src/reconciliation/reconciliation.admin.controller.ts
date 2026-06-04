import { Controller, HttpCode, Param, Post } from '@nestjs/common';

import { AdminOnly } from '../common/guards';
import { ErrorFactory } from '../common/errors';
import { RequestState } from '../common/types';
import { ReconciliationService } from './reconciliation.service';
import { ReconciliationRepository } from './reconciliation.repository';
import { ReconcileParamsDto } from './dto/reconcile-params.dto';

const TERMINAL_STATES = new Set<string>([
  RequestState.APPROVED,
  RequestState.REJECTED_PRE_VALIDATION,
  RequestState.REJECTED_HCM,
  RequestState.REJECTED_INVALID,
  RequestState.FAILED_CREDENTIAL_ERROR,
  RequestState.FAILED_EXHAUSTED,
]);

@AdminOnly()
@Controller('admin')
export class ReconciliationAdminController {
  constructor(
    private readonly reconciliationService: ReconciliationService,
    private readonly repository: ReconciliationRepository,
    private readonly errorFactory: ErrorFactory,
  ) {}

  @Post('requests/:requestId/reconcile')
  @HttpCode(202)
  async triggerReconciliation(
    @Param() params: ReconcileParamsDto,
  ): Promise<{ requestId: string; triggeredAt: string }> {
    const { requestId } = params;

    const request = await this.repository.findById(requestId);
    if (!request) {
      throw this.errorFactory.notFound('TimeOffRequest', requestId, {
        code: 'REQUEST_NOT_FOUND',
        message: 'No time-off request found with the specified ID.',
      });
    }

    if (TERMINAL_STATES.has(request.state)) {
      throw this.errorFactory.validationError(
        'Request is in a terminal state and cannot be reconciled.',
        'REQUEST_NOT_RECONCILABLE',
      );
    }

    // Fire-and-forget — reconciliation runs asynchronously
    this.reconciliationService.reconcile(requestId).catch(() => undefined);

    return {
      requestId,
      triggeredAt: new Date().toISOString(),
    };
  }
}
