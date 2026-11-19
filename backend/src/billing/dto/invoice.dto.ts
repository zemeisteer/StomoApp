import { IsInt, IsString, IsOptional, Min, Max, MaxLength } from 'class-validator';
import { MAX_MONEY } from '../../common/money';

export class CreateInvoiceDto {
  @IsString()
  patientId!: string;

  @IsOptional()
  @IsString()
  appointmentId?: string;

  @IsInt()
  @Min(0)
  @Max(MAX_MONEY)
  totalAmount!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_MONEY)
  discount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

