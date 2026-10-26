import { Injectable, Logger, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  AppointmentStatus,
  NotificationChannel,
  NotificationStatus,
  Prisma,
} from '@prisma/client';
import * as nodemailer from 'nodemailer';
import { nanoid } from 'nanoid';
import { formatInTimeZone } from 'date-fns-tz';

export interface EnqueueNotificationParams {
  channel: NotificationChannel;
  templateKey: string;
  recipient: string;
  payload: Record<string, any>;
  appointmentId?: string;
  appointmentRevision?: number;
  scheduleRevision?: number;
  scheduledFor?: Date;
  deduplicationKey?: string;
}

export interface UpgradeLegacyRemindersOptions {
  dryRun?: boolean;
  batchSize?: number;
  maxJobs?: number;
  legacyCursor?: string | null;
  maxUpcomingAudit?: number;
  upcomingCursor?: string | null;
}

export interface UpgradeLegacyRemindersResult {
  scanned: number;
  legacyScanned: number;
  legacyCursor?: string | null;
  hasMoreLegacy: boolean;
  upgraded: number;
  quarantined: number;
  cancelled: number;
  newlyCreated: number;
  skippedActiveLease: number;
  upcomingScanned: number;
  upcomingCursor?: string | null;
  hasMoreUpcoming: boolean;
  errors: number;
  isCommitted?: boolean;
  details?: Array<{ jobId: string; action: string; reason: string }>;
}

export interface ScheduleHistoryEvidence {
  hasExplicitReschedule: boolean;
  rescheduleTimestamps: Date[];
  otherScheduleStartTimes: string[];
}

export type LegacyJobClassification =
  | 'MALFORMED_PAYLOAD'
  | 'OBSOLETE_NON_MATCHING_SCHEDULE'
  | 'AMBIGUOUS_HISTORICAL'
  | 'CURRENT_GENERATION_MATCH';

export interface ClassifyLegacyJobResult {
  classification: LegacyJobClassification;
  targetScheduleRevision: number;
  reason: string;
}

function parseSafeIsoTimestamp(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(?:Z|([+-]\d{2}:?\d{2}))?$/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) return null;
  const dUtc = new Date(Date.UTC(year, month - 1, day));
  if (dUtc.getUTCFullYear() !== year || dUtc.getUTCMonth() !== month - 1 || dUtc.getUTCDate() !== day) {
    return null;
  }
  return parsed;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private mailTransporter: nodemailer.Transporter | null = null;

  private clinicSettingsCache: {
    nameUz: string;
    nameRu: string;
    timezone: string;
    phone: string | null;
    email: string | null;
    cachedAt: number;
  } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {
    this.initMailTransporter();
  }

  async getClinicSettings(): Promise<{
    nameUz: string;
    nameRu: string;
    timezone: string;
    phone: string | null;
    email: string | null;
    cachedAt: number;
  }> {
    const now = Date.now();
    if (this.clinicSettingsCache && now - this.clinicSettingsCache.cachedAt < 10000) {
      return this.clinicSettingsCache;
    }
    try {
      const settings = await this.prisma.clinicSettings.findFirst();
      this.clinicSettingsCache = {
        nameUz: settings?.name || 'DentaCare',
        nameRu: settings?.nameRu || settings?.name || 'DentaCare',
        timezone: settings?.timezone || 'Asia/Tashkent',
        phone: settings?.phone || null,
        email: settings?.email || null,
        cachedAt: now,
      };
    } catch {
      this.clinicSettingsCache = {
        nameUz: 'DentaCare',
        nameRu: 'DentaCare',
        timezone: 'Asia/Tashkent',
        phone: null,
        email: null,
        cachedAt: now,
      };
    }
    return this.clinicSettingsCache;
  }

  private initMailTransporter() {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = this.configService.get<number>('SMTP_PORT');
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');

    if (host && port && user && pass) {
      this.mailTransporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
        connectionTimeout: 5000,
        greetingTimeout: 5000,
        socketTimeout: 10000,
      });
      this.logger.log('SMTP mail transporter initialized with bounded timeouts');
    }
  }

  maskRecipient(recipient: string): string {
    if (!recipient) return '***';
    if (recipient.includes('@')) {
      const [local, domain] = recipient.split('@');
      const maskedLocal = local.length > 2 ? `${local.slice(0, 2)}***` : `${local.charAt(0)}***`;
      return `${maskedLocal}@${domain}`;
    }
    const cleaned = recipient.replace(/\D/g, '');
    if (cleaned.length >= 9) {
      return `+${cleaned.slice(0, 3)} ${cleaned.slice(3, 5)} *** ** ${cleaned.slice(-2)}`;
    }
    return recipient.slice(0, 3) + '***' + recipient.slice(-2);
  }

  sanitizeError(err: string | null | undefined): string | null {
    if (!err) return null;
    return err
      .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]')
      .replace(/password=[^&\s]+/gi, 'password=[REDACTED]')
      .replace(/bot\d+:[A-Za-z0-9_-]+/gi, 'bot[REDACTED_TOKEN]')
      .replace(/key=[^&\s]+/gi, 'key=[REDACTED]');
  }

  escapeTelegramMarkdown(str: string): string {
    if (!str) return '';
    return String(str).replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
  }

  private redactRecipient(recipient: string): string {
    return this.maskRecipient(recipient);
  }

  formatAppointmentDateTime(
    dateOrIso: string | Date,
    tz = 'Asia/Tashkent',
    lang: 'uz' | 'ru' = 'uz',
  ): string {
    try {
      const d = typeof dateOrIso === 'string' ? new Date(dateOrIso) : dateOrIso;
      const day = formatInTimeZone(d, tz, 'dd.MM.yyyy');
      const time = formatInTimeZone(d, tz, 'HH:mm');
      if (lang === 'ru') {
        return `${day} в ${time}`;
      }
      return `${day} soat ${time}`;
    } catch {
      return String(dateOrIso);
    }
  }

  formatTashkentTime(dateOrIso: string | Date, tz = 'Asia/Tashkent'): string {
    return this.formatAppointmentDateTime(dateOrIso, tz, 'uz');
  }

  /**
   * Retrieves schedule history evidence for an appointment to classify legacy reminder records accurately.
   */
  async getScheduleHistoryEvidence(
    appointmentId: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<ScheduleHistoryEvidence> {
    const historyRows = await client.appointmentStatusHistory.findMany({
      where: { appointmentId },
      orderBy: { createdAt: 'asc' },
    });

    const rescheduleTimestamps: Date[] = [];
    for (const h of historyRows) {
      if (h.reason && (h.reason.includes('Qayta rejalashtirildi') || h.reason.toLowerCase().includes('resched'))) {
        rescheduleTimestamps.push(h.createdAt);
      }
    }

    // Inspect AuditLog if accessible
    try {
      const auditRows = await client.auditLog.findMany({
        where: {
          entityId: appointmentId,
          action: 'appointment.rescheduled',
        },
        orderBy: { createdAt: 'asc' },
      });
      for (const a of auditRows) {
        rescheduleTimestamps.push(a.createdAt);
      }
    } catch {
      // Audit log might be empty or unavailable in specific transactional mocks
    }

    // Inspect other reminder jobs for this appointment
    const otherJobs = await client.notificationJob.findMany({
      where: {
        appointmentId,
        templateKey: { in: ['appointment_reminder', 'appointment_rescheduled'] },
      },
      select: { payload: true, createdAt: true },
    });

    const otherScheduleStartTimes: string[] = [];
    for (const j of otherJobs) {
      const pl = j.payload as any;
      if (pl && typeof pl === 'object' && typeof pl.startTime === 'string') {
        if (!otherScheduleStartTimes.includes(pl.startTime)) {
          otherScheduleStartTimes.push(pl.startTime);
        }
      }
    }

    rescheduleTimestamps.sort((a, b) => a.getTime() - b.getTime());

    return {
      hasExplicitReschedule: rescheduleTimestamps.length > 0 || otherScheduleStartTimes.length > 1,
      rescheduleTimestamps,
      otherScheduleStartTimes,
    };
  }

  /**
   * Shared evidence-based classification policy for legacy reminder jobs:
   *
   * Classifies a legacy reminder job without relying solely on appointment.updatedAt or scheduleRevision > 1.
   *
   * Tradeoff Policy Documentation:
   * When generation identity is genuinely ambiguous (e.g. legacy job with null revision, pre-dating an explicit
   * reschedule or possessing conflicting history), we classify it as AMBIGUOUS_HISTORICAL (target revision 0).
   * - It is archived rather than assigned to the current generation.
   * - It does NOT suppress delivery of a current-generation reminder.
   * Tradeoff:
   * Suppressing a current reminder on ambiguous evidence risks a missed medical appointment (treatment disruption,
   * health risk, patient absence). Allowing a fresh reminder risks at most a duplicate notification.
   * Therefore, the system conservatively prioritizes attendance reliability over strict deduplication.
   */
  classifyLegacyReminderJob(
    job: {
      id: string;
      appointmentId: string | null;
      status: NotificationStatus;
      createdAt: Date;
      payload: any;
    },
    appointment: {
      id: string;
      status: AppointmentStatus | string;
      startTime: Date;
      scheduleRevision: number;
      createdAt: Date;
      updatedAt: Date;
    } | null,
    evidence?: ScheduleHistoryEvidence,
    nowUtc = new Date(),
  ): ClassifyLegacyJobResult {
    // 1. Missing or unassociated appointment
    if (!job.appointmentId || !appointment) {
      return {
        classification: 'OBSOLETE_NON_MATCHING_SCHEDULE',
        targetScheduleRevision: 0,
        reason: !job.appointmentId ? 'missing appointmentId' : `appointment not found`,
      };
    }

    // 2. Terminal or past appointment
    const terminalStatuses: string[] = [
      AppointmentStatus.COMPLETED,
      AppointmentStatus.CANCELLED,
      AppointmentStatus.NO_SHOW,
    ];
    if (terminalStatuses.includes(appointment.status as string) || appointment.startTime <= nowUtc) {
      return {
        classification: 'OBSOLETE_NON_MATCHING_SCHEDULE',
        targetScheduleRevision: 0,
        reason: terminalStatuses.includes(appointment.status as string)
          ? 'Appointment in terminal status'
          : 'Appointment is in the past',
      };
    }

    // 3. Payload validation
    const payload = job.payload;
    if (!payload || typeof payload !== 'object') {
      return {
        classification: 'MALFORMED_PAYLOAD',
        targetScheduleRevision: 0,
        reason: 'Missing or invalid payload',
      };
    }

    const parsedStartTime = parseSafeIsoTimestamp(payload.startTime);
    if (!parsedStartTime) {
      return {
        classification: 'MALFORMED_PAYLOAD',
        targetScheduleRevision: 0,
        reason: 'Malformed or missing startTime in payload',
      };
    }

    // 4. Start time comparison with current schedule
    const timeDiffMs = Math.abs(parsedStartTime.getTime() - appointment.startTime.getTime());
    const matchesCurrentStartTime = timeDiffMs < 1000;

    if (!matchesCurrentStartTime) {
      return {
        classification: 'OBSOLETE_NON_MATCHING_SCHEDULE',
        targetScheduleRevision: 0,
        reason: 'Payload startTime does not match current appointment schedule',
      };
    }

    // 5. Historical A -> B -> A and Rescheduling Evidence Analysis:
    const jobCreatedMs = new Date(job.createdAt).getTime();
    const apptScheduleRev = appointment.scheduleRevision ?? 1;

    let hasRescheduleBeforeOrIntervening = false;

    if (evidence) {
      for (const reschedDate of evidence.rescheduleTimestamps) {
        if (reschedDate.getTime() > jobCreatedMs) {
          hasRescheduleBeforeOrIntervening = true;
          break;
        }
      }

      if (!hasRescheduleBeforeOrIntervening && evidence.otherScheduleStartTimes.length > 1) {
        if (apptScheduleRev > 1) {
          hasRescheduleBeforeOrIntervening = true;
        }
      }
    }

    // If explicit reschedule history shows a reschedule occurred after the job:
    if (hasRescheduleBeforeOrIntervening) {
      return {
        classification: 'AMBIGUOUS_HISTORICAL',
        targetScheduleRevision: 0,
        reason: 'Ambiguous legacy generation: record pre-dates appointment rescheduling (A -> B -> A)',
      };
    }

    // If appointment scheduleRevision > 1:
    // If we have explicit evidence that ALL reschedules occurred before the job was created,
    // then the job was genuinely created for this current revision.
    // Otherwise, if we do not have explicit evidence proving the job was created after the reschedules,
    // and the job pre-dates the appointment update (job.createdAt < appointment.updatedAt),
    // then a legacy job (scheduleRevision === null) cannot be safely assigned to the latest generation!
    if (apptScheduleRev > 1) {
      const apptUpdatedMs = new Date(appointment.updatedAt).getTime();
      const hasExplicitProofAfterReschedule =
        evidence &&
        evidence.rescheduleTimestamps.length > 0 &&
        evidence.rescheduleTimestamps.every((t) => jobCreatedMs >= t.getTime());

      if (!hasExplicitProofAfterReschedule && (jobCreatedMs < apptUpdatedMs || (evidence && evidence.hasExplicitReschedule))) {
        return {
          classification: 'AMBIGUOUS_HISTORICAL',
          targetScheduleRevision: 0,
          reason: 'Ambiguous legacy generation: record pre-dates appointment rescheduling (A -> B -> A)',
        };
      }
    }

    // Unrelated edits (where updatedAt changed but no rescheduling occurred) do not trigger ambiguous classification
    return {
      classification: 'CURRENT_GENERATION_MATCH',
      targetScheduleRevision: apptScheduleRev,
      reason: `Matched current generation (revision ${apptScheduleRev})`,
    };
  }

  /**
   * Enqueue a durable notification job with deduplication, supporting transactions
   */
  async enqueue(
    params: EnqueueNotificationParams,
    tx?: Prisma.TransactionClient | PrismaService,
  ) {
    const client = tx || this.prisma;
    try {
      if (params.deduplicationKey) {
        const existing = await client.notificationJob.findUnique({
          where: { deduplicationKey: params.deduplicationKey },
        });
        if (existing) {
          return existing; // already queued
        }
      }

      return await client.notificationJob.create({
        data: {
          channel: params.channel,
          templateKey: params.templateKey,
          recipient: params.recipient,
          payload: params.payload as Prisma.InputJsonValue,
          appointmentId: params.appointmentId || null,
          appointmentRevision: params.appointmentRevision ?? null,
          scheduleRevision: params.scheduleRevision ?? null,
          scheduledFor: params.scheduledFor || new Date(),
          deduplicationKey: params.deduplicationKey || null,
          status: NotificationStatus.PENDING,
        },
      });
    } catch (e: any) {
      this.logger.error(`Failed to enqueue notification: ${e?.message}`);
      throw e;
    }
  }

  /**
   * Deliberate Current-Generation Reminder Recovery Policy:
   *
   * 1. Absent: If no reminder job exists for this appointment and schedule revision, enqueue a fresh PENDING job.
   * 2. Active: If a job exists in PENDING or active PROCESSING status:
   *    - If PROCESSING and worker lease is still active (< 5 min), preserve active lease without stealing.
   *    - If PENDING, update appointmentRevision and return.
   * 3. Delivered: If a job is SENT or SIMULATED for this schedule, return it without duplicate delivery.
   * 4. Failed / Cancelled:
   *    - Validate eligibility: appointment must still be active (CONFIRMED or PENDING), upcoming (startTime > now),
   *      and scheduleRevision must match current appointment schedule.
   *    - Never revive a stale generation (scheduleRevision !== appointment.scheduleRevision).
   *    - If eligible, archive previous job's deduplication key to preserve full failure/cancellation history.
   *    - Create a clean new PENDING job with the canonical deduplication key.
   * 5. Concurrency & Idempotency:
   *    - If concurrent recovery requests race, the first one creates the replacement job.
   *    - The second catches unique constraint P2002 on deduplicationKey and returns the winning active job.
   * 6. Error Visibility:
   *    - Unrecoverable persistence errors are thrown directly to the caller.
   */
  async recoverOrEnqueueCurrentReminder(
    appointment: {
      id: string;
      startTime: Date;
      serviceName: string;
      patientEmail?: string | null;
      patientPhone: string;
      status: AppointmentStatus | string;
      revision?: number;
      scheduleRevision?: number;
    },
    tx?: Prisma.TransactionClient | PrismaService,
  ): Promise<any> {
    const isTx = tx && !('$connect' in tx);
    if (isTx) {
      return this.executeRecoverOrEnqueue(appointment, tx);
    }

    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (innerTx) => {
            return this.executeRecoverOrEnqueue(appointment, innerTx);
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
            timeout: 10000,
          },
        );
      } catch (err: any) {
        const isConflict =
          err?.code === 'P2002' ||
          err?.code === 'P2034' ||
          err?.message?.includes('could not serialize') ||
          err?.message?.includes('deadlock');

        if (isConflict && attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 40 * attempt + Math.floor(Math.random() * 20)));
          continue;
        }
        throw err;
      }
    }
  }

  private async executeRecoverOrEnqueue(
    appointment: {
      id: string;
      startTime: Date;
      serviceName: string;
      patientEmail?: string | null;
      patientPhone: string;
      status: AppointmentStatus | string;
      revision?: number;
      scheduleRevision?: number;
    },
    tx: Prisma.TransactionClient | PrismaService,
  ): Promise<any> {
    const nowUtc = new Date();

    // 1. Lock appointment row first with FOR UPDATE to serialize concurrent operations
    const [lockedAppt] = await tx.$queryRaw<Array<{
      id: string;
      status: AppointmentStatus;
      start_time: Date;
      schedule_revision: number;
      revision: number;
      service_name: string;
    }>>`
      SELECT id, status, "start_time", "schedule_revision", "revision", "service_name"
      FROM "appointments"
      WHERE id = ${appointment.id}
      FOR UPDATE;
    `;

    if (!lockedAppt) {
      return null;
    }

    const terminalStatuses: string[] = [
      AppointmentStatus.COMPLETED,
      AppointmentStatus.CANCELLED,
      AppointmentStatus.NO_SHOW,
    ];
    const effectiveStatus = (appointment.status as string) || lockedAppt.status;
    if (
      terminalStatuses.includes(effectiveStatus) ||
      terminalStatuses.includes(lockedAppt.status) ||
      lockedAppt.start_time <= nowUtc ||
      appointment.startTime <= nowUtc
    ) {
      return null; // Ineligible for reminder
    }

    const currentScheduleRev = lockedAppt.schedule_revision ?? appointment.scheduleRevision ?? 1;
    const currentApptRev = lockedAppt.revision ?? appointment.revision ?? 1;

    // Check if an unresolved active legacy reminder lease exists for this appointment
    const fiveMinutesAgo = new Date(nowUtc.getTime() - 5 * 60 * 1000);
    const [activeLegacyJob] = await tx.$queryRaw<Array<{ id: string; locked_at: Date }>>`
      SELECT id, "locked_at"
      FROM "notification_jobs"
      WHERE "appointment_id" = ${appointment.id}
        AND "template_key" = 'appointment_reminder'
        AND "schedule_revision" IS NULL
        AND status = 'PROCESSING'::"notification_status"
        AND "locked_at" >= ${fiveMinutesAgo}
      FOR UPDATE;
    `;

    if (activeLegacyJob) {
      // Defer recovery while unresolved active legacy worker lease exists; do NOT create a competing reminder
      return { id: activeLegacyJob.id, isNewlyCreated: false, deferredActiveLease: true };
    }

    const canonicalKey = `reminder_${appointment.id}_s${currentScheduleRev}`;

    // 2. Lock existing notification job for canonical key if present
    const [lockedJob] = await tx.$queryRaw<Array<{
      id: string;
      status: NotificationStatus;
      schedule_revision: number | null;
      appointment_revision: number | null;
      locked_at: Date | null;
      lease_token: string | null;
    }>>`
      SELECT id, status, "schedule_revision", "appointment_revision", "locked_at", "lease_token"
      FROM "notification_jobs"
      WHERE "deduplication_key" = ${canonicalKey}
      FOR UPDATE;
    `;

    if (lockedJob) {
      // 1. Never revive stale generation
      if (lockedJob.schedule_revision !== null && lockedJob.schedule_revision !== currentScheduleRev) {
        return null;
      }

      // 2. Active jobs: PENDING
      if (lockedJob.status === NotificationStatus.PENDING) {
        if (lockedJob.appointment_revision !== currentApptRev) {
          return await tx.notificationJob.update({
            where: { id: lockedJob.id },
            data: { appointmentRevision: currentApptRev },
          });
        }
        const existing = await tx.notificationJob.findUnique({ where: { id: lockedJob.id } });
        if (existing) (existing as any).isNewlyCreated = false;
        return existing;
      }

      // 3. In-flight jobs: PROCESSING
      if (lockedJob.status === NotificationStatus.PROCESSING) {
        const leaseAgeMs = lockedJob.locked_at ? nowUtc.getTime() - new Date(lockedJob.locked_at).getTime() : Infinity;
        if (leaseAgeMs < 5 * 60 * 1000) {
          // Active worker lease: preserve it, do not steal or duplicate
          const existing = await tx.notificationJob.findUnique({ where: { id: lockedJob.id } });
          if (existing) (existing as any).isNewlyCreated = false;
          return existing;
        }
        // Expired worker lease: archive stalled job and allow replacement
        const expiredArchiveKey = `${canonicalKey}_expired_lease_${lockedJob.id}_${Date.now()}`;
        await tx.notificationJob.update({
          where: { id: lockedJob.id },
          data: {
            deduplicationKey: expiredArchiveKey,
            status: NotificationStatus.FAILED,
            lastError: 'Worker lease expired without completion',
            leaseToken: null,
            lockedAt: null,
          },
        });
      }

      // 4. Delivered jobs: SENT or SIMULATED
      if (
        lockedJob.status === NotificationStatus.SENT ||
        lockedJob.status === NotificationStatus.SIMULATED
      ) {
        const existing = await tx.notificationJob.findUnique({ where: { id: lockedJob.id } });
        if (existing) (existing as any).isNewlyCreated = false;
        return existing;
      }

      // 5. Terminal jobs: FAILED or CANCELLED -> archive deduplication key atomically
      if (
        lockedJob.status === NotificationStatus.FAILED ||
        lockedJob.status === NotificationStatus.CANCELLED
      ) {
        const archivedKey = `${canonicalKey}_superseded_${lockedJob.id}`;
        await tx.notificationJob.update({
          where: { id: lockedJob.id },
          data: { deduplicationKey: archivedKey },
        });
      }
    }

    // Schedule reminder time
    const reminderTime = new Date(lockedAppt.start_time.getTime() - 2 * 60 * 60 * 1000);
    const scheduledFor = reminderTime > nowUtc ? reminderTime : nowUtc;

    // Derive language and serviceNameRu from prior jobs
    let reminderLang: 'uz' | 'ru' = 'uz';
    let serviceNameRu: string | undefined = undefined;
    const priorJob = await tx.notificationJob.findFirst({
      where: { appointmentId: appointment.id, templateKey: { not: 'appointment_reminder' } },
      select: { payload: true },
    });
    if (priorJob && typeof priorJob.payload === 'object' && priorJob.payload !== null) {
      if ((priorJob.payload as any).lang === 'ru') reminderLang = 'ru';
      if ((priorJob.payload as any).serviceNameRu) serviceNameRu = (priorJob.payload as any).serviceNameRu;
    }

    // Atomically create replacement job
    const created = await tx.notificationJob.create({
      data: {
        channel: appointment.patientEmail ? NotificationChannel.EMAIL : NotificationChannel.SMS,
        templateKey: 'appointment_reminder',
        recipient: appointment.patientEmail || appointment.patientPhone,
        appointmentId: appointment.id,
        appointmentRevision: currentApptRev,
        scheduleRevision: currentScheduleRev,
        scheduledFor,
        deduplicationKey: canonicalKey,
        status: NotificationStatus.PENDING,
        payload: {
          appointmentId: appointment.id,
          serviceName: lockedAppt.service_name || appointment.serviceName,
          serviceNameRu,
          startTime: lockedAppt.start_time.toISOString(),
          scheduleRevision: currentScheduleRev,
          lang: reminderLang,
        },
      },
    });
    (created as any).isNewlyCreated = true;
    return created;
  }

  /**
   * Explicit Upgrade Policy for Legacy Reminder Jobs:
   *
   * Scans notification_jobs with templateKey = 'appointment_reminder' where scheduleRevision IS NULL:
   * 1. Safely parses ISO timestamps in JS without risky database SQL timestamptz casts.
   * 2. Quarantines/cancels jobs with null or orphaned appointmentId, missing/malformed payloads.
   * 3. Cancels obsolete pending/processing jobs for terminal or past appointments while preserving historical jobs.
   * 4. Accurately matches startTime and uses shared evidence-based classification policy (handles A -> B -> A and pre-migration reschedules).
   * 5. Detects and deduplicates multiple legacy jobs mapping to the same schedule.
   * 6. Preserves active worker leases (< 5m) and defers upcoming audit recovery while an unresolved legacy lease is in flight.
   * 7. Supports bounded batching, resumable cursor pagination for both phases, dry-run simulation of planned state,
   *    and respects transaction ownership (does not retry inside caller-owned aborted transactions).
   */
  async upgradeLegacyReminderJobs(
    txOrOptions?: Prisma.TransactionClient | PrismaService | UpgradeLegacyRemindersOptions,
    maybeOptions?: UpgradeLegacyRemindersOptions,
  ): Promise<UpgradeLegacyRemindersResult> {
    let client: Prisma.TransactionClient | PrismaService = this.prisma;
    let options: UpgradeLegacyRemindersOptions = {};

    if (txOrOptions) {
      if ('$queryRaw' in (txOrOptions as any) || '$executeRaw' in (txOrOptions as any)) {
        client = txOrOptions as Prisma.TransactionClient | PrismaService;
        if (maybeOptions) options = maybeOptions;
      } else {
        options = txOrOptions as UpgradeLegacyRemindersOptions;
      }
    }

    const dryRun = options.dryRun ?? false;
    const batchSize = Math.max(1, Math.min(options.batchSize ?? 100, 500));
    const maxLegacyJobs = options.maxJobs ?? 10000;
    const nowUtc = new Date();

    const isMethodOwnedTx = '$transaction' in client;

    const result: UpgradeLegacyRemindersResult = {
      scanned: 0,
      legacyScanned: 0,
      legacyCursor: null,
      hasMoreLegacy: false,
      upgraded: 0,
      quarantined: 0,
      cancelled: 0,
      newlyCreated: 0,
      skippedActiveLease: 0,
      upcomingScanned: 0,
      upcomingCursor: null,
      hasMoreUpcoming: false,
      errors: 0,
      isCommitted: !dryRun && isMethodOwnedTx,
      details: [],
    };

    // Tracks simulated state during dry-run so upcoming audit pass and duplicate detection
    // accurately mirror live behavior on fixtures containing duplicates, failed, cancelled, delivered, and active leases.
    const simulatedJobsByAppt = new Map<
      string,
      Array<{
        id: string;
        status: NotificationStatus;
        scheduleRevision: number;
        deduplicationKey?: string;
      }>
    >();

    // ==========================================
    // Phase 1: Legacy Reminder Jobs Upgrade
    // ==========================================
    let currentLegacyCursor = options.legacyCursor || null;
    let hasMoreLegacy = false;

    while (result.legacyScanned < maxLegacyJobs) {
      const takeCount = Math.min(batchSize, maxLegacyJobs - result.legacyScanned);
      const jobs: any[] = await (client.notificationJob.findMany as any)({
        where: {
          templateKey: 'appointment_reminder',
          scheduleRevision: null,
          ...(currentLegacyCursor ? { id: { gt: currentLegacyCursor } } : {}),
        },
        take: takeCount + 1,
        orderBy: { id: 'asc' },
      });

      if (jobs.length === 0) break;

      const jobsToProcess = jobs.slice(0, takeCount);
      const lookaheadHasMore = jobs.length > takeCount;

      currentLegacyCursor = jobsToProcess[jobsToProcess.length - 1].id;
      if (lookaheadHasMore && result.legacyScanned + jobsToProcess.length >= maxLegacyJobs) {
        hasMoreLegacy = true;
      }

      for (const job of jobsToProcess) {
        result.legacyScanned++;
        try {
          if (dryRun) {
            // ==========================================
            // DRY-RUN MODE: Pure Read-Only Inspection with Simulation
            // ==========================================
            if (!job.appointmentId) {
              result.quarantined++;
              if (job.status === NotificationStatus.SENT || job.status === NotificationStatus.SIMULATED) {
                result.upgraded++;
                result.details?.push({ jobId: job.id, action: 'QUARANTINED_ARCHIVED', reason: 'Missing appointmentId (delivered status preserved)' });
              } else {
                result.cancelled++;
                result.details?.push({ jobId: job.id, action: 'CANCELLED', reason: 'Missing appointmentId' });
              }
              continue;
            }

            const appt = await client.appointment.findUnique({
              where: { id: job.appointmentId },
            });

            if (!appt) {
              result.quarantined++;
              if (job.status === NotificationStatus.SENT || job.status === NotificationStatus.SIMULATED) {
                result.upgraded++;
                result.details?.push({ jobId: job.id, action: 'QUARANTINED_ARCHIVED', reason: `Appointment ${job.appointmentId} not found (delivered status preserved)` });
              } else {
                result.cancelled++;
                result.details?.push({ jobId: job.id, action: 'CANCELLED', reason: `Appointment ${job.appointmentId} not found` });
              }
              continue;
            }

            // Check active worker lease (< 5m)
            if (job.status === NotificationStatus.PROCESSING) {
              const leaseAgeMs = job.lockedAt ? nowUtc.getTime() - new Date(job.lockedAt).getTime() : Infinity;
              if (leaseAgeMs < 5 * 60 * 1000) {
                result.skippedActiveLease++;
                result.details?.push({ jobId: job.id, action: 'SKIPPED', reason: 'Active worker lease' });
                if (!simulatedJobsByAppt.has(appt.id)) simulatedJobsByAppt.set(appt.id, []);
                simulatedJobsByAppt.get(appt.id)!.push({
                  id: job.id,
                  status: NotificationStatus.PROCESSING,
                  scheduleRevision: -1, // marker for active legacy lease
                });
                continue;
              }
            }

            const evidence = await this.getScheduleHistoryEvidence(appt.id, client);
            const classification = this.classifyLegacyReminderJob(
              job,
              appt,
              evidence,
              nowUtc,
            );

            const isDelivered = job.status === NotificationStatus.SENT || job.status === NotificationStatus.SIMULATED;

            if (classification.classification === 'MALFORMED_PAYLOAD') {
              result.quarantined++;
              if (isDelivered) {
                result.upgraded++;
                result.details?.push({ jobId: job.id, action: 'QUARANTINED_ARCHIVED', reason: `${classification.reason} (delivered status preserved)` });
              } else {
                result.cancelled++;
                result.details?.push({ jobId: job.id, action: 'CANCELLED', reason: classification.reason });
              }
              continue;
            }

            if (classification.classification === 'OBSOLETE_NON_MATCHING_SCHEDULE') {
              if (job.status === NotificationStatus.PENDING || job.status === NotificationStatus.PROCESSING) {
                result.cancelled++;
                result.details?.push({ jobId: job.id, action: 'CANCELLED', reason: classification.reason });
              } else {
                result.upgraded++;
                result.details?.push({ jobId: job.id, action: 'UPGRADED', reason: 'Historical non-matching job archived' });
              }
              continue;
            }

            if (classification.classification === 'AMBIGUOUS_HISTORICAL') {
              if (isDelivered) {
                result.upgraded++;
                result.details?.push({ jobId: job.id, action: 'AMBIGUOUS_ARCHIVED', reason: classification.reason });
              } else {
                result.cancelled++;
                result.details?.push({ jobId: job.id, action: 'CANCELLED', reason: classification.reason });
              }
              continue;
            }

            // Classification is CURRENT_GENERATION_MATCH
            const targetScheduleRev = classification.targetScheduleRevision;

            // Check duplicate in DB and in simulated planned state
            const existingDbScheduleJob = await client.notificationJob.findFirst({
              where: {
                appointmentId: appt.id,
                templateKey: 'appointment_reminder',
                scheduleRevision: targetScheduleRev,
                id: { not: job.id },
              },
            });

            const simulatedApptJobs = simulatedJobsByAppt.get(appt.id) || [];
            const existingSimulatedJob = simulatedApptJobs.find(
              (sj) => sj.scheduleRevision === targetScheduleRev && sj.id !== job.id,
            );

            if (existingDbScheduleJob || existingSimulatedJob) {
              if (job.status === NotificationStatus.PENDING || job.status === NotificationStatus.PROCESSING) {
                result.cancelled++;
                result.details?.push({ jobId: job.id, action: 'CANCELLED', reason: 'Duplicate legacy reminder for schedule' });
              } else {
                result.upgraded++;
                result.details?.push({ jobId: job.id, action: 'UPGRADED', reason: 'Historical duplicate archived' });
              }
              continue;
            }

            // Not a duplicate: upgrade this job in simulation
            result.upgraded++;
            result.details?.push({ jobId: job.id, action: 'UPGRADED', reason: `Upgraded to schedule revision ${targetScheduleRev}` });

            if (!simulatedJobsByAppt.has(appt.id)) simulatedJobsByAppt.set(appt.id, []);
            simulatedJobsByAppt.get(appt.id)!.push({
              id: job.id,
              status: job.status,
              scheduleRevision: targetScheduleRev,
              deduplicationKey: `reminder_${appt.id}_s${targetScheduleRev}`,
            });
            continue;
          }

          // ==========================================
          // LIVE MODE: Transactional & Concurrency Safe
          // ==========================================
          let attempts = 0;
          let jobHandled = false;
          const maxAttempts = isMethodOwnedTx ? 3 : 1;

          while (attempts < maxAttempts && !jobHandled) {
            attempts++;
            try {
              const runInTx = async (tx: Prisma.TransactionClient) => {
                // 1. Consistent Lock Order: Lock appointment row FOR UPDATE first
                let lockedAppt: any = null;
                if (job.appointmentId) {
                  const apptRows = await tx.$queryRaw<any[]>`
                    SELECT id, status, "start_time" as "startTime", "schedule_revision" as "scheduleRevision", "updated_at" as "updatedAt", "created_at" as "createdAt"
                    FROM "appointments"
                    WHERE id = ${job.appointmentId}
                    FOR UPDATE;
                  `;
                  lockedAppt = apptRows[0] || null;
                }

                // 2. Lock notification job row FOR UPDATE
                const jobRows = await tx.$queryRaw<any[]>`
                  SELECT id, status, "locked_at" as "lockedAt", "lease_token" as "leaseToken", "schedule_revision" as "scheduleRevision", "last_error" as "lastError", "payload", "created_at" as "createdAt", "appointment_id" as "appointmentId", "deduplication_key" as "deduplicationKey"
                  FROM "notification_jobs"
                  WHERE id = ${job.id}
                  FOR UPDATE;
                `;
                const lockedJob = jobRows[0];
                if (!lockedJob) {
                  return { action: 'SKIPPED_NOT_FOUND' };
                }

                // Re-check: already processed by concurrent worker/process?
                if (lockedJob.scheduleRevision !== null) {
                  return { action: 'ALREADY_PROCESSED' };
                }

                // Re-check: active worker lease (< 5m)?
                if (lockedJob.status === NotificationStatus.PROCESSING) {
                  const leaseAgeMs = lockedJob.lockedAt ? nowUtc.getTime() - new Date(lockedJob.lockedAt).getTime() : Infinity;
                  if (leaseAgeMs < 5 * 60 * 1000) {
                    return { action: 'ACTIVE_LEASE' };
                  }
                }

                const isDelivered = lockedJob.status === NotificationStatus.SENT || lockedJob.status === NotificationStatus.SIMULATED;

                // Shared classification with evidence
                let evidence: ScheduleHistoryEvidence | undefined = undefined;
                if (lockedAppt) {
                  evidence = await this.getScheduleHistoryEvidence(lockedAppt.id, tx);
                }

                const classification = this.classifyLegacyReminderJob(
                  lockedJob,
                  lockedAppt,
                  evidence,
                  nowUtc,
                );

                if (classification.classification === 'MALFORMED_PAYLOAD') {
                  if (isDelivered) {
                    await tx.notificationJob.update({
                      where: { id: lockedJob.id },
                      data: {
                        scheduleRevision: 0,
                        ...(lockedJob.lastError ? {} : { lastError: `Quarantined: ${classification.reason} (delivered status preserved)` }),
                      },
                    });
                    return { action: 'QUARANTINED_ARCHIVED', quarantined: true, reason: `${classification.reason} (delivered status preserved)` };
                  } else {
                    await tx.notificationJob.update({
                      where: { id: lockedJob.id },
                      data: {
                        status: NotificationStatus.CANCELLED,
                        lastError: `Quarantined: ${classification.reason}`,
                        scheduleRevision: 0,
                        leaseToken: null,
                        lockedAt: null,
                      },
                    });
                    return { action: 'CANCELLED', quarantined: true, reason: classification.reason };
                  }
                }

                if (classification.classification === 'OBSOLETE_NON_MATCHING_SCHEDULE') {
                  if (!lockedJob.appointmentId || !lockedAppt) {
                    const errReason = classification.reason;
                    if (isDelivered) {
                      await tx.notificationJob.update({
                        where: { id: lockedJob.id },
                        data: {
                          scheduleRevision: 0,
                          ...(lockedJob.lastError ? {} : { lastError: `Quarantined: ${errReason} (delivered status preserved)` }),
                        },
                      });
                      return { action: 'QUARANTINED_ARCHIVED', quarantined: true, reason: `${errReason} (delivered status preserved)` };
                    } else {
                      await tx.notificationJob.update({
                        where: { id: lockedJob.id },
                        data: {
                          status: NotificationStatus.CANCELLED,
                          lastError: `Quarantined: ${errReason}`,
                          scheduleRevision: 0,
                          leaseToken: null,
                          lockedAt: null,
                        },
                      });
                      return { action: 'CANCELLED', quarantined: true, reason: errReason };
                    }
                  }

                  if (lockedJob.status === NotificationStatus.PENDING || lockedJob.status === NotificationStatus.PROCESSING) {
                    await tx.notificationJob.update({
                      where: { id: lockedJob.id },
                      data: {
                        status: NotificationStatus.CANCELLED,
                        lastError: `Eski yoki tasdiqlanmagan eslatma (${classification.reason})`,
                        scheduleRevision: 0,
                        leaseToken: null,
                        lockedAt: null,
                      },
                    });
                    return { action: 'CANCELLED', reason: classification.reason };
                  } else {
                    await tx.notificationJob.update({
                      where: { id: lockedJob.id },
                      data: {
                        scheduleRevision: 0,
                        ...(lockedJob.lastError ? {} : { lastError: 'Historical reminder archived' }),
                      },
                    });
                    return { action: 'UPGRADED_HISTORICAL', reason: 'Historical reminder archived' };
                  }
                }

                if (classification.classification === 'AMBIGUOUS_HISTORICAL') {
                  if (isDelivered) {
                    await tx.notificationJob.update({
                      where: { id: lockedJob.id },
                      data: {
                        scheduleRevision: 0,
                        ...(lockedJob.lastError ? {} : { lastError: classification.reason }),
                      },
                    });
                    return { action: 'AMBIGUOUS_ARCHIVED', reason: classification.reason };
                  } else {
                    await tx.notificationJob.update({
                      where: { id: lockedJob.id },
                      data: {
                        status: NotificationStatus.CANCELLED,
                        lastError: classification.reason,
                        scheduleRevision: 0,
                        leaseToken: null,
                        lockedAt: null,
                      },
                    });
                    return { action: 'CANCELLED', reason: classification.reason };
                  }
                }

                // Case: CURRENT_GENERATION_MATCH
                const targetScheduleRev = classification.targetScheduleRevision;
                const canonicalKey = `reminder_${lockedAppt.id}_s${targetScheduleRev}`;

                const existingSchedule = await tx.notificationJob.findFirst({
                  where: {
                    appointmentId: lockedAppt.id,
                    templateKey: 'appointment_reminder',
                    scheduleRevision: targetScheduleRev,
                    id: { not: lockedJob.id },
                  },
                });

                if (existingSchedule) {
                  if (lockedJob.status === NotificationStatus.PENDING || lockedJob.status === NotificationStatus.PROCESSING) {
                    await tx.notificationJob.update({
                      where: { id: lockedJob.id },
                      data: {
                        status: NotificationStatus.CANCELLED,
                        lastError: 'Duplicate legacy reminder for schedule',
                        scheduleRevision: 0,
                        leaseToken: null,
                        lockedAt: null,
                      },
                    });
                    return { action: 'CANCELLED', reason: 'Duplicate legacy reminder for schedule' };
                  } else {
                    await tx.notificationJob.update({
                      where: { id: lockedJob.id },
                      data: {
                        scheduleRevision: 0,
                        ...(lockedJob.lastError ? {} : { lastError: 'Historical duplicate archived' }),
                      },
                    });
                    return { action: 'UPGRADED_HISTORICAL', reason: 'Historical duplicate archived' };
                  }
                }

                // Upgrade to scheduleRevision: targetScheduleRev
                let updateData: any = { scheduleRevision: targetScheduleRev };
                if (lockedJob.deduplicationKey !== canonicalKey) {
                  const existingByKey = await tx.notificationJob.findUnique({
                    where: { deduplicationKey: canonicalKey },
                  });
                  if (!existingByKey) {
                    updateData.deduplicationKey = canonicalKey;
                  }
                }

                await tx.notificationJob.update({
                  where: { id: lockedJob.id },
                  data: updateData,
                });

                return { action: 'UPGRADED', reason: `Upgraded to schedule revision ${targetScheduleRev}` };
              };

              let txResult: any;
              if (isMethodOwnedTx) {
                txResult = await (client as PrismaService).$transaction(runInTx, {
                  maxWait: 5000,
                  timeout: 10000,
                });
              } else {
                txResult = await runInTx(client as Prisma.TransactionClient);
              }

              jobHandled = true;

              if (txResult) {
                if (txResult.quarantined) {
                  result.quarantined++;
                }
                if (txResult.action === 'ACTIVE_LEASE') {
                  result.skippedActiveLease++;
                  result.details?.push({ jobId: job.id, action: 'SKIPPED', reason: 'Active worker lease' });
                } else if (txResult.action === 'CANCELLED') {
                  result.cancelled++;
                  result.details?.push({ jobId: job.id, action: 'CANCELLED', reason: txResult.reason });
                } else if (txResult.action === 'QUARANTINED_ARCHIVED') {
                  result.upgraded++;
                  result.details?.push({ jobId: job.id, action: 'QUARANTINED_ARCHIVED', reason: txResult.reason });
                } else if (
                  txResult.action === 'UPGRADED' ||
                  txResult.action === 'UPGRADED_HISTORICAL' ||
                  txResult.action === 'AMBIGUOUS_ARCHIVED'
                ) {
                  result.upgraded++;
                  result.details?.push({ jobId: job.id, action: txResult.action, reason: txResult.reason });
                }
              }
            } catch (txErr: any) {
              if (!isMethodOwnedTx) {
                // Outer transaction: NEVER retry inside an aborted PostgreSQL transaction!
                // Propagate immediately so caller can roll back outer transaction.
                throw txErr;
              }
              if (attempts >= maxAttempts) {
                throw txErr;
              }
              await new Promise((r) => setTimeout(r, 20 * attempts + Math.random() * 20));
            }
          }
        } catch (jobErr: any) {
          result.errors++;
          result.details?.push({ jobId: job.id, action: 'ERROR', reason: jobErr?.message || 'Unexpected error' });
          this.logger.error(`Error repairing legacy reminder job ${job.id}: ${jobErr?.message}`);
          if (!isMethodOwnedTx) {
            throw jobErr;
          }
        }
      }
    }

    result.legacyCursor = hasMoreLegacy ? currentLegacyCursor : null;
    result.hasMoreLegacy = hasMoreLegacy;

    // ==========================================
    // Phase 2: Bounded Upcoming Eligible Appointments Audit
    // ==========================================
    const upcomingBatchSize = batchSize;
    const maxUpcoming = options.maxUpcomingAudit ?? Math.min(maxLegacyJobs, 5000);
    let currentUpcomingCursor = options.upcomingCursor || null;
    let hasMoreUpcoming = false;

    while (result.upcomingScanned < maxUpcoming) {
      const takeCount = Math.min(upcomingBatchSize, maxUpcoming - result.upcomingScanned);
      const eligibleUpcoming: any[] = await (client.appointment.findMany as any)({
        where: {
          status: { in: [AppointmentStatus.CONFIRMED, AppointmentStatus.PENDING] },
          startTime: { gt: nowUtc },
          ...(currentUpcomingCursor ? { id: { gt: currentUpcomingCursor } } : {}),
        },
        take: takeCount + 1,
        orderBy: { id: 'asc' },
        include: {
          patient: true,
        },
      });

      if (eligibleUpcoming.length === 0) break;

      const upcomingToProcess = eligibleUpcoming.slice(0, takeCount);
      const lookaheadHasMoreUpcoming = eligibleUpcoming.length > takeCount;

      currentUpcomingCursor = upcomingToProcess[upcomingToProcess.length - 1].id;
      if (lookaheadHasMoreUpcoming && result.upcomingScanned + upcomingToProcess.length >= maxUpcoming) {
        hasMoreUpcoming = true;
      }

      for (const appt of upcomingToProcess) {
        result.upcomingScanned++;
        const currentRev = appt.scheduleRevision ?? 1;

        if (dryRun) {
          // In dryRun: check if an unresolved active legacy lease exists for this appointment
          const fiveMinutesAgo = new Date(nowUtc.getTime() - 5 * 60 * 1000);
          const activeLegacyLeaseInDb = await client.notificationJob.findFirst({
            where: {
              appointmentId: appt.id,
              templateKey: 'appointment_reminder',
              scheduleRevision: null,
              status: NotificationStatus.PROCESSING,
              lockedAt: { gte: fiveMinutesAgo },
            },
          });

          const simulatedJobs = simulatedJobsByAppt.get(appt.id) || [];
          const activeLegacyLeaseInSim = simulatedJobs.some(
            (sj) => sj.status === NotificationStatus.PROCESSING && sj.scheduleRevision === -1,
          );

          if (activeLegacyLeaseInDb || activeLegacyLeaseInSim) {
            result.skippedActiveLease++;
            result.details?.push({
              jobId: `active_lease_${appt.id}`,
              action: 'DEFERRED_ACTIVE_LEASE',
              reason: `Deferred recovery in dry-run: active legacy worker lease in flight for appointment ${appt.id}`,
            });
            continue;
          }

          // Check if DB already has active/delivered job for current generation
          const hasActiveOrDeliveredInDb = await client.notificationJob.findFirst({
            where: {
              appointmentId: appt.id,
              templateKey: 'appointment_reminder',
              scheduleRevision: currentRev,
              status: {
                in: [
                  NotificationStatus.PENDING,
                  NotificationStatus.PROCESSING,
                  NotificationStatus.SENT,
                  NotificationStatus.SIMULATED,
                ],
              },
            },
          });

          // Check if simulated state has active/delivered job for current generation
          const hasActiveOrDeliveredInSim = simulatedJobs.some(
            (sj) =>
              sj.scheduleRevision === currentRev &&
              (
                [
                  NotificationStatus.PENDING,
                  NotificationStatus.PROCESSING,
                  NotificationStatus.SENT,
                  NotificationStatus.SIMULATED,
                ] as NotificationStatus[]
              ).includes(sj.status),
          );

          if (!hasActiveOrDeliveredInDb && !hasActiveOrDeliveredInSim) {
            result.newlyCreated++;
            result.details?.push({
              jobId: `new_reminder_${appt.id}`,
              action: 'PREDICTED_CREATE',
              reason: `Would create missing current-generation reminder for appointment ${appt.id}`,
            });

            if (!simulatedJobsByAppt.has(appt.id)) simulatedJobsByAppt.set(appt.id, []);
            simulatedJobsByAppt.get(appt.id)!.push({
              id: `sim_new_${appt.id}`,
              status: NotificationStatus.PENDING,
              scheduleRevision: currentRev,
            });
          }
          continue;
        }

        // LIVE MODE upcoming audit:
        const fiveMinutesAgo = new Date(nowUtc.getTime() - 5 * 60 * 1000);
        const activeLegacyJob = await client.notificationJob.findFirst({
          where: {
            appointmentId: appt.id,
            templateKey: 'appointment_reminder',
            scheduleRevision: null,
            status: NotificationStatus.PROCESSING,
            lockedAt: { gte: fiveMinutesAgo },
          },
        });

        if (activeLegacyJob) {
          result.skippedActiveLease++;
          result.details?.push({
            jobId: activeLegacyJob.id,
            action: 'SKIPPED',
            reason: `Deferred recovery: active legacy worker lease in flight for appointment ${appt.id}`,
          });
          continue;
        }

        const hasActiveOrDelivered = await client.notificationJob.findFirst({
          where: {
            appointmentId: appt.id,
            templateKey: 'appointment_reminder',
            scheduleRevision: currentRev,
            status: {
              in: [
                NotificationStatus.PENDING,
                NotificationStatus.PROCESSING,
                NotificationStatus.SENT,
                NotificationStatus.SIMULATED,
              ],
            },
          },
        });

        if (!hasActiveOrDelivered) {
          const recoveryJob = await this.recoverOrEnqueueCurrentReminder(
            {
              id: appt.id,
              startTime: appt.startTime,
              serviceName: appt.serviceName,
              patientEmail: appt.patient?.email,
              patientPhone: appt.patient?.phone || '',
              status: appt.status,
              revision: appt.revision,
              scheduleRevision: currentRev,
            },
            client,
          );

          if (recoveryJob && (recoveryJob as any).isNewlyCreated) {
            result.newlyCreated++;
            result.details?.push({
              jobId: recoveryJob.id,
              action: 'CREATED',
              reason: `Created missing current-generation reminder for appointment ${appt.id}`,
            });
          } else if (recoveryJob && (recoveryJob as any).deferredActiveLease) {
            result.skippedActiveLease++;
            result.details?.push({
              jobId: recoveryJob.id,
              action: 'SKIPPED',
              reason: `Deferred recovery: active legacy lease found inside transaction for appointment ${appt.id}`,
            });
          }
        }
      }
    }

    result.upcomingCursor = hasMoreUpcoming ? currentUpcomingCursor : null;
    result.hasMoreUpcoming = hasMoreUpcoming;
    result.scanned = result.legacyScanned + result.upcomingScanned;

    return result;
  }

  /**
   * Transactional Outbox: Enqueue booking created notifications
   */
  async enqueueBookingCreated(
    appointment: {
      id: string;
      startTime: Date;
      serviceName: string;
      serviceNameRu?: string;
      patientEmail?: string | null;
      patientPhone: string;
      revision?: number;
      scheduleRevision?: number;
      lang?: 'uz' | 'ru';
    },
    tx?: Prisma.TransactionClient | PrismaService,
  ) {
    const revision = appointment.revision ?? 1;
    const scheduleRevision = appointment.scheduleRevision ?? 1;
    const lang = appointment.lang || 'uz';

    // 1. Patient Confirmation / Received (Email or SMS)
    if (appointment.patientEmail) {
      await this.enqueue(
        {
          channel: NotificationChannel.EMAIL,
          templateKey: 'patient_booking_received',
          recipient: appointment.patientEmail,
          appointmentId: appointment.id,
          appointmentRevision: revision,
          scheduleRevision,
          deduplicationKey: `booking_email_${appointment.id}`,
          payload: {
            appointmentId: appointment.id,
            serviceName: appointment.serviceName,
            serviceNameRu: appointment.serviceNameRu,
            startTime: appointment.startTime.toISOString(),
            scheduleRevision,
            lang,
          },
        },
        tx,
      );
    } else {
      await this.enqueue(
        {
          channel: NotificationChannel.SMS,
          templateKey: 'patient_booking_received_sms',
          recipient: appointment.patientPhone,
          appointmentId: appointment.id,
          appointmentRevision: revision,
          scheduleRevision,
          deduplicationKey: `booking_sms_${appointment.id}`,
          payload: {
            appointmentId: appointment.id,
            serviceName: appointment.serviceName,
            serviceNameRu: appointment.serviceNameRu,
            startTime: appointment.startTime.toISOString(),
            scheduleRevision,
            lang,
          },
        },
        tx,
      );
    }

    // 2. Staff Telegram alert (no patient details, link to authenticated admin only)
    const telegramChatId = this.configService.get<string>('TELEGRAM_CHAT_ID');
    if (telegramChatId) {
      const frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');
      await this.enqueue(
        {
          channel: NotificationChannel.TELEGRAM,
          templateKey: 'staff_new_booking',
          recipient: telegramChatId,
          appointmentId: appointment.id,
          deduplicationKey: `staff_tg_${appointment.id}`,
          payload: {
            serviceName: appointment.serviceName,
            startTime: appointment.startTime.toISOString(),
            adminUrl: `${frontendUrl}/admin/calendar?appointmentId=${appointment.id}`,
            lang: 'uz',
          },
        },
        tx,
      );
    }

    // 3. Reminder (2 hours before start)
    const reminderTime = new Date(appointment.startTime.getTime() - 2 * 60 * 60 * 1000);
    if (reminderTime > new Date()) {
      await this.enqueue(
        {
          channel: appointment.patientEmail ? NotificationChannel.EMAIL : NotificationChannel.SMS,
          templateKey: 'appointment_reminder',
          recipient: appointment.patientEmail || appointment.patientPhone,
          appointmentId: appointment.id,
          appointmentRevision: revision,
          scheduleRevision,
          scheduledFor: reminderTime,
          deduplicationKey: `reminder_${appointment.id}_s${scheduleRevision}`,
          payload: {
            appointmentId: appointment.id,
            serviceName: appointment.serviceName,
            serviceNameRu: appointment.serviceNameRu,
            startTime: appointment.startTime.toISOString(),
            scheduleRevision,
            lang,
          },
        },
        tx,
      );
    }
  }

  /**
   * Transactional Outbox: Enqueue appointment confirmed notification
   */
  async enqueueAppointmentConfirmed(
    appointment: {
      id: string;
      startTime: Date;
      serviceName: string;
      serviceNameRu?: string;
      patientEmail?: string | null;
      patientPhone: string;
      revision?: number;
      lang?: 'uz' | 'ru';
    },
    tx?: Prisma.TransactionClient | PrismaService,
  ) {
    const revision = appointment.revision ?? 1;
    const lang = appointment.lang || 'uz';

    await this.enqueue(
      {
        channel: appointment.patientEmail ? NotificationChannel.EMAIL : NotificationChannel.SMS,
        templateKey: 'patient_booking_confirmed',
        recipient: appointment.patientEmail || appointment.patientPhone,
        appointmentId: appointment.id,
        appointmentRevision: revision,
        deduplicationKey: `confirmed_${appointment.id}_rev${revision}`,
        payload: {
          appointmentId: appointment.id,
          serviceName: appointment.serviceName,
          serviceNameRu: appointment.serviceNameRu,
          startTime: appointment.startTime.toISOString(),
          lang,
        },
      },
      tx,
    );
  }

  /**
   * Transactional Outbox: Enqueue cancellation notification and cancel pending reminders
   */
  async enqueueAppointmentCancelled(
    appointment: {
      id: string;
      startTime: Date;
      serviceName: string;
      serviceNameRu?: string;
      patientEmail?: string | null;
      patientPhone: string;
      revision?: number;
      lang?: 'uz' | 'ru';
    },
    tx?: Prisma.TransactionClient | PrismaService,
  ) {
    // 1. Cancel pending reminders immediately inside tx
    await this.cancelAppointmentReminders(appointment.id, tx);

    const revision = appointment.revision ?? 1;
    const lang = appointment.lang || 'uz';

    // 2. Queue cancellation notice
    await this.enqueue(
      {
        channel: appointment.patientEmail ? NotificationChannel.EMAIL : NotificationChannel.SMS,
        templateKey: 'appointment_cancellation',
        recipient: appointment.patientEmail || appointment.patientPhone,
        appointmentId: appointment.id,
        appointmentRevision: revision,
        deduplicationKey: `cancelled_${appointment.id}_rev${revision}`,
        payload: {
          appointmentId: appointment.id,
          serviceName: appointment.serviceName,
          serviceNameRu: appointment.serviceNameRu,
          startTime: appointment.startTime.toISOString(),
          lang,
        },
      },
      tx,
    );
  }

  /**
   * Transactional Outbox: Enqueue rescheduled notification, cancel obsolete reminders,
   * and schedule fresh reminder for new time
   */
  async enqueueAppointmentRescheduled(
    appointment: {
      id: string;
      startTime: Date;
      serviceName: string;
      serviceNameRu?: string;
      patientEmail?: string | null;
      patientPhone: string;
      revision: number;
      scheduleRevision?: number;
      lang?: 'uz' | 'ru';
    },
    tx?: Prisma.TransactionClient | PrismaService,
  ) {
    // 1. Cancel previous pending reminders inside tx
    await this.cancelAppointmentReminders(appointment.id, tx);

    const scheduleRevision = appointment.scheduleRevision ?? appointment.revision;
    const lang = appointment.lang || 'uz';

    // 2. Queue reschedule notification
    await this.enqueue(
      {
        channel: appointment.patientEmail ? NotificationChannel.EMAIL : NotificationChannel.SMS,
        templateKey: 'appointment_rescheduled',
        recipient: appointment.patientEmail || appointment.patientPhone,
        appointmentId: appointment.id,
        appointmentRevision: appointment.revision,
        scheduleRevision,
        deduplicationKey: `rescheduled_${appointment.id}_rev${appointment.revision}`,
        payload: {
          appointmentId: appointment.id,
          serviceName: appointment.serviceName,
          serviceNameRu: appointment.serviceNameRu,
          startTime: appointment.startTime.toISOString(),
          scheduleRevision,
          lang,
        },
      },
      tx,
    );

    // 3. Queue new reminder for rescheduled time
    const reminderTime = new Date(appointment.startTime.getTime() - 2 * 60 * 60 * 1000);
    if (reminderTime > new Date()) {
      await this.enqueue(
        {
          channel: appointment.patientEmail ? NotificationChannel.EMAIL : NotificationChannel.SMS,
          templateKey: 'appointment_reminder',
          recipient: appointment.patientEmail || appointment.patientPhone,
          appointmentId: appointment.id,
          appointmentRevision: appointment.revision,
          scheduleRevision,
          scheduledFor: reminderTime,
          deduplicationKey: `reminder_${appointment.id}_s${scheduleRevision}`,
          payload: {
            appointmentId: appointment.id,
            serviceName: appointment.serviceName,
            serviceNameRu: appointment.serviceNameRu,
            startTime: appointment.startTime.toISOString(),
            scheduleRevision,
            lang,
          },
        },
        tx,
      );
    }
  }

  /**
   * Cancel pending reminders when appointment is rescheduled or cancelled
   */
  async cancelAppointmentReminders(
    appointmentId: string,
    tx?: Prisma.TransactionClient | PrismaService,
  ) {
    const client = tx || this.prisma;
    await client.notificationJob.updateMany({
      where: {
        appointmentId,
        status: NotificationStatus.PENDING,
        templateKey: 'appointment_reminder',
      },
      data: {
        status: NotificationStatus.CANCELLED,
      },
    });
  }

  /**
   * Cron runner: Process pending notification jobs every minute.
   * Atomically claims jobs using PostgreSQL FOR UPDATE SKIP LOCKED and a unique UUID worker lease token.
   * Prevents expired workers from initiating external delivery or overwriting newer worker states.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async processPendingJobs() {
    try {
      const workerLeaseToken = nanoid(24);

      // Claim jobs atomically with UUID lease ownership token
      const claimedRows = await this.prisma.$queryRaw<{ id: string }[]>`
        UPDATE "notification_jobs"
        SET status = 'PROCESSING'::"notification_status", 
            "locked_at" = NOW(),
            "lease_token" = ${workerLeaseToken}
        WHERE id IN (
          SELECT id FROM "notification_jobs"
          WHERE (
            status = 'PENDING'::"notification_status"
            OR (status = 'PROCESSING'::"notification_status" AND "locked_at" < NOW() - INTERVAL '5 minutes')
          )
          AND ("scheduled_for" IS NULL OR "scheduled_for" <= NOW())
          ORDER BY "scheduled_for" ASC NULLS FIRST
          LIMIT 20
          FOR UPDATE SKIP LOCKED
        )
        RETURNING id;
      `;

      if (!claimedRows || claimedRows.length === 0) {
        return;
      }

      const claimedIds = claimedRows.map((r) => r.id);
      const jobs = await this.prisma.notificationJob.findMany({
        where: { id: { in: claimedIds } },
      });

      for (const job of jobs) {
        await this.deliverJob(job, workerLeaseToken);
      }
    } catch (err: any) {
      this.logger.error(`Error in processPendingJobs: ${err?.message}`);
    }
  }

  async deliverJob(job: any, workerLeaseToken: string) {
    // 1. Pre-flight check: ONLY apply status suppression to reminders!
    if (job.appointmentId && job.templateKey === 'appointment_reminder') {
      const nowUtc = new Date();
      const appt = await this.prisma.appointment.findUnique({
        where: { id: job.appointmentId },
        select: {
          id: true,
          status: true,
          startTime: true,
          expiresAt: true,
          revision: true,
          scheduleRevision: true,
          serviceName: true,
        },
      });

      // Cancel reminder if appointment is deleted or in terminal status
      if (
        !appt ||
        ([AppointmentStatus.CANCELLED, AppointmentStatus.COMPLETED, AppointmentStatus.NO_SHOW] as string[]).includes(
          appt.status,
        )
      ) {
        await this.prisma.$executeRaw`
          UPDATE "notification_jobs"
          SET status = 'CANCELLED'::"notification_status",
              "last_error" = 'Qabul bekor qilingan yoki yakunlanganligi sababli eslatma bekor qilindi',
              "lease_token" = NULL
          WHERE id = ${job.id} AND "lease_token" = ${workerLeaseToken};
        `;
        return;
      }

      // Suppress reminder if appointment start time is already in the past (worker backlog or delayed execution)
      if (appt.startTime.getTime() <= nowUtc.getTime()) {
        await this.prisma.$executeRaw`
          UPDATE "notification_jobs"
          SET status = 'CANCELLED'::"notification_status",
              "last_error" = 'Qabul boshlanish vaqti o‘tib ketganligi sababli eslatma bekor qilindi',
              "lease_token" = NULL
          WHERE id = ${job.id} AND "lease_token" = ${workerLeaseToken};
        `;
        return;
      }

      // Suppress reminder for unconfirmed or expired PENDING requests
      if (appt.status === AppointmentStatus.PENDING) {
        const isExpired = appt.expiresAt && appt.expiresAt.getTime() <= nowUtc.getTime();
        const reason = isExpired
          ? 'Muddati o‘tgan tasdiqlanmagan buyurtma uchun eslatma yuborilmaydi'
          : 'Tasdiqlanmagan (kutilayotgan) buyurtma uchun eslatma yuborilmaydi';
        await this.prisma.$executeRaw`
          UPDATE "notification_jobs"
          SET status = 'CANCELLED'::"notification_status",
              "last_error" = ${reason},
              "lease_token" = NULL
          WHERE id = ${job.id} AND "lease_token" = ${workerLeaseToken};
        `;
        return;
      }

      /**
       * Delivery Limitations Notice:
       * Once an external provider network call (Eskiz SMS, SMTP, Telegram) is initiated,
       * that HTTP/TCP packet has physically left the server and is in flight on the external network.
       * If the appointment status or duration changes concurrently while the provider call is in flight,
       * that external transmission cannot be aborted across the wire.
       * To maintain database integrity, completion is recorded using conditional lease ownership
       * (WHERE id = :id AND lease_token = :token) so expired or revoked workers cannot corrupt state.
       */

      // Safely validate reminder payload fields instead of silently treating missing startTime as valid
      const rawStartTime = job.payload?.startTime;
      const payloadStartTime = rawStartTime ? new Date(rawStartTime).getTime() : NaN;
      if (!rawStartTime || isNaN(payloadStartTime)) {
        const payloadError = "Eslatma ma'lumotlarida qabul boshlanish vaqti (startTime) mavjud emas yoki noto'g'ri formatda";
        await this.prisma.$executeRaw`
          UPDATE "notification_jobs"
          SET status = 'FAILED'::"notification_status",
              "last_error" = ${payloadError},
              "lease_token" = NULL
          WHERE id = ${job.id} AND "lease_token" = ${workerLeaseToken};
        `;
        return;
      }

      const apptStartTime = appt.startTime.getTime();
      const startTimeChanged = payloadStartTime !== apptStartTime;
      const currentScheduleRev = appt.scheduleRevision ?? 1;
      const scheduleRevisionMismatch =
        job.scheduleRevision === null || job.scheduleRevision === undefined
          ? (startTimeChanged || currentScheduleRev > 1)
          : (job.scheduleRevision !== currentScheduleRev);

      // Obsolete reminder check:
      // If appointment was rescheduled to a different start time OR schedule revision has advanced,
      // this reminder job is obsolete and must not initiate delivery.
      // Explicitly handles A -> B -> A: even if startTime equals A, scheduleRevision has incremented (1 -> 2 -> 3).
      if (startTimeChanged || scheduleRevisionMismatch) {
        await this.prisma.$executeRaw`
          UPDATE "notification_jobs"
          SET status = 'CANCELLED'::"notification_status",
              "last_error" = 'Qabul qayta rejalashtirilganligi sababli eski eslatma bekor qilindi',
              "lease_token" = NULL
          WHERE id = ${job.id} AND "lease_token" = ${workerLeaseToken};
        `;
        return;
      }

      // Check if a reminder for THIS SPECIFIC SCHEDULE has already been delivered
      const targetScheduleRevision = job.scheduleRevision ?? currentScheduleRev;

      // 1. Check explicit schedule revision match
      let alreadyDeliveredForSchedule = await this.prisma.notificationJob.findFirst({
        where: {
          appointmentId: job.appointmentId,
          templateKey: 'appointment_reminder',
          id: { not: job.id },
          scheduleRevision: targetScheduleRevision,
          status: { in: [NotificationStatus.SENT, NotificationStatus.SIMULATED] },
        },
      });

      // 2. If not found by explicit revision, check legacy records (scheduleRevision IS NULL)
      if (!alreadyDeliveredForSchedule) {
        const potentialLegacyDelivered = await this.prisma.notificationJob.findFirst({
          where: {
            appointmentId: job.appointmentId,
            templateKey: 'appointment_reminder',
            id: { not: job.id },
            scheduleRevision: null,
            status: { in: [NotificationStatus.SENT, NotificationStatus.SIMULATED] },
          },
        });

        if (potentialLegacyDelivered) {
          const evidence = await this.getScheduleHistoryEvidence(job.appointmentId);
          const classification = this.classifyLegacyReminderJob(
            potentialLegacyDelivered as any,
            appt as any,
            evidence,
            nowUtc,
          );

          if (classification.classification === 'CURRENT_GENERATION_MATCH') {
            alreadyDeliveredForSchedule = potentialLegacyDelivered;
          }
        }
      }

      if (alreadyDeliveredForSchedule) {
        await this.prisma.$executeRaw`
          UPDATE "notification_jobs"
          SET status = 'CANCELLED'::"notification_status",
              "last_error" = 'Ushbu qabul vaqti uchun eslatma allaqachon yuborilgan',
              "lease_token" = NULL
          WHERE id = ${job.id} AND "lease_token" = ${workerLeaseToken};
        `;
        return;
      }
    }

    // 2. Verify worker STILL holds the lease before initiating delivery!
    const [stillOwned] = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "notification_jobs"
      WHERE id = ${job.id} AND "lease_token" = ${workerLeaseToken} AND status = 'PROCESSING'::"notification_status";
    `;
    if (!stillOwned) {
      this.logger.warn(`Worker lost lease on job ${job.id}; aborting external delivery.`);
      return;
    }

    try {
      let isRealDelivery = false;
      if (job.channel === NotificationChannel.EMAIL) {
        isRealDelivery = await this.deliverEmail(job);
      } else if (job.channel === NotificationChannel.SMS) {
        isRealDelivery = await this.deliverSms(job);
      } else if (job.channel === NotificationChannel.TELEGRAM) {
        isRealDelivery = await this.deliverTelegram(job);
      }

      // Conditional completion update matching lease_token
      await this.prisma.$executeRaw`
        UPDATE "notification_jobs"
        SET status = ${isRealDelivery ? 'SENT' : 'SIMULATED'}::"notification_status",
            "sent_at" = NOW(),
            "attempts" = ${job.attempts + 1},
            "last_error" = ${isRealDelivery ? null : 'Simulated delivery (development sink)'},
            "lease_token" = NULL
        WHERE id = ${job.id} AND "lease_token" = ${workerLeaseToken};
      `;
    } catch (err: any) {
      const nextAttempts = job.attempts + 1;
      const willFail = nextAttempts >= job.maxAttempts;

      // Conditional retry/failure update matching lease_token
      await this.prisma.$executeRaw`
        UPDATE "notification_jobs"
        SET attempts = ${nextAttempts},
            status = ${willFail ? 'FAILED' : 'PENDING'}::"notification_status",
            "last_error" = ${this.sanitizeError(err?.message || String(err))},
            "locked_at" = NULL,
            "lease_token" = NULL,
            "scheduled_for" = NOW() + INTERVAL '2 minutes'
        WHERE id = ${job.id} AND "lease_token" = ${workerLeaseToken};
      `;
    }
  }

  private async deliverEmail(job: any): Promise<boolean> {
    const clinic = await this.getClinicSettings();
    const payload = job.payload || {};
    const lang: 'uz' | 'ru' = payload.lang === 'ru' ? 'ru' : 'uz';
    const clinicName = lang === 'ru' ? clinic.nameRu : clinic.nameUz;
    // Canonical timestamp and intended timezone take precedence
    const formattedTime = payload.startTime
      ? this.formatAppointmentDateTime(payload.startTime, clinic.timezone, lang)
      : (payload.formattedTime || this.formatAppointmentDateTime(new Date(), clinic.timezone, lang));
    const serviceName = (lang === 'ru' && payload.serviceNameRu) ? payload.serviceNameRu : (payload.serviceName || '');

    const configuredFrom = this.configService.get<string>('SMTP_FROM');
    let smtpFrom = configuredFrom;
    if (!smtpFrom && clinic.email) {
      smtpFrom = `${clinicName} <${clinic.email}>`;
    }
    if (!smtpFrom && this.mailTransporter) {
      this.logger.warn(`Email delivery skipped: neither SMTP_FROM nor clinic.email is configured.`);
      return false;
    }

    let subject = `${clinicName}: Qabul bildirishnomasi`;
    let text = `Hurmatli bemor! Sizning ${serviceName} bo'yicha qabul so'rovingiz qabul qilindi va tasdiqlash kutilmoqda. Qabul vaqti: ${formattedTime}.`;

    if (lang === 'ru') {
      subject = `${clinicName}: Уведомление о приеме`;
      text = `Уважаемый пациент! Ваша заявка на прием по услуге "${serviceName}" принята и ожидает подтверждения. Время приема: ${formattedTime}.`;
    }

    if (job.templateKey === 'patient_booking_confirmed') {
      if (lang === 'ru') {
        subject = `${clinicName}: Ваш прием подтвержден!`;
        text = `Уважаемый пациент! Ваш прием по услуге "${serviceName}" успешно подтвержден. Время приема: ${formattedTime}. Ждем вас в клинике!`;
      } else {
        subject = `${clinicName}: Qabulingiz tasdiqlandi!`;
        text = `Hurmatli bemor! Sizning "${serviceName}" bo'yicha qabulingiz tasdiqlandi. Qabul vaqti: ${formattedTime}. Sizni kutamiz!`;
      }
    } else if (job.templateKey === 'appointment_cancellation') {
      if (lang === 'ru') {
        subject = `${clinicName}: Прием отменен`;
        text = `Уважаемый пациент! Ваш прием по услуге "${serviceName}" на ${formattedTime} был отменен.`;
      } else {
        subject = `${clinicName}: Qabul bekor qilindi`;
        text = `Hurmatli bemor! Sizning "${serviceName}" bo'yicha ${formattedTime} dagi qabulingiz bekor qilindi.`;
      }
    } else if (job.templateKey === 'appointment_rescheduled') {
      if (lang === 'ru') {
        subject = `${clinicName}: Прием перенесен на новое время`;
        text = `Уважаемый пациент! Ваш прием по услуге "${serviceName}" перенесен на новое время: ${formattedTime}.`;
      } else {
        subject = `${clinicName}: Qabul yangi vaqtga ko'chirildi`;
        text = `Hurmatli bemor! Sizning "${serviceName}" bo'yicha qabulingiz yangi vaqtga rejalashtirildi: ${formattedTime}.`;
      }
    } else if (job.templateKey === 'appointment_reminder') {
      if (lang === 'ru') {
        subject = `${clinicName}: Напоминание о приеме`;
        text = `Уважаемый пациент! Напоминаем, что ваш прием по услуге "${serviceName}" запланирован на ${formattedTime}. Ждем вас в клинике!`;
      } else {
        subject = `${clinicName}: Qabul eslatmasi`;
        text = `Hurmatli bemor! Eslatib o'tamiz, sizning "${serviceName}" bo'yicha qabulingiz ${formattedTime} da rejalashtirilgan. Sizni kutamiz!`;
      }
    }

    if (this.mailTransporter && smtpFrom) {
      await this.mailTransporter.sendMail({
        from: smtpFrom,
        to: job.recipient,
        subject,
        text,
        headers: {
          'X-Clinic-Job-ID': job.id,
          'X-Clinic-Deduplication': job.deduplicationKey || job.id,
        },
      });
      return true;
    } else {
      this.logger.log(
        `[DEV SINK: EMAIL] To: ${this.maskRecipient(job.recipient)} | Subject: ${subject}`,
      );
      return false;
    }
  }

  private async deliverSms(job: any): Promise<boolean> {
    const smsApiKey = this.configService.get<string>('SMS_API_KEY');
    const smsApiUrl = this.configService.get<string>('SMS_API_URL');
    const clinic = await this.getClinicSettings();
    const payload = job.payload || {};
    const lang: 'uz' | 'ru' = payload.lang === 'ru' ? 'ru' : 'uz';
    const clinicName = lang === 'ru' ? clinic.nameRu : clinic.nameUz;
    const formattedTime = payload.startTime
      ? this.formatAppointmentDateTime(payload.startTime, clinic.timezone, lang)
      : (payload.formattedTime || this.formatAppointmentDateTime(new Date(), clinic.timezone, lang));
    const serviceName = (lang === 'ru' && payload.serviceNameRu) ? payload.serviceNameRu : (payload.serviceName || '');

    let message = lang === 'ru'
      ? `${clinicName}: Заявка принята. ${serviceName} - ${formattedTime}. Ожидает подтверждения.`
      : `${clinicName}: Qabul so'rovi qabul qilindi. ${serviceName} - ${formattedTime}. Tasdiqlash kutilmoqda.`;

    if (job.templateKey === 'patient_booking_confirmed') {
      message = lang === 'ru'
        ? `${clinicName}: Прием подтвержден! ${serviceName} - ${formattedTime}.`
        : `${clinicName}: Qabulingiz tasdiqlandi! ${serviceName} - ${formattedTime}.`;
    } else if (job.templateKey === 'appointment_cancellation') {
      message = lang === 'ru'
        ? `${clinicName}: Прием отменен. ${serviceName} (${formattedTime}).`
        : `${clinicName}: Qabulingiz bekor qilindi. ${serviceName} (${formattedTime}).`;
    } else if (job.templateKey === 'appointment_rescheduled') {
      message = lang === 'ru'
        ? `${clinicName}: Прием перенесен: ${formattedTime}.`
        : `${clinicName}: Qabul yangi vaqtga ko'chirildi: ${formattedTime}.`;
    } else if (job.templateKey === 'appointment_reminder') {
      message = lang === 'ru'
        ? `${clinicName} Напоминание: прием ${formattedTime} (${serviceName}).`
        : `${clinicName} Eslatma: ${formattedTime} da qabuldasiz (${serviceName}).`;
    }

    if (smsApiKey && smsApiUrl) {
      try {
        const res = await fetch(smsApiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${smsApiKey}`,
            'X-Idempotency-Key': job.deduplicationKey || job.id,
          },
          body: JSON.stringify({
            recipient: job.recipient,
            message,
            idempotencyKey: job.deduplicationKey || job.id,
          }),
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
          throw new Error(`SMS Provider error ${res.status}: ${await res.text()}`);
        }
        return true;
      } catch (e: any) {
        this.logger.warn(`SMS dispatch failed: ${this.sanitizeError(e?.message)}`);
        throw e;
      }
    } else {
      this.logger.log(
        `[DEV SINK: SMS] To: ${this.maskRecipient(job.recipient)} | Message: ${message}`,
      );
      return false;
    }
  }

  private async deliverTelegram(job: any): Promise<boolean> {
    const botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    const clinic = await this.getClinicSettings();
    const payload = job.payload || {};
    const formattedTime = payload.startTime
      ? this.formatAppointmentDateTime(payload.startTime, clinic.timezone, 'uz')
      : (payload.formattedTime || this.formatAppointmentDateTime(new Date(), clinic.timezone, 'uz'));

    const tgHeader = this.escapeTelegramMarkdown(`🔔 ${clinic.nameUz}: Yangi qabul so'rovi!`);
    const tgService = this.escapeTelegramMarkdown(payload.serviceName || '');
    const tgTime = this.escapeTelegramMarkdown(formattedTime);
    const tgUrl = payload.adminUrl ? String(payload.adminUrl) : '';

    const text = `${tgHeader}\n\nXizmat: ${tgService}\nVaqti: ${tgTime}\n\n👉 Boshqaruv paneli: ${tgUrl}`;

    if (botToken) {
      try {
        const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: job.recipient,
            text,
            parse_mode: 'Markdown',
          }),
          signal: AbortSignal.timeout(5000),
        });

        if (!res.ok) {
          throw new Error(`Telegram API responded with ${res.status}: ${await res.text()}`);
        }
        return true;
      } catch (e: any) {
        this.logger.warn(`Telegram API call failed: ${this.sanitizeError(e?.message)}`);
        throw e;
      }
    } else {
      this.logger.log(
        `[DEV SINK: TELEGRAM] Chat: ${this.maskRecipient(job.recipient)} | Message: ${text.replace(/\n/g, ' ')}`,
      );
      return false;
    }
  }

  /**
   * Admin view: Query notification jobs with filtering, pagination bounds, masked recipient,
   * sanitized error messages, and appointment references.
   */
  async findAll(params: {
    channel?: NotificationChannel;
    status?: NotificationStatus;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, Math.floor(Number(params.page) || 1));
    const limit = Math.min(100, Math.max(1, Math.floor(Number(params.limit) || 50)));

    const where: Prisma.NotificationJobWhereInput = {};
    if (params.channel) where.channel = params.channel;
    if (params.status) where.status = params.status;

    const [items, total] = await Promise.all([
      this.prisma.notificationJob.findMany({
        where,
        include: {
          appointment: {
            select: {
              id: true,
              startTime: true,
              serviceName: true,
              status: true,
              patient: { select: { fullName: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notificationJob.count({ where }),
    ]);

    const sanitizedItems = items.map((j) => ({
      id: j.id,
      channel: j.channel,
      templateKey: j.templateKey,
      recipient: this.maskRecipient(j.recipient),
      appointmentId: j.appointmentId,
      appointment: j.appointment
        ? {
            id: j.appointment.id,
            startTime: j.appointment.startTime,
            serviceName: j.appointment.serviceName,
            status: j.appointment.status,
            patientName: j.appointment.patient?.fullName || null,
          }
        : null,
      scheduleRevision: j.scheduleRevision,
      status: j.status,
      attempts: j.attempts,
      maxAttempts: j.maxAttempts,
      scheduledFor: j.scheduledFor,
      sentAt: j.sentAt,
      lockedAt: j.lockedAt,
      lastError: this.sanitizeError(j.lastError),
      isSimulated: j.status === NotificationStatus.SIMULATED,
      createdAt: j.createdAt,
    }));

    return { items: sanitizedItems, total, page, limit };
  }

  /**
   * Admin retry: Safely re-queues a failed or pending notification job after verifying
   * appointment and schedule eligibility. Records staff audit action.
   */
  async retryJob(id: string, staffUser?: any) {
    const actorId = staffUser?.sub || staffUser?.id || null;
    const LEASE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

    // 1. Initial non-locking lookup to determine appointment association
    const preJob = await this.prisma.notificationJob.findUnique({
      where: { id },
      select: { id: true, appointmentId: true, templateKey: true, status: true },
    });
    if (!preJob) {
      throw new NotFoundException('Xabarnoma topilmadi');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // 2. Consistent lock hierarchy: Appointment FOR UPDATE FIRST (matching AppointmentsService)
      let appointmentSnapshot: any = null;
      let appt: any = null;

      if (preJob.appointmentId) {
        const apptRows = await tx.$queryRaw<any[]>`
          SELECT id, status, "start_time" as "startTime", "schedule_revision" as "scheduleRevision", "expires_at" as "expiresAt"
          FROM "appointments"
          WHERE id = ${preJob.appointmentId}
          FOR UPDATE;
        `;
        appt = apptRows[0];
      }

      // 3. Row lock FOR UPDATE on NotificationJob SECOND
      const jobRows = await tx.$queryRaw<any[]>`
        SELECT id, channel, "template_key" as "templateKey", recipient,
               status, attempts, "max_attempts" as "maxAttempts",
               "scheduled_for" as "scheduledFor", "sent_at" as "sentAt",
               "locked_at" as "lockedAt", "lease_token" as "leaseToken",
               "last_error" as "lastError", payload, "created_at" as "createdAt",
               "appointment_id" as "appointmentId", "schedule_revision" as "scheduleRevision"
        FROM "notification_jobs"
        WHERE id = ${id}
        FOR UPDATE;
      `;
      const job = jobRows[0];
      if (!job) {
        throw new NotFoundException('Xabarnoma topilmadi');
      }

      // Re-check appointment if job had a different appointmentId than pre-lookup
      if (job.appointmentId && job.appointmentId !== preJob.appointmentId) {
        const apptRows = await tx.$queryRaw<any[]>`
          SELECT id, status, "start_time" as "startTime", "schedule_revision" as "scheduleRevision", "expires_at" as "expiresAt"
          FROM "appointments"
          WHERE id = ${job.appointmentId}
          FOR UPDATE;
        `;
        appt = apptRows[0];
      }

      // Explicit status validations
      if (job.status === NotificationStatus.SENT) {
        throw new BadRequestException('Ushbu xabarnoma allaqachon muvaffaqiyatli yuborilgan');
      }

      if (job.status === NotificationStatus.SIMULATED) {
        throw new BadRequestException('Simulyatsiya qilingan xabarnoma muvaffaqiyatli bajarilgan deb hisoblanadi');
      }

      if (job.status === NotificationStatus.CANCELLED) {
        throw new BadRequestException('Bekor qilingan xabarnomani qayta yuborib bo‘lmaydi');
      }

      const now = new Date();
      // Check active worker lease
      if (job.status === NotificationStatus.PROCESSING) {
        const lockedAtMs = job.lockedAt ? new Date(job.lockedAt).getTime() : 0;
        if (now.getTime() - lockedAtMs < LEASE_DURATION_MS) {
          throw new ConflictException(
            'Xabarnoma ayni paytda fon xizmati (worker) tomonidan yuborilmoqda. Qayta urinib bo‘lmaydi.',
          );
        }
      }

      // Check if already queued pending without errors
      if (
        job.status === NotificationStatus.PENDING &&
        job.attempts < job.maxAttempts &&
        (!job.lockedAt || now.getTime() - new Date(job.lockedAt).getTime() >= LEASE_DURATION_MS)
      ) {
        throw new BadRequestException('Xabarnoma allaqachon navbatda turibdi');
      }

      // Revalidate reminder eligibility
      if (job.templateKey === 'appointment_reminder') {
        if (!job.appointmentId || !appt) {
          throw new BadRequestException('Eslatma biriktirilgan qabul topilmadi');
        }

        if (
          ([AppointmentStatus.CANCELLED, AppointmentStatus.COMPLETED, AppointmentStatus.NO_SHOW] as string[]).includes(
            appt.status,
          )
        ) {
          throw new BadRequestException('Qabul bekor qilingan yoki yakunlangan, eslatmani qayta yuborib bo‘lmaydi');
        }

        if (new Date(appt.startTime).getTime() <= now.getTime()) {
          throw new BadRequestException('Qabul boshlanish vaqti o‘tib ketgan, eslatmani qayta yuborib bo‘lmaydi');
        }

        if (appt.status === AppointmentStatus.PENDING) {
          throw new BadRequestException('Tasdiqlanmagan qabul uchun eslatma yuborib bo‘lmaydi');
        }

        if (
          appt.scheduleRevision !== null &&
          job.scheduleRevision !== null &&
          appt.scheduleRevision !== job.scheduleRevision
        ) {
          throw new BadRequestException(
            'Qabul vaqti o‘zgargan (eskirgan eslatma avlodi). Yangi jadval uchun yangi eslatma mavjud.',
          );
        }

        appointmentSnapshot = {
          id: appt.id,
          status: appt.status,
          startTime: appt.startTime,
        };
      }

      // Preserve attempt history in audit and update job
      const previousAttempts = job.attempts;
      const updated = await tx.notificationJob.update({
        where: { id },
        data: {
          status: NotificationStatus.PENDING,
          attempts: 0,
          scheduledFor: now,
          lastError: null,
          lockedAt: null,
          leaseToken: null,
        },
      });

      // Atomic audit log inside transaction with verified actor ID
      await this.auditService.logTransactional({
        tx,
        userId: actorId,
        action: 'notification.retried',
        entity: 'NotificationJob',
        entityId: id,
        details: {
          channel: job.channel,
          templateKey: job.templateKey,
          previousStatus: job.status,
          previousAttempts,
          recipient: this.maskRecipient(job.recipient),
        },
      });

      return {
        job: updated,
        appointment: appointmentSnapshot,
      };
    });

    // Return sanitized notification DTO matching list endpoint
    const j = result.job;
    return {
      id: j.id,
      channel: j.channel,
      templateKey: j.templateKey,
      recipient: this.maskRecipient(j.recipient),
      appointmentId: j.appointmentId,
      appointment: result.appointment,
      scheduleRevision: j.scheduleRevision,
      status: j.status,
      attempts: j.attempts,
      maxAttempts: j.maxAttempts,
      scheduledFor: j.scheduledFor,
      sentAt: j.sentAt,
      lockedAt: j.lockedAt,
      lastError: null,
      isSimulated: false,
      createdAt: j.createdAt,
    };
  }

  /**
   * Admin: Returns current notification provider configuration status with strict verification
   */
  async getIntegrationStatus() {
    const clinic = await this.getClinicSettings();
    const smtpHost = this.configService.get<string>('SMTP_HOST');
    const smtpPort = this.configService.get<number>('SMTP_PORT');
    const smtpUser = this.configService.get<string>('SMTP_USER');
    const smtpPass = this.configService.get<string>('SMTP_PASS');
    const smtpFrom = this.configService.get<string>('SMTP_FROM') || (clinic.email ? `${clinic.nameUz} <${clinic.email}>` : null);
    const emailConfigured = Boolean(smtpHost && smtpPort && smtpUser && smtpPass && smtpFrom);

    const smsApiKey = this.configService.get<string>('SMS_API_KEY');
    const smsApiUrl = this.configService.get<string>('SMS_API_URL');
    const smsConfigured = Boolean(smsApiKey && smsApiUrl);

    const tgToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    const tgChatId = this.configService.get<string>('TELEGRAM_CHAT_ID');
    const tgConfigured = Boolean(tgToken && tgChatId);

    return {
      email: {
        configured: emailConfigured,
        provider: 'SMTP',
        host: smtpHost || null,
        port: smtpPort || null,
        hasSender: Boolean(smtpFrom),
        status: emailConfigured
          ? (this.mailTransporter ? 'configured' : 'usable')
          : 'missing_configuration',
        mode: emailConfigured ? 'real' : 'simulated',
      },
      sms: {
        configured: smsConfigured,
        provider: 'Eskiz / SMS Gateway',
        status: smsConfigured ? 'configured' : 'missing_configuration',
        mode: smsConfigured ? 'real' : 'simulated',
      },
      telegram: {
        configured: tgConfigured,
        botConfigured: Boolean(tgToken),
        chatIdConfigured: Boolean(tgChatId),
        status: tgConfigured ? 'configured' : 'missing_configuration',
        mode: tgConfigured ? 'real' : 'simulated',
      },
    };
  }
}
