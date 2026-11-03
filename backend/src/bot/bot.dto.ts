import { IsString, IsNotEmpty, IsOptional, IsDateString } from 'class-validator';

export class SyncPatientDto {
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @IsString()
  @IsNotEmpty()
  fullName!: string;
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

