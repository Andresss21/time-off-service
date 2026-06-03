import { Controller, Get, Query } from '@nestjs/common';
import { AdminOnly } from '../common/guards';
import { AuditService } from './audit.service';
import { AuditQueryDto } from './dto/audit-query.dto';

@AdminOnly()
@Controller('admin/audit-log')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  async queryAuditLog(@Query() dto: AuditQueryDto) {
    return this.auditService.query(dto);
  }
}
