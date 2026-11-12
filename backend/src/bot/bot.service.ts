import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { SchedulingService } from '../scheduling/scheduling.service';
import { AuditService } from '../audit/audit.service';
import { AppointmentStatus, NotificationChannel, NotificationStatus, Prisma } from '@prisma/client';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { SyncPatientDto, CreateBotBookingDto } from './bot.dto';

@Injectable()
export class BotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly appointmentsService: AppointmentsService,
    private readonly schedulingService: SchedulingService,
    private readonly auditService: AuditService,
  ) {}

  private normalizePhone(phone: string): string {
    const cleaned = (phone || '').replace(/\D/g, '');
    if (!cleaned.startsWith('998') && cleaned.length === 9) {
      return '+998' + cleaned;
    }
    return '+' + cleaned;
  }

  async getDoctors() {
    const doctors = await this.prisma.doctor.findMany({
      where: { isActive: true },
      include: {
        specialties: { include: { specialty: true } },
        branches: {
          where: { branch: { isActive: true } },
          include: { branch: true },
        },
        services: {
          where: { service: { isActive: true } },
          include: { service: true },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    return doctors.map((doc) => ({
      id: doc.id,
      name: `Dr. ${doc.firstNameUz} ${doc.lastNameUz}`.trim(),
      nameRu: `Др. ${doc.firstNameRu} ${doc.lastNameRu}`.trim(),
      spec: doc.specialties?.[0]?.specialty?.nameUz || doc.titleUz || 'Stomatolog',
      specRu: doc.specialties?.[0]?.specialty?.nameRu || doc.titleRu || 'Стоматолог',
      branches: doc.branches.map((b) => ({
        id: b.branch.id,
        name: b.branch.nameUz,
        nameRu: b.branch.nameRu,
        address: b.branch.addressUz,
        addressRu: b.branch.addressRu,
      })),
      services: doc.services.map((s) => ({
        id: s.service.id,
        name: s.service.nameUz,
        nameRu: s.service.nameRu,
        priceFrom: s.service.priceFrom,
      })),
    }));
  }

  /**
   * Public-facing clinic contact info for the bot, taken from clinic settings
   * and active branches so admin edits show up in the bot immediately.
   */
  async getClinicInfo() {
    const [settings, branches] = await Promise.all([
      this.prisma.clinicSettings.findFirst(),
      this.prisma.branch.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
    ]);
    return {
      name: settings?.name || 'DentaCare',
      nameRu: settings?.nameRu || settings?.name || 'DentaCare',
      phone: settings?.phone || null,
      website: settings?.website || null,
      telegramLink: settings?.telegramLink || null,
      timezone: settings?.timezone || 'Asia/Tashkent',
      branches: branches.map((b) => ({
        id: b.id,
        name: b.nameUz,
        nameRu: b.nameRu,
        address: b.addressUz,
        addressRu: b.addressRu,
        phone: b.phone || settings?.phone || null,
        mapUrl:
          b.mapUrl ||
          (b.latitude != null && b.longitude != null
            ? `https://maps.google.com/?q=${b.latitude},${b.longitude}`
            : null),
        workingHours: b.workingHours ?? {},
      })),
    };
  }

  async getSlots(dateStr: string, doctorId: string, serviceId?: string, branchId?: string) {
    if (!serviceId || !serviceId.trim() || !branchId || !branchId.trim()) {
      throw new BadRequestException('Filial (branchId) va xizmat (serviceId) tanlanishi shart');
    }

    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, isActive: true },
    });
    if (!branch) {
      throw new BadRequestException('Filial topilmadi yoki faol emas');
    }

    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, isActive: true },
    });
    if (!service) {
      throw new BadRequestException('Xizmat topilmadi yoki faol emas');
    }

    const docBranch = await this.prisma.doctorBranch.findFirst({
      where: { doctorId, branchId },
    });
    if (!docBranch) {
      throw new BadRequestException('Shifokor ushbu filialda ishlamaydi');
    }

    const docService = await this.prisma.doctorService.findFirst({
      where: { doctorId, serviceId },
    });
    if (!docService) {
      throw new BadRequestException('Shifokor ushbu xizmatni ko\'rsatmaydi');
    }

    const timezone = await this.getClinicTimezone();
    const res = await this.schedulingService.getAvailableSlots(
      doctorId,
      dateStr,
      serviceId,
      branchId,
      timezone,
    );

    // Slot start times are UTC ISO strings. Show clinic-local labels, and give
    // callers the exact UTC instant to book so no timezone guessing happens.
    const slotTimes = (res.slots || [])
      .filter((s) => s.available)
      .map((s) => ({
        time: formatInTimeZone(new Date(s.startTime), timezone, 'HH:mm'),
        startTime: new Date(s.startTime).toISOString(),
      }));

    return {
      date: dateStr,
      doctorId,
      branchId,
      serviceId,
      timezone,
      durationMinutes: res.durationMinutes,
      slots: slotTimes.map((s) => s.time),
      slotTimes,
      slotObjects: res.slots,
    };
  }

  async syncPatient(dto: SyncPatientDto) {
    const result: any = await this.syncPatientIdentity(dto);
    // Persist the bot language chosen before/at registration (ignored on ambiguous matches)
    if (dto.language && result?.id && !result?.ambiguous) {
      await this.prisma.patient.update({ where: { id: result.id }, data: { preferredLanguage: dto.language } });
      result.preferredLanguage = dto.language;
    }
    return result;
  }

  async setPatientLanguage(telegramUserId: string, language: 'uz' | 'ru') {
    const res = await this.prisma.patient.updateMany({
      where: { telegramUserId },
      data: { preferredLanguage: language },
    });
    return { updated: res.count > 0, language };
  }

  private async syncPatientIdentity(dto: SyncPatientDto) {
    const normalized = this.normalizePhone(dto.phone);
    const cleanName = (dto.fullName || '').trim();
    const telegramUserId = (dto.telegramUserId || '').trim();

    if (!telegramUserId) {
      throw new BadRequestException('telegramUserId kiritilishi shart');
    }

    // 1. Explicit patientId provided (user picked from candidate list)
    if (dto.patientId) {
      let patient = await this.prisma.patient.findUnique({
        where: { id: dto.patientId },
      });
      if (!patient || patient.phone !== normalized) {
        throw new NotFoundException('Tanlangan bemor topilmadi yoki telefon raqami mos emas');
      }
      // Never move a patient away from the Telegram account they are already linked to
      if (patient.telegramUserId && patient.telegramUserId !== telegramUserId) {
        throw new ConflictException('Bu bemor boshqa Telegram hisobiga biriktirilgan. Klinikaga murojaat qiling');
      }
      // One Telegram account belongs to one patient (unique column): answer clearly instead of a 500
      const holder = await this.prisma.patient.findUnique({ where: { telegramUserId }, select: { id: true } });
      if (holder && holder.id !== patient.id) {
        throw new ConflictException('Bu Telegram hisobi boshqa bemorga biriktirilgan. Klinikaga murojaat qiling');
      }

      patient = await this.prisma.patient.update({
        where: { id: patient.id },
        data: { telegramUserId },
      });

      const debtData = await this.getPatientDebt(telegramUserId);
      return {
        id: patient.id,
        fullName: patient.fullName,
        phone: patient.phone,
        telegramUserId: patient.telegramUserId,
        totalDebt: debtData.totalDebt,
      };
    }

    // 2. Check if a patient already has this telegramUserId
    let patient = await this.prisma.patient.findUnique({
      where: { telegramUserId },
    });

    if (patient) {
      const debtData = await this.getPatientDebt(telegramUserId);
      return {
        id: patient.id,
        fullName: patient.fullName,
        phone: patient.phone,
        telegramUserId: patient.telegramUserId,
        totalDebt: debtData.totalDebt,
      };
    }

    // 3. Find all existing patients sharing this phone
    const existingPatients = await this.prisma.patient.findMany({
      where: { phone: normalized },
    });

    if (existingPatients.length === 0) {
      // No existing patient with this phone: safe to create new
      patient = await this.prisma.patient.create({
        data: {
          phone: normalized,
          fullName: cleanName || 'Telegram Bemor',
          telegramUserId,
          notes: 'Telegram Bot orqali ro\'yxatdan o\'tgan',
        },
      });
    } else if (existingPatients.length === 1) {
      const single = existingPatients[0];
      // Check if existing patient belongs to another telegram account or has a completely different name
      const isNameMatching =
        cleanName.length > 0 &&
        single.fullName.trim().toLowerCase() === cleanName.toLowerCase();

      if (single.telegramUserId && single.telegramUserId !== telegramUserId) {
        // Shared family phone already linked to another family member on Telegram -> create separate patient
        patient = await this.prisma.patient.create({
          data: {
            phone: normalized,
            fullName: cleanName || 'Telegram Bemor',
            telegramUserId,
            notes: 'Telegram Bot orqali ro\'yxatdan o\'tgan (oilaviy raqam)',
          },
        });
      } else if (!isNameMatching && cleanName.length > 0) {
        // Different family member on same phone -> return candidates to confirm or create separate
        return {
          ambiguous: true,
          message: 'Ushbu telefon raqamiga boshqa bemor biriktirilgan. Iltimos, o\'zingizni tanlang:',
          candidates: existingPatients.map((p) => ({
            id: p.id,
            fullName: p.fullName,
            phone: p.phone,
          })),
        };
      } else {
        // Matching name: link telegramUserId
        patient = await this.prisma.patient.update({
          where: { id: single.id },
          data: { telegramUserId },
        });
      }
    } else {
      // Multiple patients exist with this phone (Shared Family Phone)
      const exactMatch = existingPatients.find(
        (p) => p.fullName.trim().toLowerCase() === cleanName.toLowerCase(),
      );

      if (exactMatch && (!exactMatch.telegramUserId || exactMatch.telegramUserId === telegramUserId)) {
        patient = await this.prisma.patient.update({
          where: { id: exactMatch.id },
          data: { telegramUserId },
        });
      } else {
        // Ambiguous: Never silently guess or overwrite family members!
        return {
          ambiguous: true,
          message: 'Ushbu telefon raqamiga bir nechta bemor biriktirilgan. Iltimos, o\'zingizni tanlang:',
          candidates: existingPatients.map((p) => ({
            id: p.id,
            fullName: p.fullName,
            phone: p.phone,
          })),
        };
      }
    }

    const debtData = await this.getPatientDebt(telegramUserId);

    return {
      id: patient.id,
      fullName: patient.fullName,
      phone: patient.phone,
      telegramUserId: patient.telegramUserId,
      totalDebt: debtData.totalDebt,
    };
  }

  async getPatientAppointments(telegramUserId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { telegramUserId },
    });

    if (!patient) {
      throw new NotFoundException('Telegram hisobiga bog\'langan bemor topilmadi');
    }

    const appts = await this.prisma.appointment.findMany({
      where: {
        patientId: patient.id,
        status: {
          in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED, AppointmentStatus.CHECKED_IN],
        },
      },
      include: {
        doctor: {
          include: {
            specialties: { include: { specialty: true } },
          },
        },
        service: { select: { nameUz: true } },
      },
      orderBy: { startTime: 'asc' },
    });

    const timezone = await this.getClinicTimezone();
    return appts.map((a) => {
      // Clinic-local, not UTC
      const datePart = formatInTimeZone(a.startTime, timezone, 'yyyy-MM-dd');
      const timePart = formatInTimeZone(a.startTime, timezone, 'HH:mm');
      const docName = a.doctor ? `Dr. ${a.doctor.firstNameUz} ${a.doctor.lastNameUz}`.trim() : 'Shifokor';
      const spec = a.doctor?.specialties?.[0]?.specialty?.nameUz || a.doctor?.titleUz || 'Stomatolog';
      return {
        id: a.id,
        token: a.publicToken,
        doctorName: docName,
        doctorNameRu: a.doctor ? `Др. ${a.doctor.firstNameRu} ${a.doctor.lastNameRu}`.trim() : 'Врач',
        specialization: spec,
        specializationRu: a.doctor?.specialties?.[0]?.specialty?.nameRu || a.doctor?.titleRu || 'Стоматолог',
        date: datePart,
        time: timePart,
        status: a.status,
        notes: a.note || a.serviceName || a.service?.nameUz || '',
      };
    });
  }

  async getPatientTreatmentPlan(telegramUserId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { telegramUserId },
    });

    if (!patient) {
      throw new NotFoundException('Telegram hisobiga bog\'langan bemor topilmadi');
    }

    const planItems = await this.prisma.treatmentPlanItem.findMany({
      where: {
        patientId: patient.id,
        status: { in: ['PLANNED', 'IN_PROGRESS'] },
      },
      orderBy: { toothNumber: 'asc' },
    });

    // Only the doctor-authored plan is shown. (A previous fallback invented a
    // 150 000 so'm item per non-healthy tooth, showing patients fake prices.)
    const results = planItems.map((p) => ({
      toothNumber: p.toothNumber,
      procedureName: p.treatmentNameUz,
      procedureNameRu: p.treatmentNameRu || p.treatmentNameUz,
      price: p.costUzs,
      status: p.status,
    }));

    return results;
  }

  async getPatientDebt(telegramUserId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { telegramUserId },
      include: {
        invoices: { select: { totalAmount: true, discount: true } },
        payments: { select: { amount: true } },
      },
    });

    if (!patient) {
      throw new NotFoundException('Telegram hisobiga bog\'langan bemor topilmadi');
    }

    const totalBilled = patient.invoices.reduce((sum, inv) => sum + (inv.totalAmount - inv.discount), 0);
    const totalPaid = patient.payments.reduce((sum, p) => sum + p.amount, 0);
    const totalDebt = Math.max(0, totalBilled - totalPaid);

    return {
      patientId: patient.id,
      patientName: patient.fullName,
      telegramUserId: patient.telegramUserId,
      totalDebt,
    };
  }

  async createBooking(dto: CreateBotBookingDto) {
    const telegramUserId = (dto.telegramUserId || '').trim();
    if (!telegramUserId) {
      throw new BadRequestException('telegramUserId kiritilishi shart');
    }

    const patient = await this.prisma.patient.findUnique({
      where: { telegramUserId },
    });

    if (!patient) {
      throw new NotFoundException(
        'Telegram hisobiga bog\'langan bemor topilmadi. Avval bot orqali ro\'yxatdan o\'ting.',
      );
    }

    if (!dto.branchId || !dto.branchId.trim()) {
      throw new BadRequestException('Filial (branchId) tanlanishi shart');
    }
    if (!dto.serviceId || !dto.serviceId.trim()) {
      throw new BadRequestException('Xizmat (serviceId) tanlanishi shart');
    }

    const branch = await this.prisma.branch.findFirst({
      where: { id: dto.branchId, isActive: true },
    });
    if (!branch) {
      throw new BadRequestException('Filial topilmadi yoki faol emas');
    }

    const service = await this.prisma.service.findFirst({
      where: { id: dto.serviceId, isActive: true },
    });
    if (!service) {
      throw new BadRequestException('Xizmat topilmadi yoki faol emas');
    }

    const docBranch = await this.prisma.doctorBranch.findFirst({
      where: { doctorId: dto.doctorId, branchId: dto.branchId },
    });
    if (!docBranch) {
      throw new BadRequestException('Shifokor ushbu filialda ishlamaydi');
    }

    const docService = await this.prisma.doctorService.findFirst({
      where: { doctorId: dto.doctorId, serviceId: dto.serviceId },
    });
    if (!docService) {
      throw new BadRequestException('Shifokor ushbu xizmatni ko\'rsatmaydi');
    }

    // The linked patient's phone was verified via Telegram contact sharing; never
    // trust a phone supplied in the request over it.
    const normalizedPhone = this.normalizePhone(patient.phone || dto.patientPhone || '');

    const bookingResult = await this.appointmentsService.createBooking({
      doctorId: dto.doctorId,
      branchId: dto.branchId,
      serviceId: dto.serviceId,
      startTime: dto.startTime,
      patientName: patient.fullName || dto.patientName || 'Telegram bemor',
      patientPhone: normalizedPhone,
      consentGiven: true,
      source: 'telegram_bot',
      note: dto.notes || 'Telegram bot orqali band qilindi',
    });

    return {
      appointmentId: (bookingResult as any).id || (bookingResult as any).appointmentId,
      publicToken: bookingResult.publicToken,
      doctorName: bookingResult.doctorName,
      startTime: bookingResult.startTime,
      endTime: bookingResult.endTime,
      status: bookingResult.status,
    };
  }

  async cancelAppointment(appointmentId: string, telegramUserId: string) {
    if (!telegramUserId || typeof telegramUserId !== 'string') {
      throw new BadRequestException('telegramUserId kiritilishi shart');
    }

    const appt = await this.prisma.appointment.findFirst({
      where: {
        OR: [{ id: appointmentId }, { publicToken: appointmentId }],
      },
      include: {
        doctor: true,
        patient: true,
      },
    });

    if (!appt) {
      throw new NotFoundException('Qabul topilmadi');
    }

    // Ownership check: Patient linked with this telegramUserId must own the appointment
    if (!appt.patient || !appt.patient.telegramUserId || appt.patient.telegramUserId !== telegramUserId) {
      throw new ForbiddenException('Ushbu qabulni bekor qilishga ruxsat berilmagan');
    }

    // Check terminal states: COMPLETED, CANCELLED, or CHECKED_IN cannot be cancelled by patient
    if (
      ([
        AppointmentStatus.COMPLETED,
        AppointmentStatus.CANCELLED,
        AppointmentStatus.CHECKED_IN,
      ] as AppointmentStatus[]).includes(appt.status)
    ) {
      throw new BadRequestException('Bu qabulni bekor qilib bo\'lmaydi');
    }

    // Reuse complete, transactional AppointmentsService cancellation pipeline
    // (enforcing advisory locks, row lock FOR UPDATE, status transition, outbox & reminder cancellation)
    await this.appointmentsService.changeStatus(
      appt.id,
      AppointmentStatus.CANCELLED,
      'telegram_bot',
      'Bemor Telegram bot orqali bekor qildi',
    );

    const doctorName = appt.doctor ? `Dr. ${appt.doctor.firstNameUz} ${appt.doctor.lastNameUz}`.trim() : 'Shifokor';
    const timezone = await this.getClinicTimezone();

    return {
      success: true,
      appointmentId: appt.id,
      patientName: appt.patient?.fullName || 'Bemor',
      doctorName,
      startTime: appt.startTime,
      // Clinic-local date/time so callers don't render UTC
      dateStr: formatInTimeZone(appt.startTime, timezone, 'dd.MM.yyyy'),
      timeStr: formatInTimeZone(appt.startTime, timezone, 'HH:mm'),
    };
  }

  // ---------------------------------------------------------------------------
  // Telegram reminders & daily schedule digest
  //
  // The backend outbox already sends the 2h reminder over SMS/email, so the bot
  // only adds a 24h Telegram reminder for patients linked to Telegram.
  // Each send is claimed once by inserting a notification_jobs row with a unique
  // deduplication key (status SENT, never PENDING, so the outbox worker never
  // picks it up). The key includes scheduleRevision, so a rescheduled
  // appointment gets a fresh reminder. Rows are not linked via appointmentId so
  // they don't interfere with the outbox's per-appointment job bookkeeping.
  // ---------------------------------------------------------------------------

  private static readonly REMINDER_TEMPLATE = 'bot_patient_reminder_24h';
  private static readonly DIGEST_TEMPLATE = 'bot_staff_daily_schedule';
  private static readonly DOCTOR_DIGEST_TEMPLATE = 'bot_doctor_daily_schedule';
  // Window around "24h before start"; wide enough to survive short bot downtime.
  private static readonly REMINDER_WINDOW_FROM_MS = 23 * 60 * 60 * 1000;
  private static readonly REMINDER_WINDOW_TO_MS = 25 * 60 * 60 * 1000;

  private async getClinicTimezone(): Promise<string> {
    const settings = await this.prisma.clinicSettings.findFirst({ select: { timezone: true } });
    return settings?.timezone || 'Asia/Tashkent';
  }

  private isUniqueViolation(e: unknown): boolean {
    return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
  }

  private async findTelegramReminderCandidates(now: Date) {
    return this.prisma.appointment.findMany({
      where: {
        status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
        startTime: {
          gte: new Date(now.getTime() + BotService.REMINDER_WINDOW_FROM_MS),
          lte: new Date(now.getTime() + BotService.REMINDER_WINDOW_TO_MS),
        },
        patient: { is: { telegramUserId: { not: null } } },
      },
      include: { patient: true, doctor: true, branch: true },
      orderBy: { startTime: 'asc' },
    });
  }

  private toReminderView(
    a: Awaited<ReturnType<BotService['findTelegramReminderCandidates']>>[number],
    timezone: string,
  ) {
    return {
      id: a.id,
      telegramUserId: a.patient?.telegramUserId ?? null,
      patientName: a.patient?.fullName || 'Bemor',
      doctorName: a.doctor ? `Dr. ${a.doctor.firstNameUz} ${a.doctor.lastNameUz}`.trim() : 'Shifokor',
      dateStr: formatInTimeZone(a.startTime, timezone, 'dd.MM.yyyy'),
      timeStr: formatInTimeZone(a.startTime, timezone, 'HH:mm'),
      startTime: a.startTime.toISOString(),
      doctorNameRu: a.doctor ? `Др. ${a.doctor.firstNameRu} ${a.doctor.lastNameRu}`.trim() : 'Врач',
      branchName: a.branch?.nameUz || null,
      branchNameRu: a.branch?.nameRu || null,
      branchAddress: a.branch?.addressUz || null,
      branchAddressRu: a.branch?.addressRu || null,
      branchPhone: a.branch?.phone || null,
      branchMapUrl: a.branch?.mapUrl || null,
      lang: a.patient?.preferredLanguage || 'uz',
      window: '24h' as const,
    };
  }

  /** Read-only preview of reminders that would be sent now (no side effects). */
  async getUpcomingReminders() {
    const timezone = await this.getClinicTimezone();
    const appts = await this.findTelegramReminderCandidates(new Date());
    return appts.map((a) => this.toReminderView(a, timezone));
  }

  /**
   * Atomically claims due 24h Telegram reminders. Each appointment revision is
   * returned at most once across all callers; the caller must send it and
   * report a failure via reportReminderFailure().
   */
  async claimTelegramReminders() {
    const now = new Date();
    const timezone = await this.getClinicTimezone();
    const appts = await this.findTelegramReminderCandidates(now);

    const claimed: Array<ReturnType<BotService['toReminderView']> & { jobId: string }> = [];
    for (const a of appts) {
      const view = this.toReminderView(a, timezone);
      if (!view.telegramUserId) continue;
      try {
        const job = await this.prisma.notificationJob.create({
          data: {
            channel: NotificationChannel.TELEGRAM,
            status: NotificationStatus.SENT,
            templateKey: BotService.REMINDER_TEMPLATE,
            recipient: view.telegramUserId,
            scheduleRevision: a.scheduleRevision,
            attempts: 1,
            sentAt: now,
            deduplicationKey: `${BotService.REMINDER_TEMPLATE}_${a.id}_s${a.scheduleRevision}`,
            payload: { appointmentId: a.id, startTime: view.startTime },
          },
        });
        claimed.push({ ...view, jobId: job.id });
      } catch (e) {
        if (this.isUniqueViolation(e)) continue; // already claimed
        throw e;
      }
    }
    return claimed;
  }

  /** Marks a claimed bot job as failed so the admin outbox shows the real outcome. */
  async reportBotJobFailure(jobId: string, error: string) {
    const res = await this.prisma.notificationJob.updateMany({
      where: {
        id: jobId,
        templateKey: {
          in: [BotService.REMINDER_TEMPLATE, BotService.DIGEST_TEMPLATE, BotService.DOCTOR_DIGEST_TEMPLATE],
        },
      },
      data: {
        status: NotificationStatus.FAILED,
        lastError: (error || 'unknown error').slice(0, 1000),
        sentAt: null,
      },
    });
    if (res.count === 0) {
      throw new NotFoundException('Bot notification job not found');
    }
    return { ok: true };
  }

  /**
   * Today's schedule per doctor in the clinic timezone. Patient names are left
   * out on purpose: this goes to the staff Telegram group, which (like the
   * staff_new_booking alert) carries no patient details.
   */
  async getDailyDoctorSchedules(now: Date = new Date()) {
    const timezone = await this.getClinicTimezone();
    const dateStr = formatInTimeZone(now, timezone, 'yyyy-MM-dd');
    const dayStart = fromZonedTime(`${dateStr} 00:00:00.000`, timezone);
    const dayEnd = fromZonedTime(`${dateStr} 23:59:59.999`, timezone);

    const doctors = await this.prisma.doctor.findMany({
      where: { isActive: true },
      include: {
        appointments: {
          where: {
            status: { in: [AppointmentStatus.CONFIRMED, AppointmentStatus.CHECKED_IN, AppointmentStatus.PENDING] },
            startTime: { gte: dayStart, lte: dayEnd },
          },
          orderBy: { startTime: 'asc' },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    return doctors
      .filter((d) => d.appointments.length > 0)
      .map((d) => ({
        doctorId: d.id,
        doctorName: `Dr. ${d.firstNameUz} ${d.lastNameUz}`.trim(),
        appointments: d.appointments.map((a) => ({
          id: a.id,
          time: formatInTimeZone(a.startTime, timezone, 'HH:mm'),
          serviceName: a.serviceName || '',
        })),
      }));
  }

  /**
   * Claims today's personal schedule for every active doctor whose staff account
   * has a linked Telegram chat. Each doctor gets at most one message per clinic
   * day. Unlike the staff-group digest this includes patient names: it goes to
   * the doctor's private chat and lists only their own appointments.
   */
  async claimDoctorDailySchedules(now: Date = new Date()) {
    const timezone = await this.getClinicTimezone();
    const dateStr = formatInTimeZone(now, timezone, 'yyyy-MM-dd');
    const dayStart = fromZonedTime(`${dateStr} 00:00:00.000`, timezone);
    const dayEnd = fromZonedTime(`${dateStr} 23:59:59.999`, timezone);

    const staff = await this.prisma.staffUser.findMany({
      where: {
        isActive: true,
        telegramUserId: { not: null },
        doctor: { is: { isActive: true, isArchived: false } },
      },
      include: {
        doctor: {
          include: {
            appointments: {
              where: {
                status: { in: [AppointmentStatus.CONFIRMED, AppointmentStatus.CHECKED_IN, AppointmentStatus.PENDING] },
                startTime: { gte: dayStart, lte: dayEnd },
              },
              include: { patient: { select: { fullName: true } } },
              orderBy: { startTime: 'asc' },
            },
          },
        },
      },
    });

    const claimed: Array<{
      jobId: string;
      telegramUserId: string;
      doctorName: string;
      date: string;
      appointments: Array<{ id: string; time: string; patientName: string; serviceName: string }>;
    }> = [];

    for (const s of staff) {
      const doctor = s.doctor;
      if (!doctor || !s.telegramUserId || doctor.appointments.length === 0) continue;
      try {
        const job = await this.prisma.notificationJob.create({
          data: {
            channel: NotificationChannel.TELEGRAM,
            status: NotificationStatus.SENT,
            templateKey: BotService.DOCTOR_DIGEST_TEMPLATE,
            recipient: s.telegramUserId,
            attempts: 1,
            sentAt: now,
            deduplicationKey: `${BotService.DOCTOR_DIGEST_TEMPLATE}_${doctor.id}_${dateStr}`,
            payload: { date: dateStr, doctorId: doctor.id, count: doctor.appointments.length },
          },
        });
        claimed.push({
          jobId: job.id,
          telegramUserId: s.telegramUserId,
          doctorName: `Dr. ${doctor.firstNameUz} ${doctor.lastNameUz}`.trim(),
          date: dateStr,
          appointments: doctor.appointments.map((a) => ({
            id: a.id,
            time: formatInTimeZone(a.startTime, timezone, 'HH:mm'),
            patientName: a.patient?.fullName || 'Bemor',
            serviceName: a.serviceName || '',
          })),
        });
      } catch (e) {
        if (this.isUniqueViolation(e)) continue;
        throw e;
      }
    }
    return claimed;
  }

  /** Claims today's staff digest exactly once per clinic day. */
  async claimDailyScheduleDigest(recipient: string) {
    const now = new Date();
    const timezone = await this.getClinicTimezone();
    const dateStr = formatInTimeZone(now, timezone, 'yyyy-MM-dd');
    const doctors = await this.getDailyDoctorSchedules(now);

    try {
      const job = await this.prisma.notificationJob.create({
        data: {
          channel: NotificationChannel.TELEGRAM,
          status: NotificationStatus.SENT,
          templateKey: BotService.DIGEST_TEMPLATE,
          recipient: recipient || 'staff_group',
          attempts: 1,
          sentAt: now,
          deduplicationKey: `${BotService.DIGEST_TEMPLATE}_${dateStr}`,
          payload: { date: dateStr, doctorCount: doctors.length },
        },
      });
      return { claimed: true, jobId: job.id, date: dateStr, doctors };
    } catch (e) {
      if (this.isUniqueViolation(e)) {
        return { claimed: false, jobId: null, date: dateStr, doctors: [] };
      }
      throw e;
    }
  }
}
