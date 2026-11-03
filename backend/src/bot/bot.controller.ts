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
} from '@nestjs/common';
import { BotService } from './bot.service';
import { BotServiceGuard } from './bot-service.guard';
import { SyncPatientDto, CreateBotBookingDto } from './bot.dto';

@Controller('bot')
@UseGuards(BotServiceGuard)
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
    return this.botService.getSlots(date, doctorId, serviceId, branchId);
  }

  @Post('patient/sync')
  @HttpCode(HttpStatus.OK)
  async syncPatient(@Body() dto: SyncPatientDto) {
    return this.botService.syncPatient(dto);
  }

  @Get('patient/:id/appointments')
  async getPatientAppointments(@Param('id') patientId: string) {
    return this.botService.getPatientAppointments(patientId);
  }

  @Get('patient/:id/treatment-plan')
  async getPatientTreatmentPlan(@Param('id') patientId: string) {
    return this.botService.getPatientTreatmentPlan(patientId);
  }

  @Get('patient/:id/debt')
  async getPatientDebt(@Param('id') patientId: string) {
    return this.botService.getPatientDebt(patientId);
  }

  @Post('booking')
  @HttpCode(HttpStatus.CREATED)
  async createBooking(@Body() dto: CreateBotBookingDto) {
    return this.botService.createBooking(dto);
  }

  @Post('appointments/:id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelAppointment(@Param('id') appointmentId: string) {
    return this.botService.cancelAppointment(appointmentId);
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

