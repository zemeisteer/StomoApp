import {
  Controller, Get, Post, Put, Patch, Body, Param, Query,
  UseGuards, HttpCode, HttpStatus, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AppointmentsService } from './appointments.service';
import { SchedulingService, IsStrictCalendarDate, IsValidTimezone } from '../scheduling/scheduling.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { Public } from '../auth/public.decorator';
import { JwtPayload } from '../auth/auth.service';
import { AppointmentStatus, StaffRole } from '@prisma/client';
import {
  IsString, IsOptional, IsBoolean, IsEnum, IsDateString, IsInt, Min, Max, IsArray, Matches, IsEmail, ValidateIf,
} from 'class-validator';

export class PublicBookingDto {
  @IsOptional()
  @IsString()
  serviceId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serviceIds?: string[];

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
  @Matches(/^\+998(\s?\(?\d{2}\)?\s?\d{3}[-\s]?\d{2}[-\s]?\d{2}|\d{9})$/, {
    message: 'Telefon raqami O\'zbekiston formati (+998XXXXXXXXX)da bo\'lishi kerak',
  })
  patientPhone!: string;

  @IsOptional()
  @ValidateIf((o) => o.patientEmail !== undefined && o.patientEmail !== null && o.patientEmail !== '')
  @IsEmail({}, { message: 'Elektron pochta manzili formati noto\'g\'ri' })
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

export class OverrideDurationDto {
  @IsInt()
  @Min(5)
  @Max(480)
  durationMinutes!: number;

  @IsOptional()
  @IsString()
  reason?: string;
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

export class QueryRescheduleSlotsDto {
  @IsString()
  @IsStrictCalendarDate()
  date!: string;

  @IsOptional()
  @IsString()
  @IsValidTimezone()
  timezone?: string;
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
  constructor(
    private readonly service: AppointmentsService,
    private readonly schedulingService: SchedulingService,
  ) {}

  @Post()
  @Public()
  @Throttle({ default: { limit: process.env.NODE_ENV === 'test' ? 1000 : 20, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  async createBooking(@Body() dto: PublicBookingDto) {
    const result = await this.service.createBooking({
      ...dto,
      source: 'website',
    });
    const aptId = (result as any).id || (result as any).appointmentId;
    const doc = (result as any).doctor;
    const docName = (result as any).doctorName || (doc ? `Dr. ${doc.firstNameUz} ${doc.lastNameUz}` : undefined);
    const brName = (result as any).branchName || (result as any).branch?.nameUz;
    return {
      message: 'Qabulga so\'rov qabul qilindi. Tez orada tasdiqlaymiz.',
      id: aptId,
      appointmentId: aptId,
      publicToken: result.publicToken,
      token: result.publicToken,
      status: result.status,
      startTime: result.startTime,
      endTime: result.endTime,
      doctorName: docName,
      branchName: brName,
      serviceName: (result as any).serviceName,
      price: (result as any).price,
      durationMinutes: (result as any).durationMinutes,
      bufferMinutes: (result as any).bufferMinutes,
      serviceItems: (result as any).serviceItems,
      doctor: (result as any).doctor,
      branch: (result as any).branch,
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
      id: updated.id,
      appointmentId: updated.id,
      publicToken: updated.publicToken,
      status: updated.status,
      startTime: updated.startTime,
      endTime: updated.endTime,
      durationMinutes: updated.durationMinutes,
      bufferMinutes: updated.bufferMinutes,
      serviceName: updated.serviceName,
      price: (updated as any).price,
      serviceItems: (updated as any).serviceItems,
      doctor: updated.doctor,
      branch: updated.branch,
    };
  }

  @Get('reschedule/:token/slots')
  @Public()
  async getRescheduleSlots(
    @Param('token') token: string,
    @Query() query: QueryRescheduleSlotsDto,
  ) {
    const appointment = await this.service.findRawByToken(token);
    return this.schedulingService.getRescheduleSlotsForAppointment(
      appointment.id,
      query.date,
      query.timezone,
    );
  }

  @Get('status/:token/slots')
  @Public()
  async getStatusRescheduleSlots(
    @Param('token') token: string,
    @Query() query: QueryRescheduleSlotsDto,
  ) {
    return this.getRescheduleSlots(token, query);
  }
}

// ============================================================
// ADMIN ENDPOINTS
// ============================================================

@Controller('admin/appointments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AppointmentsController {
  constructor(
    private readonly service: AppointmentsService,
    private readonly schedulingService: SchedulingService,
  ) {}

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
  @Roles(StaffRole.OWNER, StaffRole.ADMIN, StaffRole.DOCTOR)
  async createFromAdmin(@Body() dto: PublicBookingDto, @CurrentUser() user: JwtPayload) {
    if (user.role === StaffRole.DOCTOR && dto.doctorId !== user.doctorId) {
      throw new ForbiddenException('Shifokor faqat o\'ziga qabul yarata oladi');
    }
    return this.service.createBooking({
      ...dto,
      source: 'admin',
    });
  }

  @Patch(':id/duration')
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  async overrideDuration(
    @Param('id') id: string,
    @Body() dto: OverrideDurationDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.overrideDuration(id, dto.durationMinutes, user.sub, dto.reason, user);
  }

  @Patch(':id/status')
  @Roles(StaffRole.OWNER, StaffRole.ADMIN, StaffRole.DOCTOR)
  async changeStatus(
    @Param('id') id: string,
    @Body() dto: StatusChangeDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.changeStatus(id, dto.status, user.sub, dto.reason, user);
  }

  @Put(':id/reschedule')
  @Roles(StaffRole.OWNER, StaffRole.ADMIN, StaffRole.DOCTOR)
  async reschedule(
    @Param('id') id: string,
    @Body() dto: RescheduleDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.reschedule(id, dto.startTime, user.sub, user);
  }

  @Post(':id/reschedule')
  @Roles(StaffRole.OWNER, StaffRole.ADMIN, StaffRole.DOCTOR)
  @HttpCode(HttpStatus.OK)
  async reschedulePost(
    @Param('id') id: string,
    @Body() dto: RescheduleDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.reschedule(id, dto.startTime, user.sub, user);
  }

  @Get(':id/reschedule-slots')
  @Roles(StaffRole.OWNER, StaffRole.ADMIN, StaffRole.DOCTOR)
  async getAdminRescheduleSlots(
    @Param('id') id: string,
    @Query() query: QueryRescheduleSlotsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const appointment = await this.service.findById(id, user);
    return this.schedulingService.getRescheduleSlotsForAppointment(
      appointment.id,
      query.date,
      query.timezone,
    );
  }
}
