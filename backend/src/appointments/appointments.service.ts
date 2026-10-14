import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { SchedulingService } from '../scheduling/scheduling.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { AppointmentStatus, Prisma, StaffRole } from '@prisma/client';
import { nanoid } from 'nanoid';
import * as crypto from 'crypto';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';

// Allowed status transitions
const ALLOWED_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  PENDING: [AppointmentStatus.CONFIRMED, AppointmentStatus.CANCELLED],
  CONFIRMED: [AppointmentStatus.CHECKED_IN, AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW],
  CHECKED_IN: [AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

// Statuses that reserve doctor time
const TIME_RESERVING_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.PENDING,
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.CHECKED_IN,
];

export interface CreateBookingDto {
  serviceId: string;
  doctorId: string;
  branchId?: string;
  startTime: string; // ISO string
  patientName: string;
  patientPhone: string;
  patientEmail?: string;
  note?: string;
  consentGiven: boolean;
  idempotencyKey?: string;
  source?: string;
}

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly schedulingService: SchedulingService,
    private readonly notificationsService: NotificationsService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Concurrency-safe booking creation with PostgreSQL advisory lock,
   * strict idempotency payload binding, safe family patient resolution, and audit logging.
   */
  async createBooking(dto: CreateBookingDto) {
    if (!dto.consentGiven) {
      throw new BadRequestException('Shaxsiy ma\'lumotlarni qayta ishlashga rozilik zarur');
    }

    // 1. Idempotency Key Validation
    if (dto.idempotencyKey) {
      const existing = await this.prisma.appointment.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
        include: { doctor: true, service: true, branch: true },
      });

      if (existing) {
        // Validate payload consistency: reject key reuse with altered payload
        const reqStartTime = new Date(dto.startTime).getTime();
        const existingStartTime = existing.startTime.getTime();

        if (
          existing.doctorId !== dto.doctorId ||
          existing.serviceId !== dto.serviceId ||
          Math.abs(existingStartTime - reqStartTime) > 1000
        ) {
          throw new ConflictException(
            'Idempotency key allaqachon boshqa qabul parametrlari bilan ishlatilgan',
          );
        }

        // Safe response: NEVER expose management token to a different caller or payload
        return {
          id: existing.id,
          publicToken: existing.publicToken,
          status: existing.status,
          startTime: existing.startTime,
          endTime: existing.endTime,
          serviceName: existing.serviceName,
          doctor: {
            id: existing.doctor.id,
            firstNameUz: existing.doctor.firstNameUz,
            lastNameUz: existing.doctor.lastNameUz,
            firstNameRu: existing.doctor.firstNameRu,
            lastNameRu: existing.doctor.lastNameRu,
          },
        };
      }
    }

    // 2. Validate Service
    const service = await this.prisma.service.findFirst({
      where: { id: dto.serviceId, isActive: true, isArchived: false },
    });
    if (!service) {
      throw new BadRequestException('Xizmat topilmadi yoki faol emas');
    }

    // 3. Validate Doctor
    const doctor = await this.prisma.doctor.findFirst({
      where: { id: dto.doctorId, isActive: true, isArchived: false },
      include: { services: true, branches: true },
    });
    if (!doctor) {
      throw new BadRequestException('Shifokor topilmadi yoki faol emas');
    }

    // 4. Validate Doctor-Service Eligibility
    const doctorService = doctor.services.find(ds => ds.serviceId === dto.serviceId);
    if (!doctorService) {
      throw new BadRequestException('Ushbu shifokor tanlangan xizmatni ko\'rsatmaydi');
    }

    // 5. Validate Branch if provided or resolve
    let resolvedBranchId = dto.branchId;
    if (resolvedBranchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: resolvedBranchId, isActive: true },
      });
      if (!branch) {
        throw new BadRequestException('Filial topilmadi yoki faol emas');
      }
      const isAssigned = doctor.branches.some(b => b.branchId === resolvedBranchId);
      if (!isAssigned) {
        throw new BadRequestException('Shifokor bu filialda ishlamaydi');
      }
    } else {
      resolvedBranchId = doctor.branches[0]?.branchId;
    }

    // 6. Clinic Settings & Time Limits
    const settings = await this.prisma.clinicSettings.findFirst();
    const timezone = settings?.timezone || 'Asia/Tashkent';
    const minNoticeHours = settings?.minBookingNoticeHours ?? 2;
    const maxHorizonDays = settings?.maxBookingHorizonDays ?? 60;
    const pendingExpiryMinutes = settings?.pendingExpiryMinutes ?? 30;
    const bufferMinutes = settings?.bufferMinutes ?? 5;

    const startTimeUtc = new Date(dto.startTime);
    const nowUtc = new Date();

    if (isNaN(startTimeUtc.getTime())) {
      throw new BadRequestException('Noto\'g\'ri sana formati');
    }

    // Notice & Horizon validation
    const minNoticeTime = new Date(nowUtc.getTime() + minNoticeHours * 60 * 60 * 1000);
    if (startTimeUtc < minNoticeTime) {
      throw new BadRequestException(`Qabulga kamida ${minNoticeHours} soat oldin yozilish lozim`);
    }

    const maxHorizonTime = new Date(nowUtc.getTime() + maxHorizonDays * 24 * 60 * 60 * 1000);
    if (startTimeUtc > maxHorizonTime) {
      throw new BadRequestException(`${maxHorizonDays} kundan keyingi muddatga yozilish mumkin emas`);
    }

    // Calculate duration & end time
    const durationMinutes = doctorService.customDurationMinutes ?? service.durationMinutes;
    const totalMinutes = durationMinutes + bufferMinutes;
    const endTimeUtc = new Date(startTimeUtc.getTime() + totalMinutes * 60 * 1000);

    // Validate working hours against doctor's schedule
    const isWorking = await this.schedulingService.isDoctorWorkingAt(
      dto.doctorId,
      startTimeUtc,
      endTimeUtc,
      timezone,
      resolvedBranchId,
    );
    if (!isWorking) {
      throw new BadRequestException('Tanlangan vaqt shifokor ish grafigidan tashqarida');
    }

    const conflictingBeforeLock = await this.prisma.appointment.findFirst({
      where: {
        doctorId: dto.doctorId,
        status: { in: TIME_RESERVING_STATUSES },
        startTime: { lt: endTimeUtc },
        endTime: { gt: startTimeUtc },
      },
    });
    if (conflictingBeforeLock) {
      throw new ConflictException('Bu vaqt allaqachon band qilindi. Iltimos boshqa vaqtni tanlang.');
    }

    const normalizedPhone = this.normalizePhone(dto.patientPhone);
    const cleanName = dto.patientName.trim();

    // 7. Atomic Concurrency Lock and DB Transaction
    // Compute advisory lock key integer based on doctor ID
    const lockKey = this.hashStringToInt(`doc_${dto.doctorId}`);

    const createdAppointment = await this.prisma.$transaction(async (tx) => {
      // Acquire PostgreSQL transactional advisory lock
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;

      // Double check overlap within lock
      const conflicting = await tx.appointment.findFirst({
        where: {
          doctorId: dto.doctorId,
          status: { in: TIME_RESERVING_STATUSES },
          startTime: { lt: endTimeUtc },
          endTime: { gt: startTimeUtc },
        },
      });

      if (conflicting) {
        throw new ConflictException('Bu vaqt allaqachon band qilindi. Iltimos boshqa vaqtni tanlang.');
      }

      // Safe Patient Identification (do not overwrite family members sharing a phone)
      let patient = await tx.patient.findFirst({
        where: {
          phone: normalizedPhone,
          fullName: { equals: cleanName, mode: 'insensitive' },
        },
      });

      if (!patient) {
        // Create distinct patient record for this name
        patient = await tx.patient.create({
          data: {
            fullName: cleanName,
            phone: normalizedPhone,
            email: dto.patientEmail?.trim() || null,
          },
        });
      }

      const publicToken = nanoid(32);
      const expiresAt = new Date(nowUtc.getTime() + pendingExpiryMinutes * 60 * 1000);
      const tokenExpiresAt = new Date(endTimeUtc.getTime() + 7 * 24 * 60 * 60 * 1000);

      const appointment = await tx.appointment.create({
        data: {
          publicToken,
          patientId: patient.id,
          doctorId: dto.doctorId,
          serviceId: dto.serviceId,
          branchId: resolvedBranchId || null,
          status: AppointmentStatus.PENDING,
          startTime: startTimeUtc,
          endTime: endTimeUtc,
          serviceName: service.nameUz,
          servicePriceFrom: service.priceFrom,
          durationMinutes,
          note: dto.note?.trim() || null,
          source: dto.source || 'website',
          idempotencyKey: dto.idempotencyKey || null,
          consentGiven: dto.consentGiven,
          expiresAt,
          tokenExpiresAt,
        },
        include: {
          doctor: true,
          service: true,
          branch: true,
          patient: true,
        },
      });

      // Status history
      await tx.appointmentStatusHistory.create({
        data: {
          appointmentId: appointment.id,
          fromStatus: null,
          toStatus: AppointmentStatus.PENDING,
          changedBy: dto.source === 'admin' ? 'admin' : 'website',
          reason: 'Boshlang\'ich buyurtma',
        },
      });

      // Consent record
      await tx.consentRecord.create({
        data: {
          type: 'booking',
          givenBy: cleanName,
          phone: normalizedPhone,
          consentText: 'Shaxsiy ma\'lumotlarimni qayta ishlashga rozilik beraman',
        },
      });

      return appointment;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 10000,
    });

    // Queue notifications after transaction is successfully committed
    try {
      await this.notificationsService.notifyBookingCreated({
        id: createdAppointment.id,
        startTime: createdAppointment.startTime,
        serviceName: createdAppointment.serviceName,
        patientEmail: createdAppointment.patient.email || undefined,
        patientPhone: createdAppointment.patient.phone,
      });
    } catch (e: any) {
      this.logger.warn(`Failed to queue booking notifications: ${e?.message}`);
    }

    return createdAppointment;
  }

  /**
   * Atomic status change with transition validation
   */
  async changeStatus(
    appointmentId: string,
    newStatus: AppointmentStatus,
    changedBy: string,
    reason?: string,
  ) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
    });

    if (!appointment) {
      throw new NotFoundException('Qabul topilmadi');
    }

    const allowed = ALLOWED_TRANSITIONS[appointment.status];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `${appointment.status} statusidan ${newStatus} statusiga o'tish taqiqlangan`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Atomic update
      const updated = await tx.appointment.update({
        where: { id: appointmentId },
        data: {
          status: newStatus,
          // Clear pending expiry when confirmed
          expiresAt: newStatus === AppointmentStatus.CONFIRMED ? null : undefined,
          // Revoke self-service token if appointment is cancelled or completed
          tokenRevokedAt: ([AppointmentStatus.CANCELLED, AppointmentStatus.COMPLETED] as AppointmentStatus[]).includes(newStatus)
            ? new Date()
            : undefined,
        },
        include: {
          doctor: true,
          service: true,
          patient: true,
          branch: true,
        },
      });

      await tx.appointmentStatusHistory.create({
        data: {
          appointmentId,
          fromStatus: appointment.status,
          toStatus: newStatus,
          reason,
          changedBy,
        },
      });

      await this.auditService.log({
        userId: changedBy.startsWith('staff_') ? changedBy : null,
        action: `appointment.status_${newStatus.toLowerCase()}`,
        entity: 'Appointment',
        entityId: appointmentId,
        details: { fromStatus: appointment.status, toStatus: newStatus, reason },
      });

      // If cancelled, cancel pending reminders
      if (newStatus === AppointmentStatus.CANCELLED) {
        await this.notificationsService.cancelAppointmentReminders(appointmentId);
      }

      return updated;
    });
  }

  /**
   * Concurrency-safe rescheduling with buffer preservation, booking-window validation,
   * and rollback protection for the original reservation.
   */
  async reschedule(
    appointmentId: string,
    newStartTimeStr: string,
    changedBy: string,
  ) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { service: true, doctor: { include: { services: true } } },
    });

    if (!appointment) {
      throw new NotFoundException('Qabul topilmadi');
    }

    if (([AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW] as AppointmentStatus[]).includes(appointment.status)) {
      throw new BadRequestException('Tugallangan yoki bekor qilingan qabulni qayta rejalashtirib bo\'lmaydi');
    }

    const settings = await this.prisma.clinicSettings.findFirst();
    const timezone = settings?.timezone || 'Asia/Tashkent';
    const minNoticeHours = settings?.minBookingNoticeHours ?? 2;
    const maxHorizonDays = settings?.maxBookingHorizonDays ?? 60;
    const bufferMinutes = settings?.bufferMinutes ?? 5;

    const newStartTime = new Date(newStartTimeStr);
    const nowUtc = new Date();

    if (isNaN(newStartTime.getTime())) {
      throw new BadRequestException('Noto\'g\'ri sana formati');
    }

    // Validate booking window
    const minNoticeTime = new Date(nowUtc.getTime() + minNoticeHours * 60 * 60 * 1000);
    if (newStartTime < minNoticeTime) {
      throw new BadRequestException(`Kamida ${minNoticeHours} soat oldin rejalashtirish lozim`);
    }

    const maxHorizonTime = new Date(nowUtc.getTime() + maxHorizonDays * 24 * 60 * 60 * 1000);
    if (newStartTime > maxHorizonTime) {
      throw new BadRequestException(`${maxHorizonDays} kundan keyingi muddatga rejalashtirib bo\'lmaydi`);
    }

    // CRITICAL: Preserve the buffer! totalMinutes = durationMinutes + bufferMinutes
    const totalMinutes = appointment.durationMinutes + bufferMinutes;
    const newEndTime = new Date(newStartTime.getTime() + totalMinutes * 60 * 1000);

    // Validate working hours against doctor's schedule
    const isWorking = await this.schedulingService.isDoctorWorkingAt(
      appointment.doctorId,
      newStartTime,
      newEndTime,
      timezone,
      appointment.branchId || undefined,
    );
    if (!isWorking) {
      throw new BadRequestException('Yangi tanlangan vaqt shifokor ish grafigidan tashqarida');
    }

    const conflictingBeforeLock = await this.prisma.appointment.findFirst({
      where: {
        doctorId: appointment.doctorId,
        status: { in: TIME_RESERVING_STATUSES },
        id: { not: appointmentId },
        startTime: { lt: newEndTime },
        endTime: { gt: newStartTime },
      },
    });
    if (conflictingBeforeLock) {
      throw new ConflictException('Bu yangi vaqt allaqachon band qilindi. Iltimos boshqa vaqtni tanlang.');
    }

    const lockKey = this.hashStringToInt(`doc_${appointment.doctorId}`);

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;

      // Double-check conflicting slots (excluding current appointment)
      const conflicting = await tx.appointment.findFirst({
        where: {
          doctorId: appointment.doctorId,
          status: { in: TIME_RESERVING_STATUSES },
          id: { not: appointmentId },
          startTime: { lt: newEndTime },
          endTime: { gt: newStartTime },
        },
      });

      if (conflicting) {
        throw new ConflictException('Yangi tanlangan vaqt boshqa bemor tomonidan band qilindi');
      }

      const updated = await tx.appointment.update({
        where: { id: appointmentId },
        data: {
          startTime: newStartTime,
          endTime: newEndTime,
        },
        include: { doctor: true, service: true, patient: true, branch: true },
      });

      await tx.appointmentStatusHistory.create({
        data: {
          appointmentId,
          fromStatus: appointment.status,
          toStatus: appointment.status,
          reason: `Qayta rejalashtirildi: ${appointment.startTime.toISOString()} -> ${newStartTime.toISOString()}`,
          changedBy,
        },
      });

      // Update reminders: cancel old and schedule new
      await this.notificationsService.cancelAppointmentReminders(appointmentId);
      const reminderTime = new Date(newStartTime.getTime() - 2 * 60 * 60 * 1000);
      if (reminderTime > new Date()) {
        await this.notificationsService.enqueue({
          channel: updated.patient.email ? 'EMAIL' as any : 'SMS' as any,
          templateKey: 'appointment_reminder',
          recipient: updated.patient.email || updated.patient.phone,
          appointmentId: updated.id,
          scheduledFor: reminderTime,
          deduplicationKey: `reminder_${updated.id}_${newStartTime.getTime()}`,
          payload: {
            appointmentId: updated.id,
            serviceName: updated.serviceName,
            startTime: newStartTime.toISOString(),
          },
        });
      }

      return updated;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 10000,
    });
  }

  /**
   * Self-service cancellation via public management token
   */
  async cancelByToken(token: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { publicToken: token },
    });

    if (!appointment) {
      throw new NotFoundException('Qabul topilmadi');
    }

    if (appointment.tokenRevokedAt || (appointment.tokenExpiresAt && appointment.tokenExpiresAt < new Date())) {
      throw new BadRequestException('Boshqaruv tokenining amal qilish muddati tugagan yoki bekor qilingan');
    }

    if (([AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED] as AppointmentStatus[]).includes(appointment.status)) {
      throw new BadRequestException('Bu qabulni bekor qilib bo\'lmaydi');
    }

    await this.changeStatus(
      appointment.id,
      AppointmentStatus.CANCELLED,
      'patient',
      'Bemor tomonidan bekor qilindi',
    );

    return { message: 'Qabul muvaffaqiyatli bekor qilindi' };
  }

  /**
   * Self-service rescheduling via public token
   */
  async rescheduleByToken(token: string, newStartTime: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { publicToken: token },
    });

    if (!appointment) {
      throw new NotFoundException('Qabul topilmadi');
    }

    if (appointment.tokenRevokedAt || (appointment.tokenExpiresAt && appointment.tokenExpiresAt < new Date())) {
      throw new BadRequestException('Boshqaruv tokenining amal qilish muddati tugagan');
    }

    return this.reschedule(appointment.id, newStartTime, 'patient');
  }

  /**
   * Public read by management token (MINIMAL sanitized fields, zero patient PII)
   */
  async findByToken(token: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { publicToken: token },
      include: { doctor: true, service: true, branch: true },
    });

    if (!appointment) {
      throw new NotFoundException('Qabul topilmadi');
    }

    if (appointment.tokenRevokedAt || (appointment.tokenExpiresAt && appointment.tokenExpiresAt < new Date())) {
      throw new BadRequestException('Boshqaruv tokenining muddati tugagan');
    }

    return {
      id: appointment.id,
      status: appointment.status,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      serviceName: appointment.serviceName,
      doctor: {
        id: appointment.doctor.id,
        firstNameUz: appointment.doctor.firstNameUz,
        lastNameUz: appointment.doctor.lastNameUz,
        firstNameRu: appointment.doctor.firstNameRu,
        lastNameRu: appointment.doctor.lastNameRu,
        photoUrl: appointment.doctor.photoUrl,
      },
      branch: appointment.branch
        ? {
            id: appointment.branch.id,
            nameUz: appointment.branch.nameUz,
            nameRu: appointment.branch.nameRu,
            addressUz: appointment.branch.addressUz,
            addressRu: appointment.branch.addressRu,
          }
        : null,
    };
  }

  /**
   * Doctor-scoped Appointment Listing
   */
  async findAll(params: {
    status?: AppointmentStatus;
    doctorId?: string;
    branchId?: string;
    serviceId?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }, user?: { role: StaffRole; doctorId?: string | null }) {
    const { status, branchId, serviceId, dateFrom, dateTo, page = 1, limit = 50 } = params;

    const where: Prisma.AppointmentWhereInput = {};

    // Strict DOCTOR scoping
    if (user?.role === StaffRole.DOCTOR) {
      if (!user.doctorId) {
        throw new ForbiddenException('Shifokor profili topilmadi');
      }
      where.doctorId = user.doctorId;
    } else if (params.doctorId) {
      where.doctorId = params.doctorId;
    }

    if (status) where.status = status;
    if (branchId) where.branchId = branchId;
    if (serviceId) where.serviceId = serviceId;
    if (dateFrom || dateTo) {
      where.startTime = {};
      if (dateFrom) where.startTime.gte = new Date(dateFrom);
      if (dateTo) where.startTime.lte = new Date(dateTo);
    }

    const [items, total] = await Promise.all([
      this.prisma.appointment.findMany({
        where,
        include: {
          doctor: true,
          service: true,
          patient: {
            select: { id: true, fullName: true, phone: true, email: true },
          },
          branch: true,
        },
        orderBy: { startTime: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.appointment.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  /**
   * Doctor-scoped Today's Appointments with clinic timezone boundaries
   */
  async getToday(timezone: string = 'Asia/Tashkent', user?: { role: StaffRole; doctorId?: string | null }) {
    // Current time in clinic timezone
    const nowUtc = new Date();
    const zonedNow = toZonedTime(nowUtc, timezone);

    // Compute start and end of day in Tashkent
    const localStart = new Date(zonedNow.getFullYear(), zonedNow.getMonth(), zonedNow.getDate(), 0, 0, 0, 0);
    const localEnd = new Date(zonedNow.getFullYear(), zonedNow.getMonth(), zonedNow.getDate(), 23, 59, 59, 999);

    const startUtc = fromZonedTime(localStart, timezone);
    const endUtc = fromZonedTime(localEnd, timezone);

    const where: Prisma.AppointmentWhereInput = {
      startTime: { gte: startUtc, lte: endUtc },
    };

    if (user?.role === StaffRole.DOCTOR) {
      if (!user.doctorId) {
        throw new ForbiddenException('Shifokor profili topilmadi');
      }
      where.doctorId = user.doctorId;
    }

    return this.prisma.appointment.findMany({
      where,
      include: {
        doctor: true,
        service: true,
        patient: {
          select: { id: true, fullName: true, phone: true },
        },
        branch: true,
      },
      orderBy: { startTime: 'asc' },
    });
  }

  /**
   * Doctor-scoped Find by ID
   */
  async findById(id: string, user?: { role: StaffRole; doctorId?: string | null }) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: {
        doctor: true,
        service: true,
        patient: true,
        branch: true,
        statusHistory: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!appointment) throw new NotFoundException('Qabul topilmadi');

    // DOCTOR ownership check
    if (user?.role === StaffRole.DOCTOR) {
      if (!user.doctorId || appointment.doctorId !== user.doctorId) {
        throw new ForbiddenException('Ushbu qabul sizga tegishli emas');
      }
    }

    return appointment;
  }

  /**
   * Background runner for expiring abandoned pending bookings
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async expirePending() {
    const now = new Date();

    // Atomic cancel: update status to CANCELLED only if still PENDING
    const result = await this.prisma.appointment.updateMany({
      where: {
        status: AppointmentStatus.PENDING,
        expiresAt: { lte: now },
      },
      data: {
        status: AppointmentStatus.CANCELLED,
      },
    });

    if (result.count > 0) {
      this.logger.log(`Expired ${result.count} abandoned pending appointments`);
    }

    return result.count;
  }

  private normalizePhone(phone: string): string {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('998') && cleaned.length === 12) {
      return '+' + cleaned;
    }
    if (cleaned.length === 9) {
      return '+998' + cleaned;
    }
    return '+' + cleaned;
  }

  private hashStringToInt(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
}
