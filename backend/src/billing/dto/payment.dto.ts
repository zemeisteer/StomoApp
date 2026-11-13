import { IsInt, IsString, IsOptional, IsIn, Max, MaxLength, Min } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

/** Methods staff may record by hand. Payme and Click are written only by their provider callbacks. */
export const DESK_PAYMENT_METHODS: PaymentMethod[] = [
  PaymentMethod.CASH,
  PaymentMethod.CARD,
  PaymentMethod.TRANSFER,
  PaymentMethod.OTHER,
];

/** payments.amount is a 32-bit integer column (whole so'm). */
export const MAX_PAYMENT_UZS = 2_000_000_000;

export class RecordPaymentDto {
  @IsInt()
  @Min(1)
  @Max(MAX_PAYMENT_UZS)
  amount!: number;

  @IsOptional()
  @IsIn(DESK_PAYMENT_METHODS)
  method?: PaymentMethod;

  @IsOptional()
  @IsString()
  invoiceId?: string;

  @IsOptional()
  @IsString()
  patientId?: string;

  @IsOptional()
  @IsString()
  appointmentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
