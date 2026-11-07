import { IsInt, Min, Max, IsOptional, IsString } from 'class-validator';

export class UpdateCommissionDto {
  @IsInt()
  @Min(0)
  @Max(100)
  percentage!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  fixedBonus?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

