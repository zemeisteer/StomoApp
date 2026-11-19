import { IsInt, Min, Max, IsOptional, IsString, IsEnum } from 'class-validator';
import { PayType } from '@prisma/client';
import { MAX_MONEY } from '../../common/money';

export class UpdateCommissionDto {
  @IsInt()
  @Min(0)
  @Max(100)
  percentage!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_MONEY)
  fixedBonus?: number;

  @IsOptional()
  @IsEnum(PayType)
  payType?: PayType;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_MONEY)
  monthlySalary?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateStaffPayDto {
  @IsEnum(PayType)
  payType!: PayType;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_MONEY)
  monthlySalary?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  percentage?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_MONEY)
  fixedBonus?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
