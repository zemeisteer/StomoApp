import { IsInt, IsString, IsOptional, Min } from 'class-validator';

export class CreateTreatmentPlanItemDto {
  @IsOptional()
  @IsInt()
  toothNumber?: number;

  @IsString()
  treatmentNameUz!: string;

  @IsOptional()
  @IsString()
  treatmentNameRu?: string;

  @IsInt()
  @Min(0)
  costUzs!: number;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  appointmentId?: string;
}

export class UpdateTreatmentStatusDto {
  @IsString()
  status!: string;
}

