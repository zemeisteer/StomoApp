import { IsInt, IsString, IsOptional, IsEnum, Min, MaxLength } from 'class-validator';
import { InventoryMovementType } from '@prisma/client';

export class CreateInventoryItemDto {
  @IsString()
  name!: string;

  @IsString()
  category!: string;

  @IsInt()
  @Min(0)
  quantity!: number;

  @IsString()
  unit!: string;

  @IsInt()
  @Min(0)
  minThreshold!: number;

  @IsInt()
  @Min(0)
  unitCost!: number;
}

export class RecordMovementDto {
  @IsEnum(InventoryMovementType)
  changeType!: InventoryMovementType;

  @IsInt()
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
  minThreshold?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  unitCost?: number;
}
