import {
  Equals,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const MAX_PRICE_UZS = 1_000_000_000; // 1 billion so'm per line

export class CreatePlanDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @IsOptional()
  @IsString()
  doctorId?: string;
}

export class UpdatePlanDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_PRICE_UZS)
  discountUzs?: number;
}

export class CreatePlanItemDto {
  @IsOptional()
  @IsString()
  serviceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  treatmentNameUz?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  treatmentNameRu?: string;

  @IsOptional()
  @IsInt()
  @Min(11)
  @Max(85)
  toothNumber?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_PRICE_UZS)
  unitPriceUzs?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  quantity?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  phase?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdatePlanItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  treatmentNameUz?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  treatmentNameRu?: string;

  @IsOptional()
  @IsInt()
  @Min(11)
  @Max(85)
  toothNumber?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_PRICE_UZS)
  unitPriceUzs?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  quantity?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  phase?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsIn(['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'])
  status?: string;
}

export class AcceptPlanDto {
  @IsIn(['IN_CLINIC_SIGNATURE', 'VERBAL'])
  method!: 'IN_CLINIC_SIGNATURE' | 'VERBAL';

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  acceptedByName!: string;

  @IsOptional()
  @IsString()
  signature?: string;
}

export class DeclinePlanDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class PublicAcceptPlanDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  fullName!: string;

  @IsBoolean()
  @Equals(true)
  agree!: boolean;
}
