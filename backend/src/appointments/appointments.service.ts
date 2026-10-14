import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SchedulingService } from '../scheduling/scheduling.service';
import { AppointmentStatus, Prisma } from '@prisma/client';
import { nanoid } from 'nanoid';

// Allowed status transitions
const ALLOWED_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  PENDING: [AppointmentStatus.CONFIRMED, AppointmentStatus.CANCELLED],
  CONFIRMED: [AppointmentStatus.CHECKED_IN, AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW],
  CHECKED_IN: [AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

// Statuses that reserve time
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly schedulingService: SchedulingService,
  ) {}

  /**
   * Create a booking with database-level concurrency safety.
   * Uses PostgreSQL advisory locks to prevent double-booking.
   */
  async createBooking(dto: CreateBookingDto) {
    // Validate consent
    if (!dto.consentGiven) {
      throw new BadRequestException('Shaxsiy ma\'lumotlarni qayta ishlashga rozilik kerak');
    }

    // Check idempotency
    if (dto.idempotencyKey) {
      const existing = await this.prisma.appointment.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
        include: { doctor: true, service: true },
      });
      if (existing) {
        return existing; // Return existing - prevent duplicate
      }
    }

    // Validate service exists and is active
    const service = await this.prisma.service.findUnique({
      where: { id: dto.serviceId },
    });
    if (!service || !service.isActive || service.isArchived) {
      throw new BadRequestException('Xizmat topilmadi');
    }

    // Validate doctor exists and is active
    const doctor = await this.prisma.doctor.findUnique({
      where: { id: dto.doctorId },
      include: { services: true },
    });
    if (!doctor || !doctor.isActive || doctor.isArchived) {
      throw new BadRequestException('Shifokor topilmadi');
    }

    // Validate doctor-service eligibility
    const doctorService = doctor.services.find(ds => ds.serviceId === dto.serviceId);
    if (!doctorService) {
      throw new BadRequestException('Bu shifokor tanlangan xizmatni ko\'rsatmaydi');
    }

    // Get clinic settings
    const settings = await this.prisma.clinicSettings.findFirst();
    const timezone = settings?.timezone || 'Asia/Tashkent';
    const minNoticeHours = settings?.minBookingNoticeHours || 2;
    const maxHorizonDays = settings?.maxBookingHorizonDays || 60;
    const pendingExpiryMinutes = settings?.pendingExpiryMinutes || 30;
    const bufferMinutes = settings?.bufferMinutes || 5;

    // Parse and validate start time
    const startTime = new Date(dto.startTime);
    const now = new Date();

    if (isNaN(startTime.getTime())) {
      throw new BadRequestException('Noto\'g\'ri sana formati');
    }

    // Check minimum booking notice
    const minNoticeTime = new Date(now.getTime() + minNoticeHours * 60 * 60 * 1000);
    if (startTime < minNoticeTime) {
      throw new BadRequestException(
        `Qabulga kamida ${minNoticeHours} soat oldin yozilish kerak`,
      );
    }

    // Check booking horizon
    const maxTime = new Date(now.getTime() + maxHorizonDays * 24 * 60 * 60 * 1000);
    if (startTime > maxTime) {
      throw new BadRequestException(
        `${maxHorizonDays} kundan ko'p muddat uchun bron qilib bo'lmaydi`,
      );
    }

    // Calculate duration
    const durationMinutes = doctorService.customDurationMinutes || service.durationMinutes;
    const totalMinutes = durationMinutes + bufferMinutes;
    const endTime = new Date(startTime.getTime() + totalMinutes * 60 * 1000);

    // Validate against doctor's schedule
    const isAvailable = await this.schedulingService.isTimeSlotAvailable(
      dto.doctorId,
      startTime,
      endTime,
      timezone,
    );
    if (!isAvailable) {
      throw new BadRequestException('Tanlangan vaqt band yoki shifokor ish vaqtidan tashqarida');
    }

    // Normalize phone number
    const phone = this.normalizePhone(dto.patientPhone);

    // Use advisory lock for concurrency safety
    // Lock key based on doctor ID to prevent simultaneous bookings
    const lockKey = this.hashStringToInt(dto.doctorId);

    return this.prisma.$transaction(async (tx) => {
      // Acquire advisory lock (blocks other transactions for same doctor)
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;

      // Double-check for overlapping appointments within the lock
      const overlapping = await tx.appointment.findFirst({
        where: {
          doctorId: dto.doctorId,
          status: { in: TIME_RESERVING_STATUSES },
          startTime: { lt: endTime },
          endTime: { gt: startTime },
        },
      });

      if (overlapping) {
        throw new ConflictException('Bu vaqt allaqachon band. Boshqa vaqtni tanlang.');
      }

      // Find or create patient
      let patient = await tx.patient.findFirst({
        where: { phone },
      });

      if (!patient) {
        patient = await tx.patient.create({
          data: {
            fullName: dto.patientName,
            phone,
            email: dto.patientEmail,
          },
        });
      }

      // Create appointment
      const publicToken = nanoid(32);
      const expiresAt = new Date(now.getTime() + pendingExpiryMinutes * 60 * 1000);

      const appointment = await tx.appointment.create({
        data: {
          publicToken,
          patientId: patient.id,
          doctorId: dto.doctorId,
          serviceId: dto.serviceId,
          branchId: dto.branchId || null,
          status: AppointmentStatus.PENDING,
          startTime,
          endTime,
          serviceName: service.nameUz,
          servicePriceFrom: service.priceFrom,
          durationMinutes,
          note: dto.note,
          source: dto.source || 'website',
          idempotencyKey: dto.idempotencyKey || null,
          consentGiven: dto.consentGiven,
          expiresAt,
        },
        include: {
          doctor: true,
          service: true,
          branch: true,
        },
      });

      // Create status history
      await tx.appointmentStatusHistory.create({
        data: {
          appointmentId: appointment.id,
          fromStatus: null,
          toStatus: AppointmentStatus.PENDING,
          changedBy: 'system',
        },
      });

      // Record consent
      await tx.consentRecord.create({
        data: {
          type: 'booking',
          givenBy: dto.patientName,
          phone,
          consentText: 'Shaxsiy ma\'lumotlarimni qayta ishlashga rozilik beraman',
        },
      });

      return appointment;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 10000,
    });
  }

  /**
   * Change appointment status with validation
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
        `${appointment.status} statusidan ${newStatus} statusiga o'tib bo'lmaydi`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.appointment.update({
        where: { id: appointmentId },
        data: {
          status: newStatus,
          // Clear expiry when confirmed
          expiresAt: newStatus === AppointmentStatus.CONFIRMED ? null : undefined,
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

      return updated;
    });
  }

  /**
   * Reschedule: atomically release old slot and reserve new one
   */
  async reschedule(
    appointmentId: string,
    newStartTime: string,
    changedBy: string,
  ) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { service: true },
    });

    if (!appointment) {
      throw new NotFoundException('Qabul topilmadi');
    }

    if ([AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW].includes(appointment.status)) {
      throw new BadRequestException('Bu qabulni qayta rejalashtirish mumkin emas');
    }

    const startTime = new Date(newStartTime);
    const endTime = new Date(startTime.getTime() + appointment.durationMinutes * 60 * 1000);

    const settings = await this.prisma.clinicSettings.findFirst();
    const timezone = settings?.timezone || 'Asia/Tashkent';

    const isAvailable = await this.schedulingService.isTimeSlotAvailable(
      appointment.doctorId,
      startTime,
      endTime,
      timezone,
      appointmentId, // Exclude current appointment
    );

    if (!isAvailable) {
      throw new BadRequestException('Yangi vaqt band');
    }

    const lockKey = this.hashStringToInt(appointment.doctorId);

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;

      // Double-check overlap excluding current
      const overlapping = await tx.appointment.findFirst({
        where: {
          doctorId: appointment.doctorId,
          status: { in: TIME_RESERVING_STATUSES },
          id: { not: appointmentId },
          startTime: { lt: endTime },
          endTime: { gt: startTime },
        },
      });

      if (overlapping) {
        throw new ConflictException('Yangi vaqt allaqachon band');
      }

      const updated = await tx.appointment.update({
        where: { id: appointmentId },
        data: { startTime, endTime },
        include: { doctor: true, service: true, patient: true, branch: true },
      });

      await tx.appointmentStatusHistory.create({
        data: {
          appointmentId,
          fromStatus: appointment.status,
          toStatus: appointment.status,
          reason: `Qayta rejalashtirildi: ${appointment.startTime.toISOString()} -> ${startTime.toISOString()}`,
          changedBy,
        },
      });

      return updated;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 10000,
    });
  }

  /**
   * Self-service cancel via public token
   */
  async cancelByToken(token: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { publicToken: token },
    });

    if (!appointment) {
      throw new NotFoundException('Qabul topilmadi');
    }

    if ([AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED].includes(appointment.status)) {
      throw new BadRequestException('Bu qabulni bekor qilib bo\'lmaydi');
    }

    return this.changeStatus(appointment.id, AppointmentStatus.CANCELLED, 'patient', 'Bemor tomonidan bekor qilindi');
  }

  /**
   * List appointments with filters
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
  }) {
    const { status, doctorId, branchId, serviceId, dateFrom, dateTo, page = 1, limit = 50 } = params;

    const where: Prisma.AppointmentWhereInput = {};
    if (status) where.status = status;
    if (doctorId) where.doctorId = doctorId;
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
   * Get today's appointments
   */
  async getToday(timezone: string = 'Asia/Tashkent') {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    return this.prisma.appointment.findMany({
      where: {
        startTime: { gte: startOfDay, lte: endOfDay },
      },
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
   * Expire abandoned pending appointments
   */
  async expirePending() {
    const now = new Date();
    const expired = await this.prisma.appointment.findMany({
      where: {
        status: AppointmentStatus.PENDING,
        expiresAt: { lte: now },
      },
    });

    for (const appointment of expired) {
      await this.changeStatus(
        appointment.id,
        AppointmentStatus.CANCELLED,
        'system',
        'Vaqt tugashi sababli avtomatik bekor qilindi',
      );
    }

    return expired.length;
  }

  async findById(id: string) {
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
    return appointment;
  }

  async findByToken(token: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { publicToken: token },
      include: {
        doctor: true,
        service: true,
        branch: true,
      },
    });
    if (!appointment) throw new NotFoundException('Qabul topilmadi');
    // Don't expose patient details via public token
    return {
      id: appointment.id,
      status: appointment.status,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      serviceName: appointment.serviceName,
      doctor: {
        firstNameUz: appointment.doctor.firstNameUz,
        lastNameUz: appointment.doctor.lastNameUz,
        firstNameRu: appointment.doctor.firstNameRu,
        lastNameRu: appointment.doctor.lastNameRu,
      },
      branch: appointment.branch,
    };
  }

  private normalizePhone(phone: string): string {
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('998') && cleaned.length === 12) {
      return '+' + cleaned;
    }
    if (cleaned.length === 9) {
      return '+998' + cleaned;
    }
    if (cleaned.startsWith('8') && cleaned.length === 10) {
      return '+998' + cleaned.substring(1);
    }
    return '+' + cleaned;
  }

  private hashStringToInt(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }
}
