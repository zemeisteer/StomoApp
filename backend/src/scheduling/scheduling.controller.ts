import {
  Controller, Get, Post, Delete, Body, Param, Query,
  UseGuards,
} from '@nestjs/common';
import { SchedulingService } from './scheduling.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import { DayOfWeek, ExceptionType, StaffRole } from '@prisma/client';
import { IsString, IsEnum, IsOptional, IsDateString } from 'class-validator';

class SetScheduleDto {
  @IsString()
  doctorId!: string;

  @IsEnum(DayOfWeek)
  dayOfWeek!: DayOfWeek;

  @IsString()
  startTime!: string;

  @IsString()
  endTime!: string;

  @IsOptional()
  @IsString()
  breakStart?: string;

  @IsOptional()
  @IsString()
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
  startTime?: string;

  @IsOptional()
  @IsString()
  endTime?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

@Controller('scheduling')
export class SchedulingController {
  constructor(private readonly service: SchedulingService) {}

  // Public endpoint for booking flow
  @Get('slots')
  @Public()
  async getAvailableSlots(
    @Query('doctorId') doctorId: string,
    @Query('date') date: string,
    @Query('serviceId') serviceId: string,
  ) {
    return this.service.getAvailableSlots(doctorId, date, serviceId);
  }

  // Admin endpoints
  @Get('doctor/:doctorId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  async getDoctorSchedules(@Param('doctorId') doctorId: string) {
    return this.service.getDoctorSchedules(doctorId);
  }

  @Post('schedule')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  async setSchedule(@Body() dto: SetScheduleDto) {
    return this.service.setDoctorSchedule(dto);
  }

  @Post('exception')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  async addException(@Body() dto: AddExceptionDto) {
    return this.service.addException(dto);
  }

  @Get('exceptions/:doctorId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  async getExceptions(
    @Param('doctorId') doctorId: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.service.getExceptions(doctorId, dateFrom, dateTo);
  }

  @Delete('exception/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  async deleteException(@Param('id') id: string) {
    return this.service.deleteException(id);
  }
}
