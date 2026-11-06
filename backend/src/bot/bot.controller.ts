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
import {
  SyncPatientDto,
  CreateBotBookingDto,
  CancelBotAppointmentDto,
  ReportBotJobFailureDto,
  ClaimDailyDigestDto,
  SetBotLanguageDto,
  LinkStaffTelegramDto,
} from './bot.dto';
import { StaffTelegramService } from '../staff/staff-telegram.service';

@Controller('bot')
@UseGuards(BotServiceGuard, ThrottlerGuard)
@Throttle({ default: { limit: 120, ttl: 60000 } })
export class BotController {
  constructor(
    private readonly botService: BotService,
    private readonly staffTelegram: StaffTelegramService,
  ) {}

  /** Staff self-service Telegram linking via deep link (`/start link_...`). */
  @Post('staff/link')
  @HttpCode(HttpStatus.OK)
  async linkStaffTelegram(@Body() dto: LinkStaffTelegramDto) {
    return this.staffTelegram.linkFromBot(dto.token, dto.telegramUserId);
  }

  @Get('doctors')
  async getDoctors() {
    return this.botService.getDoctors();
  }

  @Get('clinic-info')
  async getClinicInfo() {
    return this.botService.getClinicInfo();
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

  @Post('patient/:telegramUserId/language')
  @HttpCode(HttpStatus.OK)
  async setPatientLanguage(
    @Param('telegramUserId') telegramUserId: string,
    @Body() dto: SetBotLanguageDto,
  ) {
    return this.botService.setPatientLanguage(telegramUserId, dto.language);
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

  /** Claims due 24h reminders; each appointment revision is returned only once. */
  @Post('reminders/claim')
  @HttpCode(HttpStatus.OK)
  async claimReminders() {
    return this.botService.claimTelegramReminders();
  }

  @Post('jobs/:jobId/failed')
  @HttpCode(HttpStatus.OK)
  async reportJobFailure(@Param('jobId') jobId: string, @Body() dto: ReportBotJobFailureDto) {
    return this.botService.reportBotJobFailure(jobId, dto.error);
  }

  @Get('daily-schedules')
  async getDailyDoctorSchedules() {
    return this.botService.getDailyDoctorSchedules();
  }

  /** Claims today's personal schedule for each doctor with a linked Telegram chat. */
  @Post('daily-schedules/doctors/claim')
  @HttpCode(HttpStatus.OK)
  async claimDoctorSchedules() {
    return this.botService.claimDoctorDailySchedules();
  }

  /** Claims today's staff schedule digest; `claimed: false` if already sent today. */
  @Post('daily-schedules/claim')
  @HttpCode(HttpStatus.OK)
  async claimDailySchedules(@Body() dto: ClaimDailyDigestDto) {
    return this.botService.claimDailyScheduleDigest(dto.recipient);
  }
}
