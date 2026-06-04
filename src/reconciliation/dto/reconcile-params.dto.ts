import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ReconcileParamsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  requestId!: string;
}
