import {
  IsString,
  IsNotEmpty,
  IsInt,
  Min,
  IsOptional,
  IsArray,
  IsNumber,
  MaxLength,
  IsIn,
  ValidateNested,
  ValidatorConstraintInterface,
  ValidatorConstraint,
  ValidationArguments,
  Validate,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CorpusPushRecordDto {
  @IsString() @IsNotEmpty() @MaxLength(128)
  employeeId: string;

  @IsString() @IsNotEmpty() @MaxLength(128)
  locationId: string;

  @IsNumber()
  balanceDays: number;

  @IsInt() @Min(1)
  lastSequence: number;

  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(64)
  leaveType?: string;

  @IsOptional() @IsInt()
  version?: number;

  @IsOptional() @IsString() @MaxLength(64)
  updatedAt?: string;
}

export class LedgerEventEntryDto {
  @IsString() @IsNotEmpty() @MaxLength(128)
  entryId: string;

  @IsString() @IsNotEmpty() @MaxLength(128)
  employeeId: string;

  @IsString() @IsNotEmpty() @MaxLength(128)
  locationId: string;

  @IsIn(['GRANT', 'DEDUCTION', 'ADJUSTMENT', 'RESET'])
  type: string;

  @IsOptional() @IsNumber()
  delta?: number;

  @IsOptional() @IsNumber()
  setTo?: number;

  @IsIn(['TIME_OFF_TAKEN', 'ANNIVERSARY_BONUS', 'ANNUAL_REFRESH', 'CORRECTION'])
  reason: string;

  @IsIn(['TIME_OFF_SERVICE', 'HCM_INTERNAL', 'OTHER_SYSTEM'])
  source: string;

  @IsInt() @Min(1)
  sequence: number;

  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(64)
  leaveType?: string;

  @IsOptional() @IsString() @MaxLength(64)
  effectiveAt?: string;

  @IsOptional() @IsString() @MaxLength(64)
  recordedAt?: string;
}

@ValidatorConstraint({ name: 'ExactlyOnePushPayload', async: false })
export class ExactlyOnePushPayloadConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const obj = args.object as HcmPushDto;
    const hasRecords = Array.isArray(obj.records) && obj.records.length > 0;
    const hasEntries = Array.isArray(obj.entries) && obj.entries.length > 0;
    return (hasRecords && !hasEntries) || (!hasRecords && hasEntries);
  }

  defaultMessage(): string {
    return 'Exactly one of records or entries must be present and non-empty';
  }
}

export class HcmPushDto {
  @IsString() @IsNotEmpty() @MaxLength(64)
  generatedAt: string;

  @IsInt() @Min(1)
  @Validate(ExactlyOnePushPayloadConstraint)
  count: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CorpusPushRecordDto)
  records?: CorpusPushRecordDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LedgerEventEntryDto)
  entries?: LedgerEventEntryDto[];
}
