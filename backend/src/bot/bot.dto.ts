import { IsString, IsNotEmpty, IsOptional, IsDateString } from 'class-validator';

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
}

export class CreateBotBookingDto {
  @IsString()
  @IsNotEmpty()
  doctorId!: string;

  @IsString()
  @IsNotEmpty()
  patientPhone!: string;

  @IsString()
  @IsNotEmpty()
  patientName!: string;

  @IsDateString()
  startTime!: string;

  @IsString()
  @IsNotEmpty()
  telegramUserId!: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  serviceId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CancelBotAppointmentDto {
  @IsString()
  @IsNotEmpty()
  telegramUserId!: string;
}
