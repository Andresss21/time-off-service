import { IsString, IsNotEmpty, MaxLength, IsNumber, IsPositive } from 'class-validator';

export class CreateTimeOffRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  employeeId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  locationId: string;

  @IsNumber()
  @IsPositive()
  requestedDays: number;
}
