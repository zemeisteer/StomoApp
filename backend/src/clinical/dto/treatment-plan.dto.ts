import { IsInt, IsString, IsOptional, Min, Max } from 'class-validator';
import { MAX_MONEY } from '../../common/money';

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
  @Max(MAX_MONEY)
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

