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
import { AppointmentStatus, NotificationChannel, NotificationStatus, Prisma, StaffRole } from '@prisma/client';
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

export function computeBookingFingerprint(params: {
  serviceId: string;
  doctorId: string;
  branchId?: string | null;
  startTimeIso: string;
  patientName: string;
  phone: string;
  email?: string | null;
  note?: string | null;
  consentGiven: boolean;
  scope: 'public' | 'admin';
}): string {
  const normalizedPhone = (params.phone || '').replace(/[\s\-\(\)\+]/g, '');
  const normalizedName = (params.patientName || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const normalizedEmail = (params.email || '').trim().toLowerCase();
  const normalizedNote = (params.note || '').trim();
  const normalizedBranch = (params.branchId || '').trim();
  const normalizedStartTime = new Date(params.startTimeIso).toISOString();

  const canonical = [
    `scope:${params.scope}`,
    `service:${params.serviceId}`,
    `doctor:${params.doctorId}`,
    `branch:${normalizedBranch}`,
    `time:${normalizedStartTime}`,
    `name:${normalizedName}`,
    `phone:${normalizedPhone}`,
    `email:${normalizedEmail}`,
    `note:${normalizedNote}`,
    `consent:${Boolean(params.consentGiven)}`,
  ].join('|');

  return crypto.createHash('sha256').update(canonical).digest('hex');
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

    const scope: 'public' | 'admin' = dto.source === 'admin' ? 'admin' : 'public';
    const reqFingerprint = computeBookingFingerprint({
      serviceId: dto.serviceId,
      doctorId: dto.doctorId,
      branchId: dto.branchId || null,
      startTimeIso: dto.startTime,
      patientName: dto.patientName,
      phone: dto.patientPhone,
      email: dto.patientEmail || null,
      note: dto.note || null,
      consentGiven: dto.consentGiven,
      scope,
    });

    // 1. Idempotency Key Validation
    if (dto.idempotencyKey) {
      const existing = await this.prisma.appointment.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
        include: { doctor: true, service: true, branch: true, patient: true },
      });

      if (existing) {
        // Validate request fingerprint: reject key reuse with ANY altered payload
        let matches = false;
        if (existing.requestFingerprint) {
          matches = existing.requestFingerprint === reqFingerprint;
        } else {
          // Fallback legacy fingerprint check
          const existingStartTime = existing.startTime.toISOString();
          const reqStartTime = new Date(dto.startTime).toISOString();
          const legacyMatch =
            existing.doctorId === dto.doctorId &&
            existing.serviceId === dto.serviceId &&
            existingStartTime === reqStartTime &&
            this.normalizePhone(existing.patient.phone) === this.normalizePhone(dto.patientPhone);
          matches = legacyMatch;
        }

        if (!matches) {
          throw new ConflictException(
            'Idempotency key allaqachon boshqa qabul parametrlari bilan ishlatilgan',
          );
        }

        // Return stable existing appointment response
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

    // 7. Atomic Concurrency Lock and DB Transaction with Bounded Retries for Serialization Conflicts
    // Compute advisory lock key integer based on doctor ID
    const lockKey = this.hashStringToInt(`doc_${dto.doctorId}`);

    let createdAppointment: any;
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // If idempotencyKey was already committed by a concurrent racing transaction
        if (dto.idempotencyKey) {
          const existing = await this.prisma.appointment.findUnique({
            where: { idempotencyKey: dto.idempotencyKey },
            include: { doctor: true, service: true, branch: true },
          });

          if (existing) {
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

        createdAppointment = await this.prisma.$transaction(async (tx) => {
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
              bufferMinutes,
              note: dto.note?.trim() || null,
              source: dto.source || 'website',
              idempotencyKey: dto.idempotencyKey || null,
              requestFingerprint: reqFingerprint,
              revision: 1,
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

        break; // Successfully committed
      } catch (err: any) {
        if (err?.code === 'P2002' && dto.idempotencyKey) {
          const raced = await this.prisma.appointment.findUnique({
            where: { idempotencyKey: dto.idempotencyKey },
            include: { doctor: true, service: true, branch: true, patient: true },
          });
          if (raced) {
            if (raced.requestFingerprint && raced.requestFingerprint !== reqFingerprint) {
              throw new ConflictException('Idempotency key allaqachon boshqa qabul parametrlari bilan ishlatilgan');
            }
            return {
              id: raced.id,
              publicToken: raced.publicToken,
              status: raced.status,
              startTime: raced.startTime,
              endTime: raced.endTime,
              serviceName: raced.serviceName,
              doctor: {
                id: raced.doctor.id,
                firstNameUz: raced.doctor.firstNameUz,
                lastNameUz: raced.doctor.lastNameUz,
                firstNameRu: raced.doctor.firstNameRu,
                lastNameRu: raced.doctor.lastNameRu,
              },
            };
          }
        }

        const isConflict =
          err?.code === 'P2034' ||
          err?.message?.includes('write conflict') ||
          err?.message?.includes('deadlock') ||
          err?.message?.includes('could not serialize');

        if (isConflict && attempt < maxRetries) {
          // Bounded jitter backoff
          await new Promise((res) => setTimeout(res, 50 * attempt + Math.floor(Math.random() * 30)));
          continue;
        }
        throw err;
      }
    }

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
   * Atomic status change with transition validation and row-level locking
   */
  async changeStatus(
    appointmentId: string,
    newStatus: AppointmentStatus,
    changedBy: string,
    reason?: string,
    user?: { role: StaffRole; doctorId?: string | null },
  ) {
    let didCancel = false;

    const updated = await this.prisma.$transaction(async (tx) => {
      // Row lock to ensure atomic status check and update
      const [locked] = await tx.$queryRaw<any[]>`
        SELECT id, status, "doctor_id" as "doctorId", "service_id" as "serviceId", "service_name" as "serviceName"
        FROM "appointments"
        WHERE id = ${appointmentId}
        FOR UPDATE
      `;

      if (!locked) {
        throw new NotFoundException('Qabul topilmadi');
      }

      if (user && user.role === StaffRole.DOCTOR) {
        if (!user.doctorId || locked.doctorId !== user.doctorId) {
          throw new ForbiddenException('Faqat o\'zingizning qabullaringiz holatini o\'zgartira olasiz');
        }
      }

      const currentStatus = locked.status as AppointmentStatus;
      const allowed = ALLOWED_TRANSITIONS[currentStatus];
      if (!allowed || !allowed.includes(newStatus)) {
        throw new BadRequestException(
          `${currentStatus} statusidan ${newStatus} statusiga o'tish taqiqlangan`,
        );
      }

      // Atomic update
      const appt = await tx.appointment.update({
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

      // Record status history inside tx
      await tx.appointmentStatusHistory.create({
        data: {
          appointmentId,
          fromStatus: currentStatus,
          toStatus: newStatus,
          reason,
          changedBy: changedBy || 'system',
        },
      });

      // Record audit log inside tx using actual staff ID if not system/patient
      await tx.auditLog.create({
        data: {
          userId: (changedBy && changedBy !== 'system' && changedBy !== 'patient') ? changedBy : null,
          action: `appointment.status_${newStatus.toLowerCase()}`,
          entity: 'Appointment',
          entityId: appointmentId,
          details: { fromStatus: currentStatus, toStatus: newStatus, reason } as Prisma.InputJsonValue,
        },
      });

      if (newStatus === AppointmentStatus.CANCELLED) {
        didCancel = true;
      }

      return appt;
    });

    // Cancel pending reminders AFTER transaction commits
    if (didCancel) {
      try {
        await this.notificationsService.cancelAppointmentReminders(appointmentId);
      } catch (err: any) {
        this.logger.warn(`Failed to cancel reminders for ${appointmentId}: ${err?.message}`);
      }
    }

    return updated;
  }

  /**
   * Concurrency-safe rescheduling with buffer preservation, booking-window validation,
   * and rollback protection for the original reservation.
   */
  async reschedule(
    appointmentId: string,
    newStartTimeStr: string,
    changedBy: string,
    user?: { role: StaffRole; doctorId?: string | null },
  ) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { service: true, doctor: { include: { services: true } } },
    });

    if (!appointment) {
      throw new NotFoundException('Qabul topilmadi');
    }

    if (user && user.role === StaffRole.DOCTOR) {
      if (!user.doctorId || appointment.doctorId !== user.doctorId) {
        throw new ForbiddenException('Faqat o\'zingizning qabullaringizni qayta rejalashtira olasiz');
      }
    }

    if (([AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW] as AppointmentStatus[]).includes(appointment.status)) {
      throw new BadRequestException('Tugallangan yoki bekor qilingan qabulni qayta rejalashtirib bo\'lmaydi');
    }

    const settings = await this.prisma.clinicSettings.findFirst();
    const timezone = settings?.timezone || 'Asia/Tashkent';
    const minNoticeHours = settings?.minBookingNoticeHours ?? 2;
    const maxHorizonDays = settings?.maxBookingHorizonDays ?? 60;

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

    // CRITICAL: Preserve duration and buffer snapshot! totalMinutes = durationMinutes + bufferMinutes
    const bufferMinutes = appointment.bufferMinutes ?? settings?.bufferMinutes ?? 5;
    const totalMinutes = appointment.durationMinutes + bufferMinutes;
    const newEndTime = new Date(newStartTime.getTime() + totalMinutes * 60 * 1000);

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

    const maxRetries = 3;
    let updated: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        updated = await this.prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;

          // Revalidate current appointment state inside transaction
          const [current] = await tx.$queryRaw<any[]>`
            SELECT id, status, revision FROM "appointments" WHERE id = ${appointmentId} FOR UPDATE
          `;
          if (!current || ([AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW] as string[]).includes(current.status)) {
            throw new BadRequestException('Qabul holati o\'zgarganligi sababli qayta rejalashtirib bo\'lmaydi');
          }

          // Check doctor eligibility and active status inside transaction
          const doctor = await tx.doctor.findUnique({
            where: { id: appointment.doctorId },
            include: { branches: true },
          });
          if (!doctor || !doctor.isActive || doctor.isArchived) {
            throw new BadRequestException('Shifokor faol emas yoki arxivlangan');
          }

          // Check service eligibility and active status inside transaction
          const service = await tx.service.findUnique({
            where: { id: appointment.serviceId },
          });
          if (!service || !service.isActive || service.isArchived) {
            throw new BadRequestException('Xizmat faol emas yoki arxivlangan');
          }

          // Check branch eligibility if set
          if (appointment.branchId) {
            const branch = await tx.branch.findUnique({
              where: { id: appointment.branchId },
            });
            if (!branch || !branch.isActive) {
              throw new BadRequestException('Filial faol emas');
            }
            const isAssigned = doctor.branches.some(b => b.branchId === appointment.branchId);
            if (!isAssigned) {
              throw new BadRequestException('Shifokor bu filialga biriktirilmagan');
            }
          }

          // Validate working hours inside transaction lock
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

          // Adjust management token expiry when moving appointment into future (extend to 7 days after appointment)
          const newExtendedExpiry = new Date(newEndTime.getTime() + 7 * 24 * 60 * 60 * 1000);

          const appt = await tx.appointment.update({
            where: { id: appointmentId },
            data: {
              startTime: newStartTime,
              endTime: newEndTime,
              bufferMinutes,
              revision: { increment: 1 },
              tokenExpiresAt: newExtendedExpiry,
            },
            include: { doctor: true, service: true, patient: true, branch: true },
          });

          await tx.appointmentStatusHistory.create({
            data: {
              appointmentId,
              fromStatus: current.status as AppointmentStatus,
              toStatus: current.status as AppointmentStatus,
              reason: `Qayta rejalashtirildi: ${appointment.startTime.toISOString()} -> ${newStartTime.toISOString()}`,
              changedBy: changedBy || 'patient',
            },
          });

          await tx.auditLog.create({
            data: {
              userId: (changedBy && changedBy !== 'system' && changedBy !== 'patient') ? changedBy : null,
              action: 'appointment.rescheduled',
              entity: 'Appointment',
              entityId: appointmentId,
              details: { oldStartTime: appointment.startTime, newStartTime, revision: appt.revision } as Prisma.InputJsonValue,
            },
          });

          // Transactionally durable notification intent: cancel old reminders in DB
          await tx.notificationJob.updateMany({
            where: {
              appointmentId,
              status: NotificationStatus.PENDING,
              templateKey: 'appointment_reminder',
            },
            data: {
              status: NotificationStatus.CANCELLED,
            },
          });

          // Transactionally schedule new reminder in DB (outbox)
          const reminderTime = new Date(newStartTime.getTime() - 2 * 60 * 60 * 1000);
          if (reminderTime > new Date()) {
            await tx.notificationJob.create({
              data: {
                channel: appt.patient.email ? NotificationChannel.EMAIL : NotificationChannel.SMS,
                templateKey: 'appointment_reminder',
                recipient: appt.patient.email || appt.patient.phone,
                appointmentId: appt.id,
                appointmentRevision: appt.revision,
                scheduledFor: reminderTime,
                deduplicationKey: `reminder_${appt.id}_rev${appt.revision}_${newStartTime.getTime()}`,
                status: NotificationStatus.PENDING,
                payload: {
                  appointmentId: appt.id,
                  serviceName: appt.serviceName,
                  startTime: newStartTime.toISOString(),
                  revision: appt.revision,
                },
              },
            });
          }

          return appt;
        }, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 10000,
        });

        break; // Transaction committed successfully
      } catch (err: any) {
        const isConflict =
          err?.code === 'P2034' ||
          err?.message?.includes('write conflict') ||
          err?.message?.includes('deadlock') ||
          err?.message?.includes('could not serialize');

        if (isConflict && attempt < maxRetries) {
          await new Promise((res) => setTimeout(res, 50 * attempt + Math.floor(Math.random() * 30)));
          continue;
        }
        throw err;
      }
    }

    return updated;
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
    const candidates = await this.prisma.appointment.findMany({
      where: {
        status: AppointmentStatus.PENDING,
        expiresAt: { lte: now },
      },
      select: { id: true },
      take: 50,
    });

    let expiredCount = 0;
    for (const cand of candidates) {
      try {
        let didExpire = false;
        await this.prisma.$transaction(async (tx) => {
          const [locked] = await tx.$queryRaw<any[]>`
            SELECT id, status FROM "appointments" WHERE id = ${cand.id} FOR UPDATE
          `;
          if (!locked || locked.status !== AppointmentStatus.PENDING) {
            return; // Concurrently confirmed or updated!
          }

          await tx.appointment.update({
            where: { id: cand.id },
            data: {
              status: AppointmentStatus.CANCELLED,
              tokenRevokedAt: new Date(),
            },
          });

          await tx.appointmentStatusHistory.create({
            data: {
              appointmentId: cand.id,
              fromStatus: AppointmentStatus.PENDING,
              toStatus: AppointmentStatus.CANCELLED,
              reason: 'Muddati o\'tgani sababli avtomatik bekor qilindi (avto-eskirish)',
              changedBy: 'system',
            },
          });

          await tx.auditLog.create({
            data: {
              userId: null,
              action: 'appointment.status_expired',
              entity: 'Appointment',
              entityId: cand.id,
              details: { reason: 'auto_expired' } as Prisma.InputJsonValue,
            },
          });

          didExpire = true;
        });

        if (didExpire) {
          expiredCount++;
          await this.notificationsService.cancelAppointmentReminders(cand.id);
        }
      } catch (err: any) {
        this.logger.warn(`Failed to process expiry for ${cand.id}: ${err?.message}`);
      }
    }

    if (expiredCount > 0) {
      this.logger.log(`Expired ${expiredCount} abandoned pending appointments with status history and reminder cancellation`);
    }

    return expiredCount;
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
