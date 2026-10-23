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
import { SchedulingService, IsStrictCalendarDate, IsValidTimezone } from './scheduling.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import { DayOfWeek, ExceptionType, StaffRole } from '@prisma/client';
import { IsString, IsEnum, IsOptional, IsDateString, Matches, IsArray, IsIn } from 'class-validator';

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export class BatchScheduleDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  doctorIds?: string[];

  @IsOptional()
  @IsString()
  doctorId?: string;

  @IsArray()
  @IsEnum(DayOfWeek, { each: true })
  daysOfWeek!: DayOfWeek[];

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

  @IsString()
  branchId!: string;

  @IsIn(['replace', 'merge'])
  mode!: 'replace' | 'merge';
}

export class CopyScheduleDto {
  @IsString()
  fromDoctorId!: string;

  @IsArray()
  @IsString({ each: true })
  toDoctorIds!: string[];

  @IsOptional()
  @IsString()
  targetBranchId?: string;

  @IsIn(['replace', 'merge'])
  mode!: 'replace' | 'merge';
}

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

  @IsOptional()
  @IsString()
  branchId?: string;
}

export class QuerySlotsDto {
  @IsString()
  doctorId!: string;

  @IsString()
  @IsStrictCalendarDate()
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

  @IsOptional()
  @IsString()
  @IsValidTimezone()
  timezone?: string;
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
      query.timezone,
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

  @Post(['schedule/batch', 'schedules/batch'])
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  async setBatchSchedule(@Body() dto: BatchScheduleDto) {
    const doctorIds = dto.doctorIds && dto.doctorIds.length > 0
      ? dto.doctorIds
      : (dto.doctorId ? [dto.doctorId] : []);
    return this.service.setBatchSchedules({
      ...dto,
      doctorIds,
    });
  }

  @Post(['schedule/copy', 'schedules/copy'])
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  async copySchedule(@Body() dto: CopyScheduleDto) {
    return this.service.copyDoctorSchedules(dto);
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
