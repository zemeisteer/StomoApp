import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SchedulingService } from './scheduling.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import { DayOfWeek, ExceptionType, StaffRole } from '@prisma/client';
import { IsString, IsEnum, IsOptional, IsDateString, Matches } from 'class-validator';

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

class SetScheduleDto {
  @IsString()
  doctorId!: string;

  @IsEnum(DayOfWeek)
  dayOfWeek!: DayOfWeek;

  @IsString()
  @Matches(TIME_REGEX, { message: 'Boshlanish vaqti HH:MM formatida bo\'lishi kerak' })
  startTime!: string;

  @IsString()
  @Matches(TIME_REGEX, { message: 'Tugash vaqti HH:MM formatida bo\'lishi kerak' })
  endTime!: string;

  @IsOptional()
  @IsString()
  @Matches(TIME_REGEX, { message: 'Tanaffus boshlanishi HH:MM formatida bo\'lishi kerak' })
  breakStart?: string;

  @IsOptional()
  @IsString()
  @Matches(TIME_REGEX, { message: 'Tanaffus tugashi HH:MM formatida bo\'lishi kerak' })
  breakEnd?: string;

  @IsOptional()
  @IsString()
  branchId?: string;
}

class AddExceptionDto {
  @IsString()
  doctorId!: string;

  @IsEnum(ExceptionType)
  type!: ExceptionType;

  @IsDateString()
  date!: string;

  @IsOptional()
  @IsString()
  @Matches(TIME_REGEX, { message: 'Vaqt HH:MM formatida bo\'lishi kerak' })
  startTime?: string;

  @IsOptional()
  @IsString()
  @Matches(TIME_REGEX, { message: 'Vaqt HH:MM formatida bo\'lishi kerak' })
  endTime?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class QuerySlotsDto {
  @IsString()
  doctorId!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Sana YYYY-MM-DD formatida bo\'lishi kerak' })
  date!: string;

  @IsOptional()
  @IsString()
  serviceId?: string;

  @IsOptional()
  @IsString()
  serviceIds?: string;

  @IsOptional()
  @IsString()
  branchId?: string;
}

@Controller('scheduling')
export class SchedulingController {
  constructor(private readonly service: SchedulingService) {}

  // Public endpoint for booking flow
  @Get('slots')
  @Public()
  async getAvailableSlots(@Query() query: QuerySlotsDto) {
    return this.service.getAvailableSlots(
      query.doctorId,
      query.date,
      query.serviceId,
      query.branchId,
      undefined,
      query.serviceIds ? query.serviceIds.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
    );
  }

  // Admin endpoints
  @Get(['doctor/:doctorId', 'schedules/:doctorId'])
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN, StaffRole.DOCTOR)
  async getDoctorSchedules(@Param('doctorId') doctorId: string) {
    return this.service.getDoctorSchedules(doctorId);
  }

  @Post(['schedule', 'schedules'])
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  async setSchedule(@Body() dto: SetScheduleDto) {
    return this.service.setDoctorSchedule(dto);
  }

  @Post(['exception', 'exceptions'])
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  async addException(@Body() dto: AddExceptionDto) {
    return this.service.addException(dto);
  }

  @Get('exceptions/:doctorId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN, StaffRole.DOCTOR)
  async getExceptions(
    @Param('doctorId') doctorId: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.service.getExceptions(doctorId, dateFrom, dateTo);
  }

  @Delete(['exception/:id', 'exceptions/:id'])
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  async deleteException(@Param('id') id: string) {
    return this.service.deleteException(id);
  }
}
