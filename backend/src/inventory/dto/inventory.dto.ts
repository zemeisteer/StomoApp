import { IsInt, IsString, IsOptional, IsEnum, Min, MaxLength, Max } from 'class-validator';
import { InventoryMovementType } from '@prisma/client';
import { MAX_MONEY, MAX_QUANTITY } from '../../common/money';

export class CreateInventoryItemDto {
  @IsString()
  name!: string;

  @IsString()
  category!: string;

  @IsInt()
  @Min(0)
  @Max(MAX_QUANTITY)
  quantity!: number;

  @IsString()
  unit!: string;

  @IsInt()
  @Min(0)
  @Max(MAX_QUANTITY)
  minThreshold!: number;

  @IsInt()
  @Min(0)
  @Max(MAX_MONEY)
  unitCost!: number;
}

export class RecordMovementDto {
  @IsEnum(InventoryMovementType)
  changeType!: InventoryMovementType;

  @IsInt()
  @Min(-MAX_QUANTITY)
  @Max(MAX_QUANTITY)
  quantityDelta!: number;

  @IsOptional()
  @IsString()
  reason?: string;
}


export class UpdateInventoryItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_QUANTITY)
  minThreshold?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_MONEY)
  unitCost?: number;
}
