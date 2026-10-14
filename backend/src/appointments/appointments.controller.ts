import {
  Controller, Get, Post, Put, Patch, Body, Param, Query,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AppointmentsService } from './appointments.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { Public } from '../auth/public.decorator';
import { JwtPayload } from '../auth/auth.service';
import { AppointmentStatus, StaffRole } from '@prisma/client';
import {
  IsString, IsOptional, IsBoolean, IsEnum, IsDateString, IsInt, Min,
} from 'class-validator';

export class PublicBookingDto {
  @IsString()
  serviceId!: string;

  @IsString()
  doctorId!: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsDateString()
  startTime!: string;

  @IsString()
  patientName!: string;

  @IsString()
  patientPhone!: string;

  @IsOptional()
  @IsString()
  patientEmail?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsBoolean()
  consentGiven!: boolean;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class StatusChangeDto {
  @IsEnum(AppointmentStatus)
  status!: AppointmentStatus;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class RescheduleDto {
  @IsDateString()
  startTime!: string;
}

export class ListQueryDto {
  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;

  @IsOptional()
  @IsString()
  doctorId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  serviceId?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;
}

// ============================================================
// PUBLIC BOOKING ENDPOINTS
// ============================================================

@Controller('booking')
export class PublicBookingController {
  constructor(private readonly service: AppointmentsService) {}

  @Post()
  @Public()
  @Throttle({ default: { limit: process.env.NODE_ENV === 'test' ? 1000 : 20, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  async createBooking(@Body() dto: PublicBookingDto) {
    const result = await this.service.createBooking({
      ...dto,
      source: 'website',
    });
    return {
      message: 'Qabulga so\'rov qabul qilindi. Tez orada tasdiqlaymiz.',
      appointmentId: result.id,
      publicToken: result.publicToken,
      status: result.status,
      startTime: result.startTime,
      endTime: result.endTime,
    };
  }

  @Get('status/:token')
  @Public()
  async getByToken(@Param('token') token: string) {
    return this.service.findByToken(token);
  }

  @Post('cancel/:token')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async cancelByToken(@Param('token') token: string) {
    return this.service.cancelByToken(token);
  }

  @Post('reschedule/:token')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async rescheduleByToken(
    @Param('token') token: string,
    @Body() dto: RescheduleDto,
  ) {
    const updated = await this.service.rescheduleByToken(token, dto.startTime);
    return {
      message: 'Qabul muvaffaqiyatli qayta rejalashtirildi',
      startTime: updated.startTime,
      endTime: updated.endTime,
    };
  }
}

// ============================================================
// ADMIN ENDPOINTS
// ============================================================

@Controller('admin/appointments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AppointmentsController {
  constructor(private readonly service: AppointmentsService) {}

  @Get()
  @Roles(StaffRole.OWNER, StaffRole.ADMIN, StaffRole.DOCTOR)
  findAll(@Query() query: ListQueryDto, @CurrentUser() user: JwtPayload) {
    return this.service.findAll(query, user);
  }

  @Get('today')
  @Roles(StaffRole.OWNER, StaffRole.ADMIN, StaffRole.DOCTOR)
  getToday(@CurrentUser() user: JwtPayload) {
    return this.service.getToday('Asia/Tashkent', user);
  }

  @Get(':id')
  @Roles(StaffRole.OWNER, StaffRole.ADMIN, StaffRole.DOCTOR)
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.findById(id, user);
  }

  @Post()
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  async createFromAdmin(@Body() dto: PublicBookingDto, @CurrentUser() user: JwtPayload) {
    return this.service.createBooking({
      ...dto,
      source: 'admin',
    });
  }

  @Patch(':id/status')
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  async changeStatus(
    @Param('id') id: string,
    @Body() dto: StatusChangeDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.changeStatus(id, dto.status, user.sub, dto.reason);
  }

  @Put(':id/reschedule')
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  async reschedule(
    @Param('id') id: string,
    @Body() dto: RescheduleDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.reschedule(id, dto.startTime, user.sub);
  }
}
