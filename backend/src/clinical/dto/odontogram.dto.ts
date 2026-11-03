import { IsInt, IsString, IsOptional, IsArray, Min, Max } from 'class-validator';

export class UpdateToothRecordDto {
  @IsInt()
  @Min(11)
  @Max(85)
  toothNumber!: number;

  @IsString()
  condition!: string;

  @IsOptional()
  @IsString()
  chartType?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  surfaces?: string[];
}

export class SaveOdontogramDto {
  @IsArray()
  teeth!: UpdateToothRecordDto[];

  @IsOptional()
  @IsString()
  appointmentId?: string;
}

