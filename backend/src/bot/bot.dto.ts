import { IsString, IsNotEmpty, IsOptional, IsDateString, MaxLength } from 'class-validator';

export class SyncPatientDto {
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @IsString()
  @IsNotEmpty()
  telegramUserId!: string;

  @IsOptional()
  @IsString()
  patientId?: string;
}

export class CreateBotBookingDto {
  @IsString()
  @IsNotEmpty()
  doctorId!: string;

  @IsString()
  @IsNotEmpty()
  branchId!: string;

  @IsString()
  @IsNotEmpty()
  serviceId!: string;

  // Ignored when the Telegram user is linked to a patient (their verified phone wins)
  @IsOptional()
  @IsString()
  patientPhone?: string;

  @IsOptional()
  @IsString()
  patientName?: string;

  // Exact UTC instant from /bot/slots `slotTimes[].startTime`
  @IsDateString({ strict: true })
  startTime!: string;

  @IsString()
  @IsNotEmpty()
  telegramUserId!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CancelBotAppointmentDto {
  @IsString()
  @IsNotEmpty()
  telegramUserId!: string;
}

export class ReportBotJobFailureDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  error!: string;
}

export class ClaimDailyDigestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  recipient!: string;
}
