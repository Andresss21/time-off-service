import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AuditQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @IsIn(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'])
  severity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @IsIn([
    'PUSH_SIGNATURE_INVALID',
    'PUSH_REPLAY_DETECTED',
    'PUSH_SCHEMA_INVALID',
    'INTEGRITY_VIOLATION_NEGATIVE_BALANCE',
    'INTEGRITY_ANNOTATION_ZERO_BALANCE',
    'CREDENTIAL_ERROR',
    'REQUEST_EXHAUSTED',
    'SYNC_RESET_INVALID',
  ])
  eventType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  occurredAtSince?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  occurredAtUntil?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  employeeId?: string;
}
