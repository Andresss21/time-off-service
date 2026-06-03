import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class BalanceParamsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  employeeId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  locationId: string;
}
