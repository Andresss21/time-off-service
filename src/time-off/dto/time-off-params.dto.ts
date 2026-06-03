import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class TimeOffParamsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  requestId: string;
}
