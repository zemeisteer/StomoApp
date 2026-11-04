import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { BotService } from './bot.service';
import { BotServiceGuard } from './bot-service.guard';
import { SyncPatientDto, CreateBotBookingDto, CancelBotAppointmentDto } from './bot.dto';

@Controller('bot')
@UseGuards(BotServiceGuard, ThrottlerGuard)
@Throttle({ default: { limit: 120, ttl: 60000 } })
export class BotController {
  constructor(private readonly botService: BotService) {}

  @Get('doctors')
  async getDoctors() {
    return this.botService.getDoctors();
  }

  @Get('slots')
  async getSlots(
    @Query('date') date: string,
    @Query('doctorId') doctorId: string,
    @Query('serviceId') serviceId?: string,
    @Query('branchId') branchId?: string,
  ) {
    if (!serviceId || !serviceId.trim() || !branchId || !branchId.trim()) {
      throw new BadRequestException('Filial (branchId) va xizmat (serviceId) tanlanishi shart');
    }
    return this.botService.getSlots(date, doctorId, serviceId, branchId);
  }

  @Post('patient/sync')
  @HttpCode(HttpStatus.OK)
  async syncPatient(@Body() dto: SyncPatientDto) {
    return this.botService.syncPatient(dto);
  }

  @Get('patient/:telegramUserId/appointments')
  async getPatientAppointments(@Param('telegramUserId') telegramUserId: string) {
    return this.botService.getPatientAppointments(telegramUserId);
  }

  @Get('patient/:telegramUserId/treatment-plan')
  async getPatientTreatmentPlan(@Param('telegramUserId') telegramUserId: string) {
    return this.botService.getPatientTreatmentPlan(telegramUserId);
  }

  @Get('patient/:telegramUserId/debt')
  async getPatientDebt(@Param('telegramUserId') telegramUserId: string) {
    return this.botService.getPatientDebt(telegramUserId);
  }

  @Post('booking')
  @HttpCode(HttpStatus.CREATED)
  async createBooking(@Body() dto: CreateBotBookingDto) {
    return this.botService.createBooking(dto);
  }

  @Post('appointments/:id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelAppointment(
    @Param('id') appointmentId: string,
    @Body() dto: CancelBotAppointmentDto,
  ) {
    return this.botService.cancelAppointment(appointmentId, dto.telegramUserId);
  }

  @Get('reminders')
  async getReminders() {
    return this.botService.getUpcomingReminders();
  }

  @Get('daily-schedules')
  async getDailyDoctorSchedules() {
    return this.botService.getDailyDoctorSchedules();
  }
}
