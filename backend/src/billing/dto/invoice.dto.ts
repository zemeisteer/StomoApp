import { IsInt, IsString, IsOptional, Min } from 'class-validator';

export class CreateInvoiceDto {
  @IsString()
  patientId!: string;

  @IsOptional()
  @IsString()
  appointmentId?: string;

  @IsInt()
  @Min(0)
  totalAmount!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  discount?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

