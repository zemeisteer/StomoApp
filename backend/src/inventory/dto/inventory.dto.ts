import { IsInt, IsString, IsOptional, IsEnum, Min } from 'class-validator';
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

