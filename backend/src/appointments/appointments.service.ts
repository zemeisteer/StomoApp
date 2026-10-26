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
import { SchedulingService, resolveServiceIds } from '../scheduling/scheduling.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { AppointmentStatus, ExceptionType, NotificationChannel, NotificationStatus, Prisma, StaffRole } from '@prisma/client';
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
export interface ExpectedQuote {
  priceFrom?: number;
  price?: number;
  durationMinutes?: number;
  bufferMinutes?: number;
}

export interface CreateBookingDto {
  serviceId?: string;
  serviceIds?: string[];
  customDurationMinutes?: number;
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
  expectedQuote?: ExpectedQuote;
}

export function computeBookingFingerprint(params: {
  serviceIds: string[];
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
  const canonicalServiceIds = [...params.serviceIds].map((s) => s.trim()).filter(Boolean).sort();

  // Canonical JSON representation with fixed, sorted keys to prevent delimiter collision
  const canonicalObj = {
    branchId: normalizedBranch,
    consentGiven: Boolean(params.consentGiven),
    doctorId: params.doctorId,
    email: normalizedEmail,
    name: normalizedName,
    note: normalizedNote,
    phone: normalizedPhone,
    scope: params.scope,
    serviceIds: canonicalServiceIds,
    startTimeIso: normalizedStartTime,
  };

  return crypto.createHash('sha256').update(JSON.stringify(canonicalObj)).digest('hex');
}

export function verifyFingerprintMatch(
  existingFingerprint: string | null | undefined,
  reqFingerprint: string,
): boolean {
  if (!existingFingerprint) {
    // POLICY: Legacy idempotency rows lacking cryptographic request fingerprints
    // cannot be safely verified; key reuse is rejected to prevent payload mismatch.
    return false;
  }
  return existingFingerprint === reqFingerprint;
}

export function isAppointmentOverlapping(
  appt: {
    startTime: Date | string;
    endTime: Date | string;
    bufferMinutes?: number | null;
    overrunActive?: boolean;
    overrunEstimatedEndTime?: Date | string | null;
  },
  slotStart: Date,
  slotEnd: Date,
): boolean {
  const apptStart = new Date(appt.startTime);
  const apptEnd = new Date(appt.endTime);
  const buffer = appt.bufferMinutes ?? 5;
  const effectiveEnd = (appt.overrunActive && appt.overrunEstimatedEndTime)
    ? new Date(new Date(appt.overrunEstimatedEndTime).getTime() + buffer * 60000)
    : new Date(apptEnd.getTime() + buffer * 60000);

  return apptStart < slotEnd && effectiveEnd > slotStart;
}

export function serializeAppointmentResponse(appointment: any) {
  const doc = appointment.doctor;
  const branch = appointment.branch;
  const docNameUz = doc ? `Dr. ${doc.firstNameUz} ${doc.lastNameUz}`.trim() : undefined;
  const docNameRu = doc ? `Др. ${doc.firstNameRu || doc.firstNameUz} ${doc.lastNameRu || doc.lastNameUz}`.trim() : undefined;
  const docName = appointment.doctorName || docNameUz;
  const branchName = appointment.branchName || branch?.nameUz || '';
  const branchNameUz = branch?.nameUz || branchName;
  const branchNameRu = branch?.nameRu || branchName;

  const serviceItems = (appointment.serviceItems || []).map((item: any) => ({
    id: item.id,
    serviceId: item.serviceId,
    sortOrder: item.sortOrder,
    serviceNameUz: item.serviceNameUz,
    serviceNameRu: item.serviceNameRu,
    durationMinutes: item.durationMinutes,
    priceFrom: item.priceFrom,
    price: item.priceFrom,
    isLegacyBundle: Boolean(item.isLegacyBundle),
  }));

  const serviceItemsTotalDuration = serviceItems.reduce((acc: number, i: any) => acc + (i.durationMinutes || 0), 0);
  const durationAdjustmentMinutes = (appointment.durationMinutes ?? 0) - serviceItemsTotalDuration;

  return {
    id: appointment.id,
    appointmentId: appointment.id,
    publicToken: appointment.publicToken,
    token: appointment.publicToken,
    status: appointment.status,
    expiresAt: appointment.expiresAt,
    tokenExpiresAt: appointment.tokenExpiresAt,
    startTime: appointment.startTime,
    endTime: appointment.endTime,
    serviceName: appointment.serviceName,
    servicePriceFrom: appointment.servicePriceFrom,
    price: appointment.servicePriceFrom,
    priceFrom: appointment.servicePriceFrom,
    durationMinutes: appointment.durationMinutes,
    serviceItemsDurationMinutes: serviceItemsTotalDuration,
    durationAdjustmentMinutes,
    bufferMinutes: appointment.bufferMinutes ?? 0,
    doctorName: docName,
    doctorNameUz: docNameUz || docName,
    doctorNameRu: docNameRu || docName,
    branchName: branchName,
    branchNameUz: branchNameUz,
    branchNameRu: branchNameRu,
    branchAddressUz: branch?.addressUz || '',
    branchAddressRu: branch?.addressRu || branch?.addressUz || '',
    branchId: appointment.branchId,
    serviceId: appointment.serviceId,
    doctorId: appointment.doctorId,
    serviceItems,
    arrivedAt: appointment.arrivedAt,
    actualStartTime: appointment.actualStartTime,
    actualEndTime: appointment.actualEndTime,
    overrunMinutes: appointment.overrunMinutes,
    overrunEstimatedEndTime: appointment.overrunEstimatedEndTime,
    overrunActive: Boolean(appointment.overrunActive),
    overrunReason: appointment.overrunReason,
    overrunUpdatedAt: appointment.overrunUpdatedAt,
    doctor: doc ? {
      id: doc.id,
      firstNameUz: doc.firstNameUz,
      lastNameUz: doc.lastNameUz,
      firstNameRu: doc.firstNameRu,
      lastNameRu: doc.lastNameRu,
    } : undefined,
    patient: appointment.patient ? {
      id: appointment.patient.id,
      fullName: appointment.patient.fullName,
      phone: appointment.patient.phone,
      email: appointment.patient.email,
    } : undefined,
    managementUrl: `/booking/status/${appointment.publicToken}`,
  };
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

    const serviceIds = resolveServiceIds(dto.serviceId, dto.serviceIds);

    const scope: 'public' | 'admin' = dto.source === 'admin' ? 'admin' : 'public';
    const reqFingerprint = computeBookingFingerprint({
      serviceIds,
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

    // 1. Initial Idempotency Key Validation
    if (dto.idempotencyKey) {
      const existing = await this.prisma.appointment.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
        include: {
          doctor: true,
          service: true,
          branch: true,
          patient: true,
          serviceItems: { orderBy: { sortOrder: 'asc' } },
        },
      });

      if (existing) {
        if (!verifyFingerprintMatch(existing.requestFingerprint, reqFingerprint)) {
          throw new ConflictException(
            existing.requestFingerprint
              ? 'Idempotency key allaqachon boshqa qabul parametrlari bilan ishlatilgan'
              : 'Eski idempotency kalitini qayta ishlatish mumkin emas. Iltimos yangi kalit kiriting.',
          );
        }
        return serializeAppointmentResponse(existing);
      }
    }

    // 2. Authoritative Multi-Service Calculation & Eligibility
    const authoritative = await this.schedulingService.calculateAuthoritativeServiceDuration(
      dto.doctorId,
      serviceIds,
    );

    // 3. Validate Doctor and Branch Assignment
    const doctor = await this.prisma.doctor.findFirst({
      where: { id: dto.doctorId, isActive: true, isArchived: false },
      include: { branches: true },
    });
    if (!doctor) {
      throw new BadRequestException('Shifokor topilmadi yoki faol emas');
    }

    let resolvedBranchId = dto.branchId;
    if (scope === 'public' && (!resolvedBranchId || !resolvedBranchId.trim())) {
      throw new BadRequestException('Filial tanlanishi shart');
    }

    if (resolvedBranchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: resolvedBranchId, isActive: true },
      });
      if (!branch) {
        throw new BadRequestException('Filial topilmadi yoki faol emas');
      }
      const isAssigned = doctor.branches.some((b) => b.branchId === resolvedBranchId);
      if (!isAssigned) {
        throw new BadRequestException('Shifokor bu filialda ishlamaydi');
      }
    } else {
      resolvedBranchId = doctor.branches[0]?.branchId;
    }

    // 4. Clinic Settings & Time Limits
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

    // Server-authoritative duration (custom duration is NOT accepted from public control)
    const durationMinutes = authoritative.totalDurationMinutes;
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
    if (!/^\+998\d{9}$/.test(normalizedPhone)) {
      throw new BadRequestException('Telefon raqami O\'zbekiston formati (+998XXXXXXXXX)da bo\'lishi kerak');
    }
    const cleanName = dto.patientName.trim();

    // 5. Atomic Concurrency Lock and DB Transaction with Bounded Retries
    const lockKey = this.hashStringToInt(`doc_${dto.doctorId}`);
    let createdAppointment: any;
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // 2nd path: Retry-loop Idempotency Key Lookup with strict fingerprint check
        if (dto.idempotencyKey) {
          const existingInRetry = await this.prisma.appointment.findUnique({
            where: { idempotencyKey: dto.idempotencyKey },
            include: {
              doctor: true,
              service: true,
              branch: true,
              patient: true,
              serviceItems: { orderBy: { sortOrder: 'asc' } },
            },
          });

          if (existingInRetry) {
            if (!verifyFingerprintMatch(existingInRetry.requestFingerprint, reqFingerprint)) {
              throw new ConflictException(
                existingInRetry.requestFingerprint
                  ? 'Idempotency key allaqachon boshqa qabul parametrlari bilan ishlatilgan'
                  : 'Eski idempotency kalitini qayta ishlatish mumkin emas. Iltimos yangi kalit kiriting.',
              );
            }
            return serializeAppointmentResponse(existingInRetry);
          }
        }

        createdAppointment = await this.prisma.$transaction(async (tx) => {
          // Acquire PostgreSQL transactional advisory lock
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;

          // 3rd path: Idempotency Key committed while waiting for advisory lock
          if (dto.idempotencyKey) {
            const existingInLock = await tx.appointment.findUnique({
              where: { idempotencyKey: dto.idempotencyKey },
              include: {
                doctor: true,
                service: true,
                branch: true,
                patient: true,
                serviceItems: { orderBy: { sortOrder: 'asc' } },
              },
            });
            if (existingInLock) {
              if (!verifyFingerprintMatch(existingInLock.requestFingerprint, reqFingerprint)) {
                throw new ConflictException(
                  existingInLock.requestFingerprint
                    ? 'Idempotency key allaqachon boshqa qabul parametrlari bilan ishlatilgan'
                    : 'Eski idempotency kalitini qayta ishlatish mumkin emas. Iltimos yangi kalit kiriting.',
                );
              }
              return serializeAppointmentResponse(existingInLock);
            }
          }

          // Revalidate doctor inside transaction lock
          const txDoctor = await tx.doctor.findFirst({
            where: { id: dto.doctorId, isActive: true, isArchived: false },
            include: {
              branches: {
                where: { branch: { isActive: true } },
                include: { branch: true },
              },
            },
          });
          if (!txDoctor) {
            throw new BadRequestException('Shifokor topilmadi yoki faol emas');
          }

          // Read authoritative clinic settings inside transaction
          const txSettings = await tx.clinicSettings.findFirst();
          const txTimezone = txSettings?.timezone || 'Asia/Tashkent';
          const txPendingExpiryMinutes = txSettings?.pendingExpiryMinutes ?? 30;
          const txBufferMinutes = txSettings?.bufferMinutes ?? 5;

          // Revalidate or resolve branch consistently with slot endpoint inside transaction
          let txBranchId = dto.branchId;
          if (txBranchId) {
            const branch = await tx.branch.findFirst({
              where: { id: txBranchId, isActive: true },
            });
            if (!branch) {
              throw new BadRequestException('Filial topilmadi yoki faol emas');
            }
            const isAssigned =
              txDoctor.branches.some((b) => b.branchId === txBranchId) ||
              (await tx.doctorSchedule.findFirst({
                where: { doctorId: dto.doctorId, branchId: txBranchId, isActive: true, branch: { isActive: true } },
              })) !== null ||
              (await tx.scheduleException.findFirst({
                where: { doctorId: dto.doctorId, branchId: txBranchId, type: ExceptionType.OVERTIME },
              })) !== null;
            if (!isAssigned) {
              throw new BadRequestException('Shifokor bu filialda ishlamaydi');
            }
          } else {
            // Omitted branch selection: resolve matching branch from doctor's schedules/exceptions or active assignment
            const candidateSchedules = await tx.doctorSchedule.findMany({
              where: { doctorId: dto.doctorId, isActive: true },
              include: { branch: true },
            });
            const dateOnlyZoned = toZonedTime(startTimeUtc, txTimezone);
            const dayOfWeekNum = dateOnlyZoned.getDay();
            const daysArr = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
            const dayOfWeek = daysArr[dayOfWeekNum];
            const timeMinutes = dateOnlyZoned.getHours() * 60 + dateOnlyZoned.getMinutes();

            const matchingSched = candidateSchedules.find((s) => {
              if (s.dayOfWeek !== dayOfWeek || !s.branch?.isActive) return false;
              const [sh, sm] = s.startTime.split(':').map(Number);
              const [eh, em] = s.endTime.split(':').map(Number);
              return timeMinutes >= sh * 60 + sm && timeMinutes < eh * 60 + em;
            });
            txBranchId = matchingSched?.branchId || txDoctor.branches[0]?.branchId || undefined;
          }

          // Revalidate authoritative services and doctor-specific duration within transaction lock
          const txAuthoritative = await this.schedulingService.calculateAuthoritativeServiceDuration(
            dto.doctorId,
            serviceIds,
            tx,
          );

          // Calculate consistent duration, buffer, treatment end, and occupied end
          const txDurationMinutes = txAuthoritative.totalDurationMinutes;
          const txPriceFrom = txAuthoritative.totalPriceFrom;
          const txTreatmentEndTimeUtc = new Date(startTimeUtc.getTime() + txDurationMinutes * 60 * 1000);
          const txOccupiedEndUtc = new Date(startTimeUtc.getTime() + (txDurationMinutes + txBufferMinutes) * 60 * 1000);

          // Authoritative Quote Consistency Check
          if (dto.expectedQuote) {
            const exp = dto.expectedQuote;
            const expPrice = exp.priceFrom !== undefined ? exp.priceFrom : exp.price;

            const priceChanged = expPrice !== undefined && expPrice !== txPriceFrom;
            const durationChanged = exp.durationMinutes !== undefined && exp.durationMinutes !== txDurationMinutes;
            const bufferChanged = exp.bufferMinutes !== undefined && exp.bufferMinutes !== txBufferMinutes;

            if (priceChanged || durationChanged || bufferChanged) {
              throw new ConflictException({
                statusCode: 409,
                error: 'Conflict',
                code: 'QUOTE_CHANGED',
                message: 'Xizmat shartlari (narx yoki davomiylik) o\'zgargan. Iltimos, yangi shartlarni tasdiqlang.',
                quoteChanged: true,
                expectedQuote: {
                  priceFrom: expPrice,
                  price: expPrice,
                  durationMinutes: exp.durationMinutes,
                  bufferMinutes: exp.bufferMinutes,
                },
                currentQuote: {
                  priceFrom: txPriceFrom,
                  price: txPriceFrom,
                  durationMinutes: txDurationMinutes,
                  bufferMinutes: txBufferMinutes,
                },
                materialChanges: {
                  priceChanged,
                  durationChanged,
                  bufferChanged,
                },
              });
            }
          }

          // Revalidate working hours inside protected transaction lock using the full occupied interval
          const isWorkingInLock = await this.schedulingService.isDoctorWorkingAt(
            dto.doctorId,
            startTimeUtc,
            txOccupiedEndUtc,
            txTimezone,
            txBranchId,
            tx,
          );
          if (!isWorkingInLock) {
            throw new BadRequestException('Tanlangan vaqt shifokor ish grafigidan tashqarida');
          }

          // Double check overlap within lock using the occupied interval and active overruns
          const candidateAppts = await tx.appointment.findMany({
            where: {
              doctorId: dto.doctorId,
              status: { in: TIME_RESERVING_STATUSES },
              startTime: { lt: new Date(txOccupiedEndUtc.getTime() + 24 * 60 * 60000) },
              OR: [
                { endTime: { gt: startTimeUtc } },
                { overrunActive: true },
              ],
            },
          });

          const conflicting = candidateAppts.find((a) => {
            // Ignore expired pending appointments; their slot reservation has lapsed
            if (a.status === AppointmentStatus.PENDING && a.expiresAt && a.expiresAt <= nowUtc) {
              return false;
            }
            return isAppointmentOverlapping(a, startTimeUtc, txOccupiedEndUtc);
          });

          if (conflicting) {
            if (conflicting.overrunActive) {
              throw new ConflictException(
                'Shifokor qabuli kechikishi (overrun) sababli ushbu vaqt band. Iltimos boshqa vaqtni tanlang.',
              );
            }
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
            patient = await tx.patient.create({
              data: {
                fullName: cleanName,
                phone: normalizedPhone,
                email: dto.patientEmail?.trim() || null,
              },
            });
          }

          const publicToken = nanoid(32);
          const isStaffCreated = dto.source === 'admin' || dto.source === 'reception';
          const initialStatus = isStaffCreated ? AppointmentStatus.CONFIRMED : AppointmentStatus.PENDING;
          let effectivePendingMinutes = 30;
          if (txPendingExpiryMinutes !== null && txPendingExpiryMinutes !== undefined && !isNaN(txPendingExpiryMinutes)) {
            if (txPendingExpiryMinutes < 5) {
              this.logger.warn(`Clinic pendingExpiryMinutes setting (${txPendingExpiryMinutes}) is below minimum (5 min). Clamping to 5.`);
              effectivePendingMinutes = 5;
            } else if (txPendingExpiryMinutes > 10080) {
              this.logger.warn(`Clinic pendingExpiryMinutes setting (${txPendingExpiryMinutes}) exceeds maximum (10080 min / 7 days). Clamping to 10080.`);
              effectivePendingMinutes = 10080;
            } else {
              effectivePendingMinutes = txPendingExpiryMinutes;
            }
          }
          const expiresAt = isStaffCreated ? null : new Date(nowUtc.getTime() + effectivePendingMinutes * 60 * 1000);
          const tokenExpiresAt = new Date(txTreatmentEndTimeUtc.getTime() + 7 * 24 * 60 * 60 * 1000);

          const appointment = await tx.appointment.create({
            data: {
              publicToken,
              patientId: patient.id,
              doctorId: dto.doctorId,
              serviceId: txAuthoritative.services[0].id,
              branchId: txBranchId || null,
              status: initialStatus,
              startTime: startTimeUtc,
              endTime: txTreatmentEndTimeUtc,
              serviceName: txAuthoritative.combinedNameUz,
              servicePriceFrom: txAuthoritative.totalPriceFrom,
              durationMinutes: txDurationMinutes,
              bufferMinutes: txBufferMinutes,
              note: dto.note?.trim() || null,
              source: dto.source || 'website',
              idempotencyKey: dto.idempotencyKey || null,
              requestFingerprint: reqFingerprint,
              revision: 1,
              consentGiven: dto.consentGiven,
              expiresAt,
              tokenExpiresAt,
              serviceItems: {
                create: txAuthoritative.serviceItems.map((item: any) => ({
                  serviceId: item.serviceId,
                  sortOrder: item.sortOrder,
                  serviceNameUz: item.serviceNameUz,
                  serviceNameRu: item.serviceNameRu,
                  durationMinutes: item.durationMinutes,
                  priceFrom: item.priceFrom,
                })),
              },
            },
            include: {
              doctor: true,
              service: true,
              branch: true,
              patient: true,
              serviceItems: { orderBy: { sortOrder: 'asc' } },
            },
          });

          // Status history
          await tx.appointmentStatusHistory.create({
            data: {
              appointmentId: appointment.id,
              fromStatus: null,
              toStatus: initialStatus,
              changedBy: dto.source === 'admin' ? 'admin' : (dto.source === 'reception' ? 'reception' : 'website'),
              reason: isStaffCreated ? 'Xodim tomonidan yaratildi' : 'Boshlang\'ich buyurtma',
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

          // Transactional Outbox: persist notification intent inside the same transaction
          await this.notificationsService.enqueueBookingCreated(
            {
              id: appointment.id,
              startTime: appointment.startTime,
              serviceName: appointment.serviceName,
              patientEmail: patient.email || undefined,
              patientPhone: patient.phone,
              revision: appointment.revision,
            },
            tx,
          );

          return serializeAppointmentResponse(appointment);
        }, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 10000,
        });

        break; // Successfully committed
      } catch (err: any) {
        // 4th path: P2002 race recovery on idempotencyKey unique constraint
        if (err?.code === 'P2002' && dto.idempotencyKey) {
          const raced = await this.prisma.appointment.findUnique({
            where: { idempotencyKey: dto.idempotencyKey },
            include: {
              doctor: true,
              service: true,
              branch: true,
              patient: true,
              serviceItems: { orderBy: { sortOrder: 'asc' } },
            },
          });
          if (raced) {
            if (!verifyFingerprintMatch(raced.requestFingerprint, reqFingerprint)) {
              throw new ConflictException(
                raced.requestFingerprint
                  ? 'Idempotency key allaqachon boshqa qabul parametrlari bilan ishlatilgan'
                  : 'Eski idempotency kalitini qayta ishlatish mumkin emas. Iltimos yangi kalit kiriting.',
              );
            }
            return serializeAppointmentResponse(raced);
          }
        }

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

    const pre = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: { id: true, doctorId: true },
    });
    if (!pre) throw new NotFoundException('Qabul topilmadi');

    const lockKey = this.hashStringToInt(`doc_${pre.doctorId}`);

    const updated = await this.prisma.$transaction(async (tx) => {
      // 1. Consistent doctor advisory lock first
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;

      // 2. Row lock on appointment FOR UPDATE second
      const [locked] = await tx.$queryRaw<any[]>`
        SELECT id, status, "doctor_id" as "doctorId", "service_id" as "serviceId", "service_name" as "serviceName",
               "start_time" as "startTime", "end_time" as "endTime", "buffer_minutes" as "bufferMinutes",
               "expires_at" as "expiresAt", "branch_id" as "branchId",
               "arrived_at" as "arrivedAt", "actual_start_time" as "actualStartTime"
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

      // When confirming an appointment from PENDING:
      // Verify that this slot has not expired and been booked by another patient in the meantime!
      if (currentStatus === AppointmentStatus.PENDING && newStatus === AppointmentStatus.CONFIRMED) {
        const apptStart = new Date(locked.startTime);
        const apptEnd = new Date(locked.endTime);
        const apptBuf = locked.bufferMinutes ?? 5;
        const apptOccupiedEnd = new Date(apptEnd.getTime() + apptBuf * 60000);

        const candidateConflicting = await tx.appointment.findMany({
          where: {
            doctorId: locked.doctorId,
            id: { not: appointmentId },
            status: { in: TIME_RESERVING_STATUSES },
            startTime: { lt: new Date(apptOccupiedEnd.getTime() + 24 * 60 * 60000) },
            OR: [
              { endTime: { gt: apptStart } },
              { overrunActive: true },
            ],
          },
        });

        const nowUtc = new Date();
        const hasConflict = candidateConflicting.some((other) => {
          if (other.status === AppointmentStatus.PENDING && other.expiresAt && other.expiresAt <= nowUtc) {
            return false;
          }
          return isAppointmentOverlapping(other, apptStart, apptOccupiedEnd);
        });

        if (hasConflict) {
          throw new ConflictException(
            'Ushbu vaqt oralig\'i allaqachon boshqa bemor tomonidan band qilingan. Kutilayotgan qabulni tasdiqlab bo\'lmaydi.',
          );
        }
      }

      const now = new Date();
      const isCheckingIn = newStatus === AppointmentStatus.CHECKED_IN;
      const isCompleting = newStatus === AppointmentStatus.COMPLETED;
      const isReleasing = ([AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW] as AppointmentStatus[]).includes(newStatus);

      // Atomic update
      // CHECKED_IN records patient arrival in waiting room (arrivedAt).
      // actualStartTime is NOT populated here; treatment start is an explicit action.
      // COMPLETED records actualEndTime and clears active overrun.
      // CANCELLED or NO_SHOW clears active overrun.
      const appt = await tx.appointment.update({
        where: { id: appointmentId },
        data: {
          status: newStatus,
          arrivedAt: isCheckingIn ? (locked.arrivedAt || now) : undefined,
          actualEndTime: isCompleting ? now : undefined,
          overrunActive: isReleasing ? false : undefined,
          expiresAt: newStatus === AppointmentStatus.CONFIRMED ? null : undefined,
          tokenRevokedAt: ([AppointmentStatus.CANCELLED, AppointmentStatus.COMPLETED] as AppointmentStatus[]).includes(newStatus)
            ? now
            : undefined,
        },
        include: {
          doctor: true,
          service: true,
          patient: true,
          branch: true,
          serviceItems: { orderBy: { sortOrder: 'asc' } },
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

      // Record audit log inside tx using verified staff ID
      let validStaffId: string | null = null;
      if (changedBy && changedBy !== 'system' && changedBy !== 'patient') {
        const staffExists = await tx.staffUser.findUnique({ where: { id: changedBy }, select: { id: true } });
        if (staffExists) validStaffId = staffExists.id;
      }
      await tx.auditLog.create({
        data: {
          userId: validStaffId,
          action: `appointment.status_${newStatus.toLowerCase()}`,
          entity: 'Appointment',
          entityId: appointmentId,
          details: { fromStatus: currentStatus, toStatus: newStatus, reason } as Prisma.InputJsonValue,
        },
      });

      // Transactional Outbox: persist notification intent for status changes
      if (newStatus === AppointmentStatus.CONFIRMED) {
        await this.notificationsService.enqueueAppointmentConfirmed(
          {
            id: appt.id,
            startTime: appt.startTime,
            serviceName: appt.serviceName,
            patientEmail: appt.patient?.email || undefined,
            patientPhone: appt.patient?.phone || '',
            revision: appt.revision,
          },
          tx,
        );
      } else if (newStatus === AppointmentStatus.CANCELLED) {
        await this.notificationsService.enqueueAppointmentCancelled(
          {
            id: appt.id,
            startTime: appt.startTime,
            serviceName: appt.serviceName,
            patientEmail: appt.patient?.email || undefined,
            patientPhone: appt.patient?.phone || '',
            revision: appt.revision,
          },
          tx,
        );
      }

      return appt;
    });

    return updated;
  }

  /**
   * Explicit action to record treatment start time (separate from clinic arrival)
   */
  async startTreatment(
    appointmentId: string,
    user?: { role: StaffRole; doctorId?: string | null; sub?: string },
  ) {
    const pre = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: { id: true, doctorId: true, status: true },
    });
    if (!pre) throw new NotFoundException('Qabul topilmadi');

    if (user && user.role === StaffRole.DOCTOR) {
      if (!user.doctorId || pre.doctorId !== user.doctorId) {
        throw new ForbiddenException('Faqat o\'zingizning qabullaringizda muolajani boshlay olasiz');
      }
    }

    const lockKey = this.hashStringToInt(`doc_${pre.doctorId}`);

    return await this.prisma.$transaction(async (tx) => {
      // 1. Doctor advisory lock
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;

      // 2. Appointment row lock FOR UPDATE
      const [locked] = await tx.$queryRaw<any[]>`
        SELECT id, status, "doctor_id" as "doctorId", "actual_start_time" as "actualStartTime"
        FROM "appointments"
        WHERE id = ${appointmentId}
        FOR UPDATE
      `;
      if (!locked) throw new NotFoundException('Qabul topilmadi');

      if (user && user.role === StaffRole.DOCTOR && locked.doctorId !== user.doctorId) {
        throw new ForbiddenException('Faqat o\'zingizning qabullaringizda muolajani boshlay olasiz');
      }

      const terminalStatuses: AppointmentStatus[] = [
        AppointmentStatus.COMPLETED,
        AppointmentStatus.CANCELLED,
        AppointmentStatus.NO_SHOW,
      ];
      if (terminalStatuses.includes(locked.status)) {
        throw new BadRequestException('Tugallangan yoki bekor qilingan qabulda muolajani boshlab bo\'lmaydi');
      }

      const now = new Date();
      const updated = await tx.appointment.update({
        where: { id: appointmentId },
        data: {
          actualStartTime: locked.actualStartTime || now,
        },
        include: {
          doctor: true,
          service: true,
          patient: true,
          branch: true,
          serviceItems: { orderBy: { sortOrder: 'asc' } },
        },
      });

      await tx.appointmentStatusHistory.create({
        data: {
          appointmentId,
          fromStatus: locked.status,
          toStatus: locked.status,
          reason: 'Muolaja boshlandi (Shifokor xonasiga kirdi)',
          changedBy: user?.sub || user?.doctorId || 'staff',
        },
      });

      let validStaffId: string | null = null;
      if (user?.sub && user.sub !== 'system') {
        const staffExists = await tx.staffUser.findUnique({ where: { id: user.sub }, select: { id: true } });
        if (staffExists) validStaffId = staffExists.id;
      }
      await tx.auditLog.create({
        data: {
          userId: validStaffId,
          action: 'appointment.treatment_started',
          entity: 'Appointment',
          entityId: appointmentId,
          details: { actualStartTime: now.toISOString() } as Prisma.InputJsonValue,
        },
      });

      return serializeAppointmentResponse(updated);
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
    user?: { role: StaffRole; doctorId?: string | null },
  ) {
    const pre = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: { id: true, doctorId: true, status: true },
    });

    if (!pre) {
      throw new NotFoundException('Qabul topilmadi');
    }

    if (user && user.role === StaffRole.DOCTOR) {
      if (!user.doctorId || pre.doctorId !== user.doctorId) {
        throw new ForbiddenException('Faqat o\'zingizning qabullaringizni qayta rejalashtira olasiz');
      }
    }

    if (([AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW] as AppointmentStatus[]).includes(pre.status)) {
      throw new BadRequestException('Tugallangan yoki bekor qilingan qabulni qayta rejalashtirib bo\'lmaydi');
    }

    const newStartTime = new Date(newStartTimeStr);
    if (isNaN(newStartTime.getTime())) {
      throw new BadRequestException('Noto\'g\'ri sana formati');
    }

    const lockKey = this.hashStringToInt(`doc_${pre.doctorId}`);

    const maxRetries = 3;
    let updated: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        updated = await this.prisma.$transaction(async (tx) => {
          // 1. Acquire doctor advisory lock
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;

          // 2. Acquire row lock on appointment in consistent order
          const [lockedRow] = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT id FROM "appointments" WHERE id = ${appointmentId} FOR UPDATE
          `;
          if (!lockedRow) {
            throw new NotFoundException('Qabul topilmadi');
          }

          // 3. Reread complete current appointment and relevant service items through tx AFTER acquiring locks
          const currentAppt = await tx.appointment.findUnique({
            where: { id: appointmentId },
            include: {
              doctor: { include: { branches: true, services: true } },
              service: true,
              branch: true,
              patient: true,
              serviceItems: { orderBy: { sortOrder: 'asc' } },
            },
          });

          if (!currentAppt) {
            throw new NotFoundException('Qabul topilmadi');
          }

          // 4. Re-check terminal status inside lock
          if (([AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW] as AppointmentStatus[]).includes(currentAppt.status)) {
            throw new BadRequestException('Qabul holati o\'zgarganligi sababli qayta rejalashtirib bo\'lmaydi');
          }

          // 5. Read clinic settings and re-apply current booking window rules inside tx on every attempt
          const settings = await tx.clinicSettings.findFirst();
          const timezone = settings?.timezone || 'Asia/Tashkent';
          const minNoticeHours = settings?.minBookingNoticeHours ?? 2;
          const maxHorizonDays = settings?.maxBookingHorizonDays ?? 60;
          const nowUtc = new Date();

          const minNoticeTime = new Date(nowUtc.getTime() + minNoticeHours * 60 * 60 * 1000);
          if (newStartTime < minNoticeTime) {
            throw new BadRequestException(`Kamida ${minNoticeHours} soat oldin rejalashtirish lozim`);
          }

          const maxHorizonTime = new Date(nowUtc.getTime() + maxHorizonDays * 24 * 60 * 60 * 1000);
          if (newStartTime > maxHorizonTime) {
            throw new BadRequestException(`${maxHorizonDays} kundan keyingi muddatga rejalashtirib bo\'lmaydi`);
          }

          // 6. Calculate new end strictly from current stored duration and buffer (recomputed on every retry)
          const txBufferMinutes = currentAppt.bufferMinutes ?? settings?.bufferMinutes ?? 5;
          const txDurationMinutes = currentAppt.durationMinutes;
          const txTreatmentEndTime = new Date(newStartTime.getTime() + txDurationMinutes * 60 * 1000);
          const txOccupiedEndTime = new Date(newStartTime.getTime() + (txDurationMinutes + txBufferMinutes) * 60 * 1000);

          // 7. Explicit policy for unresolved legacy bundles: do not claim eligibility verified when component services are unknown
          const hasUnresolvedBundle =
            currentAppt.serviceItems.some(
              (si: any) => si.isLegacyBundle || si.legacyProvenance === 'AMBIGUOUS_BUNDLE' || !si.serviceId,
            ) || (!currentAppt.serviceId && currentAppt.serviceItems.length === 0);

          if (hasUnresolvedBundle) {
            throw new BadRequestException(
              'Tarixiy ko\'p xizmatli qabul tarkibi noaniq bo\'lganligi sababli qayta rejalashtirish xodimlar ko\'rib chiqishini talab qiladi',
            );
          }

          // 8. Check doctor activity and branch assignment
          if (!currentAppt.doctor || !currentAppt.doctor.isActive || currentAppt.doctor.isArchived) {
            throw new BadRequestException('Shifokor faol emas yoki arxivlangan');
          }

          if (currentAppt.branchId) {
            if (!currentAppt.branch || !currentAppt.branch.isActive) {
              throw new BadRequestException('Filial faol emas');
            }
            const isAssigned = currentAppt.doctor.branches.some((b) => b.branchId === currentAppt.branchId);
            if (!isAssigned) {
              throw new BadRequestException('Shifokor bu filialga biriktirilmagan');
            }
          }

          // 9. Check every known service's activity and doctor assignment inside transaction
          const itemServiceIds = currentAppt.serviceItems.map((si) => si.serviceId).filter(Boolean) as string[];
          const servicesToCheck = itemServiceIds.length > 0 ? itemServiceIds : (currentAppt.serviceId ? [currentAppt.serviceId] : []);

          if (servicesToCheck.length > 0) {
            const activeServices = await tx.service.findMany({
              where: { id: { in: servicesToCheck } },
            });
            if (activeServices.length !== servicesToCheck.length || activeServices.some((s) => !s.isActive || s.isArchived)) {
              throw new BadRequestException('Tanlangan xizmatlardan biri faol emas yoki arxivlangan');
            }
            const doctorServiceIds = currentAppt.doctor.services.map((s) => s.serviceId);
            for (const sId of servicesToCheck) {
              if (!doctorServiceIds.includes(sId)) {
                throw new BadRequestException('Shifokor ushbu xizmatni ko\'rsatishga biriktirilmagan');
              }
            }
          }

          // 10. Validate working hours inside transaction lock using tx and txOccupiedEndTime!
          const isWorking = await this.schedulingService.isDoctorWorkingAt(
            currentAppt.doctorId,
            newStartTime,
            txOccupiedEndTime,
            timezone,
            currentAppt.branchId || undefined,
            tx,
          );
          if (!isWorking) {
            throw new BadRequestException('Yangi tanlangan vaqt shifokor ish grafigidan tashqarida');
          }

          // 11. Double-check conflicting slots (excluding current appointment) using txOccupiedEndTime and active overruns
          const candidateConflicting = await tx.appointment.findMany({
            where: {
              doctorId: currentAppt.doctorId,
              status: { in: TIME_RESERVING_STATUSES },
              id: { not: appointmentId },
              startTime: { lt: new Date(txOccupiedEndTime.getTime() + 24 * 60 * 60000) },
              OR: [
                { endTime: { gt: newStartTime } },
                { overrunActive: true },
              ],
            },
          });

          const conflicting = candidateConflicting.find((a) =>
            isAppointmentOverlapping(a, newStartTime, txOccupiedEndTime),
          );

          if (conflicting) {
            throw new ConflictException('Yangi tanlangan vaqt boshqa bemor tomonidan band qilindi');
          }

          // 12. Adjust management token expiry when moving appointment into future
          const newExtendedExpiry = new Date(txTreatmentEndTime.getTime() + 7 * 24 * 60 * 60 * 1000);
          const newRevision = currentAppt.revision + 1;
          const newScheduleRevision = (currentAppt.scheduleRevision ?? 1) + 1;

          const appt = await tx.appointment.update({
            where: { id: appointmentId },
            data: {
              startTime: newStartTime,
              endTime: txTreatmentEndTime,
              bufferMinutes: txBufferMinutes,
              revision: newRevision,
              scheduleRevision: newScheduleRevision,
              tokenExpiresAt: newExtendedExpiry,
            },
            include: {
              doctor: true,
              service: true,
              patient: true,
              branch: true,
              serviceItems: { orderBy: { sortOrder: 'asc' } },
            },
          });

          // 13. Record actual prior start time in history and audit log
          await tx.appointmentStatusHistory.create({
            data: {
              appointmentId,
              fromStatus: currentAppt.status as AppointmentStatus,
              toStatus: currentAppt.status as AppointmentStatus,
              reason: `Qayta rejalashtirildi: ${currentAppt.startTime.toISOString()} -> ${newStartTime.toISOString()}`,
              changedBy: changedBy || 'patient',
            },
          });

          await tx.auditLog.create({
            data: {
              userId: (changedBy && changedBy !== 'system' && changedBy !== 'patient') ? changedBy : null,
              action: 'appointment.rescheduled',
              entity: 'Appointment',
              entityId: appointmentId,
              details: {
                oldStartTime: currentAppt.startTime,
                newStartTime,
                durationMinutes: txDurationMinutes,
                bufferMinutes: txBufferMinutes,
                newEndTime: txTreatmentEndTime,
                revision: appt.revision,
                scheduleRevision: newScheduleRevision,
              } as Prisma.InputJsonValue,
            },
          });

          // 14. Transactionally durable notification intent for rescheduling
          await this.notificationsService.enqueueAppointmentRescheduled(
            {
              id: appt.id,
              startTime: appt.startTime,
              serviceName: appt.serviceName,
              patientEmail: appt.patient?.email || undefined,
              patientPhone: appt.patient?.phone || '',
              revision: appt.revision,
              scheduleRevision: appt.scheduleRevision,
            },
            tx,
          );

          return serializeAppointmentResponse(appt);
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
   * Admin-only duration override with bounds (5..480 min), safe concurrency locks,
   * working hour validation within tx, transactional reminder revision update, and audit logging.
   */
  async overrideDuration(
    appointmentId: string,
    durationMinutes: number,
    userId: string,
    reason?: string,
    user?: { role: StaffRole; doctorId?: string | null },
  ) {
    if (user && user.role !== StaffRole.OWNER && user.role !== StaffRole.ADMIN) {
      throw new ForbiddenException('Faqat admin yoki owner qabul davomiyligini o\'zgartira oladi');
    }

    if (!Number.isFinite(durationMinutes) || durationMinutes < 5 || durationMinutes > 480) {
      throw new BadRequestException('Davomiylik 5 dan 480 minutgacha bo\'lishi kerak');
    }

    const pre = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: { id: true, doctorId: true, status: true },
    });
    if (!pre) {
      throw new NotFoundException('Qabul topilmadi');
    }
    if (([AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW] as AppointmentStatus[]).includes(pre.status)) {
      throw new BadRequestException('Tugallangan yoki bekor qilingan qabul davomiyligini o\'zgartirib bo\'lmaydi');
    }

    const lockKey = this.hashStringToInt(`doc_${pre.doctorId}`);
    const maxRetries = 3;
    let updated: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        updated = await this.prisma.$transaction(
          async (tx) => {
            // 1. Acquire shared doctor advisory lock
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;

            // 2. Acquire row lock on appointment in consistent order
            const [locked] = await tx.$queryRaw<Array<{ id: string; status: string; revision: number }>>`
              SELECT id, status, revision FROM appointments WHERE id = ${appointmentId} FOR UPDATE
            `;
            if (!locked) {
              throw new NotFoundException('Qabul topilmadi');
            }

            // 3. Re-read appointment with all relations inside transaction
            const currentAppt = await tx.appointment.findUnique({
              where: { id: appointmentId },
              include: {
                doctor: true,
                service: true,
                branch: true,
                patient: true,
                serviceItems: { orderBy: { sortOrder: 'asc' } },
              },
            });
            if (!currentAppt) {
              throw new NotFoundException('Qabul topilmadi');
            }

            // 4. Reject terminal states
            if (([AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW] as AppointmentStatus[]).includes(currentAppt.status)) {
              throw new BadRequestException('Tugallangan yoki bekor qilingan qabul davomiyligini o\'zgartirib bo\'lmaydi');
            }

            // 5. Calculate new end time from current start time and stored buffer
            const settings = await tx.clinicSettings.findFirst();
            const timezone = settings?.timezone || 'Asia/Tashkent';
            const bufferMinutes = currentAppt.bufferMinutes ?? settings?.bufferMinutes ?? 5;
            const totalMinutes = durationMinutes + bufferMinutes;
            const newEndTime = new Date(currentAppt.startTime.getTime() + totalMinutes * 60 * 1000);

            // 6. Validate working hours through transaction client tx
            const isWorking = await this.schedulingService.isDoctorWorkingAt(
              currentAppt.doctorId,
              currentAppt.startTime,
              newEndTime,
              timezone,
              currentAppt.branchId || undefined,
              tx,
            );
            if (!isWorking) {
              throw new BadRequestException('Yangi davomiylik shifokor ish grafigidan tashqariga chiqadi');
            }

            // 7. Validate overlap through transaction client tx
            const conflicting = await tx.appointment.findFirst({
              where: {
                doctorId: currentAppt.doctorId,
                status: { in: TIME_RESERVING_STATUSES },
                id: { not: appointmentId },
                startTime: { lt: newEndTime },
                endTime: { gt: currentAppt.startTime },
              },
            });
            if (conflicting) {
              throw new ConflictException('Davomiylikni uzaytirish boshqa qabul bilan to\'qnashuv keltiradi');
            }

            const newRevision = currentAppt.revision + 1;
            const saved = await tx.appointment.update({
              where: { id: appointmentId },
              data: {
                durationMinutes,
                endTime: newEndTime,
                revision: newRevision,
              },
              include: {
                doctor: true,
                service: true,
                branch: true,
                patient: true,
                serviceItems: { orderBy: { sortOrder: 'asc' } },
              },
            });

            // 8. Coherent transactional reminder lifecycle covering PENDING and PROCESSING jobs:
            // Update PENDING reminder jobs so they reflect the new revision
            await tx.notificationJob.updateMany({
              where: {
                appointmentId: currentAppt.id,
                templateKey: 'appointment_reminder',
                status: NotificationStatus.PENDING,
              },
              data: {
                appointmentRevision: newRevision,
              },
            });

            // Ensure an eligible upcoming appointment retains a valid reminder for its current schedule.
            // Uses deliberate recovery policy distinguishing active, delivered, retryable-failed, and deliberately-cancelled jobs.
            const currentScheduleRev = currentAppt.scheduleRevision ?? 1;
            await this.notificationsService.recoverOrEnqueueCurrentReminder(
              {
                id: currentAppt.id,
                startTime: currentAppt.startTime,
                serviceName: currentAppt.serviceName,
                patientEmail: currentAppt.patient?.email,
                patientPhone: currentAppt.patient?.phone || '',
                status: currentAppt.status,
                revision: newRevision,
                scheduleRevision: currentScheduleRev,
              },
              tx,
            );

            // 9. Record previous values, adjustments, and reason in audit log
            const serviceItemsTotal = currentAppt.serviceItems.reduce((acc, i) => acc + i.durationMinutes, 0);
            await tx.auditLog.create({
              data: {
                userId,
                action: 'appointment.duration_override',
                entity: 'Appointment',
                entityId: appointmentId,
                details: {
                  previousDurationMinutes: currentAppt.durationMinutes,
                  newDurationMinutes: durationMinutes,
                  previousEndTime: currentAppt.endTime.toISOString(),
                  newEndTime: newEndTime.toISOString(),
                  serviceItemsTotalDuration: serviceItemsTotal,
                  adjustmentMinutes: durationMinutes - serviceItemsTotal,
                  reason: reason || 'Admin duration override',
                } as Prisma.InputJsonValue,
              },
            });

            return serializeAppointmentResponse(saved);
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            timeout: 10000,
          },
        );

        break;
      } catch (err: any) {
        const isConflict =
          err?.code === 'P2034' ||
          err?.message?.includes('could not serialize access') ||
          err?.message?.includes('deadlock detected');
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

    if (
      appointment.tokenRevokedAt ||
      (appointment.tokenExpiresAt && appointment.tokenExpiresAt < new Date()) ||
      (appointment.status === AppointmentStatus.PENDING && appointment.expiresAt && appointment.expiresAt < new Date())
    ) {
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

    if (
      appointment.tokenRevokedAt ||
      (appointment.tokenExpiresAt && appointment.tokenExpiresAt < new Date()) ||
      (appointment.status === AppointmentStatus.PENDING && appointment.expiresAt && appointment.expiresAt < new Date())
    ) {
      throw new BadRequestException('Boshqaruv tokenining amal qilish muddati tugagan');
    }

    return this.reschedule(appointment.id, newStartTime, 'patient');
  }

  /**
   * Internal raw lookup by management token with token validation
   */
  async findRawByToken(token: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { publicToken: token },
    });

    if (!appointment) {
      throw new NotFoundException('Qabul topilmadi');
    }

    if (
      appointment.tokenRevokedAt ||
      (appointment.tokenExpiresAt && appointment.tokenExpiresAt < new Date()) ||
      (appointment.status === AppointmentStatus.PENDING && appointment.expiresAt && appointment.expiresAt < new Date())
    ) {
      throw new BadRequestException('Boshqaruv tokenining muddati tugagan');
    }

    return appointment;
  }

  /**
   * Public read by management token (MINIMAL sanitized fields, zero patient PII)
   */
  async findByToken(token: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { publicToken: token },
      include: {
        doctor: true,
        service: true,
        branch: true,
        serviceItems: { orderBy: { sortOrder: 'asc' } },
      },
    });

    if (!appointment) {
      throw new NotFoundException('Qabul topilmadi');
    }

    if (appointment.tokenRevokedAt || (appointment.tokenExpiresAt && appointment.tokenExpiresAt < new Date())) {
      throw new BadRequestException('Boshqaruv tokenining muddati tugagan');
    }

    const doctorFullNameUz = `Dr. ${appointment.doctor.firstNameUz} ${appointment.doctor.lastNameUz}`.trim();
    const doctorFullNameRu = `Д-р ${appointment.doctor.firstNameRu} ${appointment.doctor.lastNameRu}`.trim();
    const branchNameUz = appointment.branch?.nameUz || '';
    const branchNameRu = appointment.branch?.nameRu || '';

    return {
      id: appointment.id,
      status: appointment.status,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      durationMinutes: appointment.durationMinutes,
      serviceItemsDurationMinutes: (appointment.serviceItems || []).reduce((acc: number, i: any) => acc + (i.durationMinutes || 0), 0),
      durationAdjustmentMinutes: appointment.durationMinutes - (appointment.serviceItems || []).reduce((acc: number, i: any) => acc + (i.durationMinutes || 0), 0),
      bufferMinutes: appointment.bufferMinutes,
      serviceName: appointment.serviceName,
      servicePriceFrom: appointment.servicePriceFrom,
      price: appointment.servicePriceFrom,
      serviceId: appointment.serviceId,
      doctorId: appointment.doctorId,
      branchId: appointment.branchId,
      doctorName: doctorFullNameUz,
      branchName: branchNameUz,
      serviceItems: (appointment.serviceItems || []).map((si: any) => ({
        ...si,
        price: si.priceFrom,
        priceFrom: si.priceFrom,
      })),
      doctor: {
        id: appointment.doctor.id,
        firstNameUz: appointment.doctor.firstNameUz,
        lastNameUz: appointment.doctor.lastNameUz,
        firstNameRu: appointment.doctor.firstNameRu,
        lastNameRu: appointment.doctor.lastNameRu,
        fullNameUz: doctorFullNameUz,
        fullNameRu: doctorFullNameRu,
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
    search?: string;
  }, user?: { role: StaffRole; doctorId?: string | null }) {
    const { status, branchId, serviceId, dateFrom, dateTo, search, page = 1, limit = 50 } = params;

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

    if (search && search.trim()) {
      const q = search.trim();
      const digits = q.replace(/\D/g, '');
      const orFilters: Prisma.AppointmentWhereInput[] = [
        { patient: { fullName: { contains: q, mode: 'insensitive' } } },
        { patient: { phone: { contains: q } } },
      ];
      if (digits.length >= 3) {
        orFilters.push({ patient: { phone: { contains: digits } } });
      }
      where.OR = orFilters;
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
          serviceItems: { orderBy: { sortOrder: 'asc' } },
        },
        orderBy: { startTime: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.appointment.count({ where }),
    ]);

    return {
      items: items.map((a: any) => ({
        ...a,
        price: a.servicePriceFrom,
        serviceItems: (a.serviceItems || []).map((si: any) => ({
          ...si,
          price: si.priceFrom,
          priceFrom: si.priceFrom,
        })),
      })),
      total,
      page,
      limit,
    };
  }

  /**
   * Month overview daily aggregates for complete non-paginated calendar grid
   */
  async getMonthAggregates(
    params: {
      year: number;
      month: number;
      doctorId?: string;
      branchId?: string;
      status?: AppointmentStatus;
    },
    user?: { role: StaffRole; doctorId?: string | null },
  ) {
    const { year, month, branchId, status } = params;
    let doctorId = params.doctorId;

    if (user?.role === StaffRole.DOCTOR) {
      if (!user.doctorId) {
        throw new ForbiddenException('Shifokor profili topilmadi');
      }
      doctorId = user.doctorId;
    }

    const settings = await this.prisma.clinicSettings.findFirst();
    const tz = settings?.timezone?.trim() || 'Asia/Tashkent';

    const monthStr = String(month).padStart(2, '0');
    const startIso = `${year}-${monthStr}-01T00:00:00`;
    const lastDay = new Date(year, month, 0).getDate();
    const endIso = `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}T23:59:59.999`;

    const startUtc = fromZonedTime(startIso, tz);
    const endUtc = fromZonedTime(endIso, tz);

    const rows = await this.prisma.$queryRaw<Array<{
      day: string;
      total: number;
      pending: number;
      confirmed: number;
      checked_in: number;
      completed: number;
      cancelled: number;
      no_show: number;
    }>>`
      SELECT
        TO_CHAR(timezone(${tz}, "start_time"), 'YYYY-MM-DD') AS day,
        COUNT(*)::int AS total,
        COUNT(CASE WHEN status = 'PENDING' THEN 1 END)::int AS pending,
        COUNT(CASE WHEN status = 'CONFIRMED' THEN 1 END)::int AS confirmed,
        COUNT(CASE WHEN status = 'CHECKED_IN' THEN 1 END)::int AS checked_in,
        COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END)::int AS completed,
        COUNT(CASE WHEN status = 'CANCELLED' THEN 1 END)::int AS cancelled,
        COUNT(CASE WHEN status = 'NO_SHOW' THEN 1 END)::int AS no_show
      FROM "appointments"
      WHERE "start_time" >= ${startUtc} AND "start_time" <= ${endUtc}
        AND (${doctorId || null}::text IS NULL OR "doctor_id" = ${doctorId || null})
        AND (${branchId || null}::text IS NULL OR "branch_id" = ${branchId || null})
        AND (${status || null}::"appointment_status" IS NULL OR "status" = ${status || null}::"appointment_status")
      GROUP BY day
      ORDER BY day ASC;
    `;

    const dailyCounts: Record<string, {
      total: number;
      pending: number;
      confirmed: number;
      checkedIn: number;
      completed: number;
      cancelled: number;
      noShow: number;
    }> = {};

    for (const r of rows) {
      dailyCounts[r.day] = {
        total: Number(r.total),
        pending: Number(r.pending),
        confirmed: Number(r.confirmed),
        checkedIn: Number(r.checked_in),
        completed: Number(r.completed),
        cancelled: Number(r.cancelled),
        noShow: Number(r.no_show),
      };
    }

    const totalCount = Object.values(dailyCounts).reduce((acc, d) => acc + d.total, 0);

    return {
      year,
      month,
      totalCount,
      dailyCounts,
    };
  }

  /**
   * Doctor-scoped Today's Appointments with clinic timezone boundaries
   */
  async getToday(timezone?: string, user?: { role: StaffRole; doctorId?: string | null }) {
    let effectiveTz = timezone;
    if (!effectiveTz) {
      const settings = await this.prisma.clinicSettings.findFirst();
      effectiveTz = settings?.timezone?.trim() || 'Asia/Tashkent';
    }

    // Current time in clinic timezone
    const nowUtc = new Date();
    const zonedNow = toZonedTime(nowUtc, effectiveTz);

    // Compute start and end of day in clinic timezone
    const y = zonedNow.getFullYear();
    const m = String(zonedNow.getMonth() + 1).padStart(2, '0');
    const d = String(zonedNow.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;

    const startUtc = fromZonedTime(`${dateStr} 00:00:00`, effectiveTz);
    const endUtc = fromZonedTime(`${dateStr} 23:59:59.999`, effectiveTz);

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
        serviceItems: { orderBy: { sortOrder: 'asc' } },
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
        serviceItems: { orderBy: { sortOrder: 'asc' } },
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
  async expirePending(): Promise<number> {
    const now = new Date();
    const candidates = await this.prisma.appointment.findMany({
      where: {
        status: AppointmentStatus.PENDING,
        expiresAt: { not: null, lte: now },
        NOT: {
          source: { in: ['admin', 'reception'] },
        },
      },
      select: { id: true },
      take: 100,
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

  /**
   * Controlled Delay & Overrun workflow
   * Concurrency-safe: Doctor advisory lock + row lock FOR UPDATE inside transaction
   * Atomic ADD calculation, ownership/status re-validation, bounded retries, and accurate preview
   */
  async recordDelay(
    id: string,
    delayMinutes: number,
    reason: string | undefined,
    user: { role: StaffRole; doctorId?: string | null; sub?: string },
    mode: 'REPLACE' | 'ADD' = 'REPLACE',
  ) {
    if (typeof delayMinutes !== 'number' || isNaN(delayMinutes) || delayMinutes < 5 || delayMinutes > 240) {
      throw new BadRequestException('Kechikish vaqti 5 dan 240 daqiqagacha bo\'lishi shart');
    }

    // Pre-read to resolve doctorId for consistent lock ordering
    const pre = await this.prisma.appointment.findUnique({
      where: { id },
      select: { id: true, doctorId: true, status: true },
    });
    if (!pre) {
      throw new NotFoundException('Qabul topilmadi');
    }

    if (user.role === StaffRole.DOCTOR) {
      if (!user.doctorId) {
        throw new ForbiddenException('Shifokor profiliga biriktirilmagan foydalanuvchi');
      }
      if (pre.doctorId !== user.doctorId) {
        throw new ForbiddenException('Shifokor faqat o‘z qabulidagi kechikishni qayd eta oladi');
      }
    }

    const lockKey = this.hashStringToInt(`doc_${pre.doctorId}`);

    return await this.prisma.$transaction(async (tx) => {
      // 1. Consistent doctor advisory lock first
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;

      // 2. Row lock on appointment FOR UPDATE inside transaction
      const [locked] = await tx.$queryRaw<Array<{
        id: string;
        doctorId: string;
        status: AppointmentStatus;
        startTime: Date;
        endTime: Date;
        bufferMinutes: number | null;
        overrunMinutes: number | null;
        overrunActive: boolean;
      }>>`
        SELECT id, "doctor_id" as "doctorId", status, "start_time" as "startTime",
               "end_time" as "endTime", "buffer_minutes" as "bufferMinutes",
               "overrun_minutes" as "overrunMinutes", "overrun_active" as "overrunActive"
        FROM "appointments"
        WHERE id = ${id}
        FOR UPDATE
      `;

      if (!locked) {
        throw new NotFoundException('Qabul topilmadi');
      }

      // 3. Ownership re-validation on locked state
      if (user.role === StaffRole.DOCTOR && locked.doctorId !== user.doctorId) {
        throw new ForbiddenException('Shifokor faqat o‘z qabulidagi kechikishni qayd eta oladi');
      }

      // 4. Status re-validation on locked state (reject terminal appointments immediately)
      const permittedStatuses: AppointmentStatus[] = [AppointmentStatus.CONFIRMED, AppointmentStatus.CHECKED_IN];
      if (!permittedStatuses.includes(locked.status)) {
        throw new BadRequestException(
          `Kechikish faqat tasdiqlangan yoki klinikaga kelgan qabullarga kiritilishi mumkin (Hozirgi holat: ${locked.status})`,
        );
      }

      // 5. Atomic calculation of effective delay from current locked state
      const effectiveDelay = mode === 'ADD'
        ? (locked.overrunMinutes || 0) + delayMinutes
        : delayMinutes;

      if (effectiveDelay < 5 || effectiveDelay > 240) {
        throw new BadRequestException('Umumiy kechikish vaqti 5 dan 240 daqiqagacha bo\'lishi lozim');
      }

      const buffer = locked.bufferMinutes ?? 5;
      const scheduledEndTime = new Date(locked.endTime);
      const scheduledTreatmentEnd = new Date(scheduledEndTime.getTime() - buffer * 60000);
      const estimatedEndTime = new Date(scheduledTreatmentEnd.getTime() + effectiveDelay * 60000);
      const estimatedFreeTime = new Date(estimatedEndTime.getTime() + buffer * 60000);

      // 6. Update appointment state atomically inside transaction
      const saved = await tx.appointment.update({
        where: { id: locked.id },
        data: {
          overrunMinutes: effectiveDelay,
          overrunEstimatedEndTime: estimatedEndTime,
          overrunActive: true,
          overrunReason: reason ? reason.trim() : null,
          overrunUpdatedAt: new Date(),
        },
      });

      // 7. Write history log inside transaction
      const delayNotice = `[KECHIKISH: ${effectiveDelay} daqiqa (${mode === 'ADD' ? '+' + delayMinutes : 'belgilandi'})] ${
        reason ? reason.trim() : 'Muolaja vaqti cho‘zildi'
      }. Kutilayotgan tugash: ${estimatedEndTime.toISOString()}`;

      await tx.appointmentStatusHistory.create({
        data: {
          appointmentId: locked.id,
          fromStatus: locked.status,
          toStatus: locked.status,
          reason: delayNotice,
          changedBy: user.sub || user.doctorId || 'staff',
        },
      });

      // 8. Accurate preview of affected appointments without mutating or notifying
      const affectedAppointments = await tx.appointment.findMany({
        where: {
          doctorId: locked.doctorId,
          id: { not: locked.id },
          startTime: {
            gte: locked.startTime,
            lt: estimatedFreeTime,
          },
          status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED, AppointmentStatus.CHECKED_IN] },
        },
        include: {
          patient: { select: { fullName: true, phone: true } },
          service: { select: { nameUz: true, nameRu: true } },
        },
        orderBy: { startTime: 'asc' },
      });

      return {
        appointmentId: saved.id,
        delayMinutes: effectiveDelay,
        extraMinutes: effectiveDelay,
        overrunActive: true,
        mode,
        scheduledStartTime: locked.startTime,
        scheduledEndTime: locked.endTime,
        estimatedEndTime: estimatedEndTime.toISOString(),
        estimatedFreeTime: estimatedFreeTime.toISOString(),
        bufferMinutes: buffer,
        affectedCount: affectedAppointments.length,
        affectedAppointments: affectedAppointments.map((a: any) => {
          const conflictMinutes = Math.max(0, Math.round((estimatedFreeTime.getTime() - new Date(a.startTime).getTime()) / 60000));
          return {
            id: a.id,
            patientName: a.patient.fullName,
            patientPhone: a.patient.phone,
            scheduledStartTime: a.startTime,
            scheduledEndTime: a.endTime,
            serviceName: a.service?.nameUz || 'Xizmat',
            estimatedDelayMinutes: conflictMinutes,
            estimatedNewStartTime: new Date(new Date(a.startTime).getTime() + conflictMinutes * 60000).toISOString(),
            status: a.status,
          };
        }),
      };
    });
  }

  /**
   * Explicitly clear overrun without modifying appointment status
   * Concurrency-safe: Doctor advisory lock + row lock FOR UPDATE inside transaction
   */
  async clearOverrun(
    id: string,
    user: { role: StaffRole; doctorId?: string | null; sub?: string },
  ) {
    const pre = await this.prisma.appointment.findUnique({
      where: { id },
      select: { id: true, doctorId: true, status: true },
    });
    if (!pre) throw new NotFoundException('Qabul topilmadi');

    if (user.role === StaffRole.DOCTOR) {
      if (!user.doctorId) throw new ForbiddenException('Shifokor profiliga biriktirilmagan');
      if (pre.doctorId !== user.doctorId) throw new ForbiddenException('Faqat o‘z qabulingizdagi kechikishni boshqara olasiz');
    }

    const lockKey = this.hashStringToInt(`doc_${pre.doctorId}`);

    return await this.prisma.$transaction(async (tx) => {
      // 1. Consistent doctor advisory lock first
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;

      // 2. Row lock on appointment FOR UPDATE
      const [locked] = await tx.$queryRaw<Array<{ id: string; doctorId: string; status: AppointmentStatus }>>`
        SELECT id, "doctor_id" as "doctorId", status
        FROM "appointments"
        WHERE id = ${id}
        FOR UPDATE
      `;
      if (!locked) throw new NotFoundException('Qabul topilmadi');

      if (user.role === StaffRole.DOCTOR && locked.doctorId !== user.doctorId) {
        throw new ForbiddenException('Faqat o‘z qabulingizdagi kechikishni boshqara olasiz');
      }

      const saved = await tx.appointment.update({
        where: { id },
        data: {
          overrunActive: false,
          overrunMinutes: 0,
          overrunEstimatedEndTime: null,
          overrunReason: null,
          overrunUpdatedAt: new Date(),
        },
      });

      await tx.appointmentStatusHistory.create({
        data: {
          appointmentId: id,
          fromStatus: locked.status,
          toStatus: locked.status,
          reason: '[KECHIKISH BEKOR QILINDI] Rejadagi jadvalga qaytarildi',
          changedBy: user.sub || user.doctorId || 'staff',
        },
      });

      return {
        success: true,
        appointmentId: saved.id,
        overrunActive: false,
      };
    });
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
