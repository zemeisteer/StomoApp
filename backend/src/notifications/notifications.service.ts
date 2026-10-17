import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
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
  maxUpcomingAudit?: number;
}

export interface UpgradeLegacyRemindersResult {
  scanned: number;
  upgraded: number;
  quarantined: number;
  cancelled: number;
  newlyCreated: number;
  skippedActiveLease: number;
  errors: number;
  details?: Array<{ jobId: string; action: string; reason: string }>;
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.initMailTransporter();
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

  private redactRecipient(recipient: string): string {
    if (!recipient) return '***';
    if (recipient.includes('@')) {
      const [local, domain] = recipient.split('@');
      return `${local.charAt(0)}***@${domain}`;
    }
    if (recipient.length > 5) {
      return `${recipient.slice(0, 5)}***${recipient.slice(-2)}`;
    }
    return '***';
  }

  formatTashkentTime(dateOrIso: string | Date, tz = 'Asia/Tashkent'): string {
    try {
      const d = typeof dateOrIso === 'string' ? new Date(dateOrIso) : dateOrIso;
      const day = formatInTimeZone(d, tz, 'dd.MM.yyyy');
      const time = formatInTimeZone(d, tz, 'HH:mm');
      return `${day} soat ${time} (Toshkent vaqti)`;
    } catch {
      return String(dateOrIso);
    }
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
    const formattedTime = this.formatTashkentTime(lockedAppt.start_time);

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
          startTime: lockedAppt.start_time.toISOString(),
          scheduleRevision: currentScheduleRev,
          formattedTime,
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
   * 4. Accurately matches startTime against current schedule (handles historical A -> B -> A rescheduling).
   * 5. Detects and deduplicates multiple legacy jobs mapping to the same schedule.
   * 6. Preserves active worker leases (< 5m).
   * 7. Supports bounded batching, dry-run mode, and returns comprehensive metrics.
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
    const maxJobs = options.maxJobs ?? 10000;
    const nowUtc = new Date();

    const result: UpgradeLegacyRemindersResult = {
      scanned: 0,
      upgraded: 0,
      quarantined: 0,
      cancelled: 0,
      newlyCreated: 0,
      skippedActiveLease: 0,
      errors: 0,
      details: [],
    };

    // Tracks planned upgrades during dry-run so upcoming audit pass avoids double-counting missing reminders
    const plannedUpgrades = new Set<string>();

    let lastCursorId: string | undefined = undefined;

    while (result.scanned < maxJobs) {
      const takeCount = Math.min(batchSize, maxJobs - result.scanned);
      const jobs: any[] = await (client.notificationJob.findMany as any)({
        where: {
          templateKey: 'appointment_reminder',
          scheduleRevision: null,
        },
        take: takeCount,
        ...(lastCursorId ? { skip: 1, cursor: { id: lastCursorId } } : {}),
        orderBy: { id: 'asc' },
      });

      if (jobs.length === 0) break;
      lastCursorId = jobs[jobs.length - 1].id;

      for (const job of jobs) {
        result.scanned++;
        try {
          if (dryRun) {
            // ==========================================
            // DRY-RUN MODE: Pure Read-Only Inspection
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

            if (job.status === NotificationStatus.PROCESSING) {
              const leaseAgeMs = job.lockedAt ? nowUtc.getTime() - new Date(job.lockedAt).getTime() : Infinity;
              if (leaseAgeMs < 5 * 60 * 1000) {
                result.skippedActiveLease++;
                result.details?.push({ jobId: job.id, action: 'SKIPPED', reason: 'Active worker lease' });
                continue;
              }
            }

            const terminalStatuses: string[] = [
              AppointmentStatus.COMPLETED,
              AppointmentStatus.CANCELLED,
              AppointmentStatus.NO_SHOW,
            ];
            const isTerminal = terminalStatuses.includes(appt.status);
            const isPast = appt.startTime <= nowUtc;

            if (isTerminal || isPast) {
              if (job.status === NotificationStatus.PENDING || job.status === NotificationStatus.PROCESSING) {
                result.cancelled++;
                result.details?.push({
                  jobId: job.id,
                  action: 'CANCELLED',
                  reason: isTerminal ? 'Appointment in terminal status' : 'Appointment is in the past',
                });
              } else {
                result.upgraded++;
                result.details?.push({ jobId: job.id, action: 'UPGRADED', reason: 'Historical delivered/failed job archived' });
              }
              continue;
            }

            const payload = job.payload as any;
            if (!payload || typeof payload !== 'object') {
              result.quarantined++;
              if (job.status === NotificationStatus.SENT || job.status === NotificationStatus.SIMULATED) {
                result.upgraded++;
                result.details?.push({ jobId: job.id, action: 'QUARANTINED_ARCHIVED', reason: 'Missing or invalid payload (delivered status preserved)' });
              } else {
                result.cancelled++;
                result.details?.push({ jobId: job.id, action: 'CANCELLED', reason: 'Missing or invalid payload' });
              }
              continue;
            }

            const parsedStartTime = parseSafeIsoTimestamp(payload.startTime);
            if (!parsedStartTime) {
              result.quarantined++;
              if (job.status === NotificationStatus.SENT || job.status === NotificationStatus.SIMULATED) {
                result.upgraded++;
                result.details?.push({ jobId: job.id, action: 'QUARANTINED_ARCHIVED', reason: 'Malformed or missing startTime (delivered status preserved)' });
              } else {
                result.cancelled++;
                result.details?.push({ jobId: job.id, action: 'CANCELLED', reason: 'Malformed or missing startTime in payload' });
              }
              continue;
            }

            const timeDiffMs = Math.abs(parsedStartTime.getTime() - appt.startTime.getTime());
            const matchesCurrentSchedule = timeDiffMs < 1000;

            if (!matchesCurrentSchedule) {
              if (job.status === NotificationStatus.PENDING || job.status === NotificationStatus.PROCESSING) {
                result.cancelled++;
                result.details?.push({ jobId: job.id, action: 'CANCELLED', reason: 'StartTime does not match current schedule' });
              } else {
                result.upgraded++;
                result.details?.push({ jobId: job.id, action: 'UPGRADED', reason: 'Historical non-matching job archived' });
              }
              continue;
            }

            // Historical A -> B -> A Reschedule Identity Verification:
            // If appointment was rescheduled (scheduleRevision > 1) and job pre-dates the latest reschedule,
            // timestamp equality does NOT establish identity with current generation!
            const apptScheduleRev = appt.scheduleRevision ?? 1;
            const jobCreatedAtMs = new Date(job.createdAt).getTime();
            const apptUpdatedAtMs = new Date(appt.updatedAt).getTime();
            const isAmbiguousHistorical = apptScheduleRev > 1 && jobCreatedAtMs < apptUpdatedAtMs;

            if (isAmbiguousHistorical) {
              if (job.status === NotificationStatus.SENT || job.status === NotificationStatus.SIMULATED) {
                result.upgraded++;
                result.details?.push({ jobId: job.id, action: 'AMBIGUOUS_ARCHIVED', reason: 'Ambiguous legacy generation pre-dating rescheduling archived' });
              } else {
                result.cancelled++;
                result.details?.push({ jobId: job.id, action: 'CANCELLED', reason: 'Ambiguous legacy generation pre-dating rescheduling cancelled' });
              }
              continue;
            }

            // Schedule revision matching: check duplicate
            const targetScheduleRev = appt.scheduleRevision ?? 1;
            const existingScheduleJob = await client.notificationJob.findFirst({
              where: {
                appointmentId: appt.id,
                templateKey: 'appointment_reminder',
                scheduleRevision: targetScheduleRev,
                id: { not: job.id },
              },
            });

            if (existingScheduleJob) {
              if (job.status === NotificationStatus.PENDING || job.status === NotificationStatus.PROCESSING) {
                result.cancelled++;
                result.details?.push({ jobId: job.id, action: 'CANCELLED', reason: 'Duplicate legacy reminder for schedule' });
              } else {
                result.upgraded++;
                result.details?.push({ jobId: job.id, action: 'UPGRADED', reason: 'Historical duplicate archived' });
              }
              continue;
            }

            result.upgraded++;
            plannedUpgrades.add(`${appt.id}:${targetScheduleRev}`);
            result.details?.push({ jobId: job.id, action: 'UPGRADED', reason: `Upgraded to schedule revision ${targetScheduleRev}` });
            continue;
          }

          // ==========================================
          // LIVE MODE: Transactional & Concurrency Safe
          // ==========================================
          // Use short transaction per item with retry logic to avoid long lock contention
          let attempts = 0;
          let jobHandled = false;

          while (attempts < 3 && !jobHandled) {
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

                // Case A: Missing or invalid appointment
                if (!lockedJob.appointmentId || !lockedAppt) {
                  const errorMsg = !lockedJob.appointmentId
                    ? 'Orphaned legacy reminder: missing appointmentId'
                    : 'Orphaned legacy reminder: appointment not found';
                  if (isDelivered) {
                    await tx.notificationJob.update({
                      where: { id: lockedJob.id },
                      data: {
                        scheduleRevision: 0,
                        ...(lockedJob.lastError ? {} : { lastError: `${errorMsg} (quarantined delivered record)` }),
                      },
                    });
                    return { action: 'QUARANTINED_ARCHIVED', quarantined: true, reason: `${errorMsg} (delivered status preserved)` };
                  } else {
                    await tx.notificationJob.update({
                      where: { id: lockedJob.id },
                      data: {
                        status: NotificationStatus.CANCELLED,
                        lastError: errorMsg,
                        scheduleRevision: 0,
                        leaseToken: null,
                        lockedAt: null,
                      },
                    });
                    return { action: 'CANCELLED', quarantined: true, reason: errorMsg };
                  }
                }

                // Case B: Terminal or past appointment
                const terminalStatuses: string[] = [
                  AppointmentStatus.COMPLETED,
                  AppointmentStatus.CANCELLED,
                  AppointmentStatus.NO_SHOW,
                ];
                const isTerminal = terminalStatuses.includes(lockedAppt.status);
                const isPast = lockedAppt.startTime <= nowUtc;

                if (isTerminal || isPast) {
                  if (lockedJob.status === NotificationStatus.PENDING || lockedJob.status === NotificationStatus.PROCESSING) {
                    await tx.notificationJob.update({
                      where: { id: lockedJob.id },
                      data: {
                        status: NotificationStatus.CANCELLED,
                        lastError: isTerminal ? 'Obsolete legacy reminder for terminal appointment' : 'Obsolete legacy reminder for past appointment',
                        scheduleRevision: 0,
                        leaseToken: null,
                        lockedAt: null,
                      },
                    });
                    return { action: 'CANCELLED', reason: isTerminal ? 'Terminal appointment' : 'Past appointment' };
                  } else {
                    await tx.notificationJob.update({
                      where: { id: lockedJob.id },
                      data: {
                        scheduleRevision: 0,
                        ...(lockedJob.lastError ? {} : { lastError: 'Historical delivered/failed job archived' }),
                      },
                    });
                    return { action: 'UPGRADED_HISTORICAL', reason: 'Historical delivered/failed job archived' };
                  }
                }

                // Case C: Missing or malformed payload
                const payload = lockedJob.payload as any;
                const parsedStartTime = payload && typeof payload === 'object' ? parseSafeIsoTimestamp(payload.startTime) : null;

                if (!parsedStartTime) {
                  if (isDelivered) {
                    await tx.notificationJob.update({
                      where: { id: lockedJob.id },
                      data: {
                        scheduleRevision: 0,
                        ...(lockedJob.lastError ? {} : { lastError: 'Quarantined: malformed or missing startTime (delivered status preserved)' }),
                      },
                    });
                    return { action: 'QUARANTINED_ARCHIVED', quarantined: true, reason: 'Malformed payload (delivered status preserved)' };
                  } else {
                    await tx.notificationJob.update({
                      where: { id: lockedJob.id },
                      data: {
                        status: NotificationStatus.CANCELLED,
                        lastError: 'Quarantined: malformed or missing startTime',
                        scheduleRevision: 0,
                        leaseToken: null,
                        lockedAt: null,
                      },
                    });
                    return { action: 'CANCELLED', quarantined: true, reason: 'Malformed or missing startTime' };
                  }
                }

                // Case D: Schedule matching
                const timeDiffMs = Math.abs(parsedStartTime.getTime() - lockedAppt.startTime.getTime());
                const matchesCurrentSchedule = timeDiffMs < 1000;

                if (!matchesCurrentSchedule) {
                  if (lockedJob.status === NotificationStatus.PENDING || lockedJob.status === NotificationStatus.PROCESSING) {
                    await tx.notificationJob.update({
                      where: { id: lockedJob.id },
                      data: {
                        status: NotificationStatus.CANCELLED,
                        lastError: 'Eski yoki tasdiqlanmagan eslatma (migratsiya taftishi orqali bekor qilindi - schedule does not match current appointment)',
                        scheduleRevision: 0,
                        leaseToken: null,
                        lockedAt: null,
                      },
                    });
                    return { action: 'CANCELLED', reason: 'StartTime does not match current schedule' };
                  } else {
                    await tx.notificationJob.update({
                      where: { id: lockedJob.id },
                      data: {
                        scheduleRevision: 0,
                        ...(lockedJob.lastError ? {} : { lastError: 'Historical reminder for prior schedule' }),
                      },
                    });
                    return { action: 'UPGRADED_HISTORICAL', reason: 'Historical non-matching job archived' };
                  }
                }

                // Case E: Historical A -> B -> A Rescheduling & Ambiguous Generations
                const apptScheduleRev = lockedAppt.scheduleRevision ?? 1;
                const jobCreatedAtMs = new Date(lockedJob.createdAt).getTime();
                const apptUpdatedAtMs = new Date(lockedAppt.updatedAt).getTime();
                const isAmbiguousHistorical = apptScheduleRev > 1 && jobCreatedAtMs < apptUpdatedAtMs;

                if (isAmbiguousHistorical) {
                  if (isDelivered) {
                    await tx.notificationJob.update({
                      where: { id: lockedJob.id },
                      data: {
                        scheduleRevision: 0,
                        ...(lockedJob.lastError ? {} : { lastError: 'Ambiguous legacy generation: pre-dates appointment rescheduling' }),
                      },
                    });
                    return { action: 'AMBIGUOUS_ARCHIVED', reason: 'Ambiguous legacy generation pre-dating rescheduling archived' };
                  } else {
                    await tx.notificationJob.update({
                      where: { id: lockedJob.id },
                      data: {
                        status: NotificationStatus.CANCELLED,
                        lastError: 'Ambiguous legacy reminder pre-dating rescheduling cancelled',
                        scheduleRevision: 0,
                        leaseToken: null,
                        lockedAt: null,
                      },
                    });
                    return { action: 'CANCELLED', reason: 'Ambiguous legacy generation pre-dating rescheduling cancelled' };
                  }
                }

                // Case F: Valid matching generation
                const targetScheduleRev = lockedAppt.scheduleRevision ?? 1;
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
              if ('$transaction' in client) {
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
                } else if (txResult.action === 'UPGRADED' || txResult.action === 'UPGRADED_HISTORICAL' || txResult.action === 'AMBIGUOUS_ARCHIVED') {
                  result.upgraded++;
                  result.details?.push({ jobId: job.id, action: txResult.action, reason: txResult.reason });
                }
              }
            } catch (txErr: any) {
              if (attempts >= 3) {
                throw txErr;
              }
              await new Promise((r) => setTimeout(r, 20 * attempts + Math.random() * 20));
            }
          }
        } catch (jobErr: any) {
          result.errors++;
          result.details?.push({ jobId: job.id, action: 'ERROR', reason: jobErr?.message || 'Unexpected error' });
          this.logger.error(`Error repairing legacy reminder job ${job.id}: ${jobErr?.message}`);
        }
      }
    }

    // ==========================================
    // 8. Bounded Upcoming Eligible Appointments Audit
    // ==========================================
    const upcomingBatchSize = batchSize;
    const maxUpcoming = options.maxUpcomingAudit ?? Math.min(maxJobs, 5000);
    let upcomingScanned = 0;
    let lastUpcomingId: string | undefined = undefined;

    while (upcomingScanned < maxUpcoming) {
      const takeCount = Math.min(upcomingBatchSize, maxUpcoming - upcomingScanned);
      const eligibleUpcoming: any[] = await (client.appointment.findMany as any)({
        where: {
          status: { in: [AppointmentStatus.CONFIRMED, AppointmentStatus.PENDING] },
          startTime: { gt: nowUtc },
        },
        take: takeCount,
        ...(lastUpcomingId ? { skip: 1, cursor: { id: lastUpcomingId } } : {}),
        orderBy: { id: 'asc' },
        include: {
          patient: true,
        },
      });

      if (eligibleUpcoming.length === 0) break;
      lastUpcomingId = eligibleUpcoming[eligibleUpcoming.length - 1].id;

      for (const appt of eligibleUpcoming) {
        upcomingScanned++;
        const currentRev = appt.scheduleRevision ?? 1;

        // In dryRun: if plannedUpgrades already scheduled an upgrade for this appointment, avoid double-counting
        if (dryRun && plannedUpgrades.has(`${appt.id}:${currentRev}`)) {
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
          if (dryRun) {
            result.newlyCreated++;
            result.details?.push({
              jobId: `new_reminder_${appt.id}`,
              action: 'PREDICTED_CREATE',
              reason: `Would create missing current-generation reminder for appointment ${appt.id}`,
            });
          } else {
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

            // ONLY count if a new reminder was truly created (not returning existing job)
            if (recoveryJob && (recoveryJob as any).isNewlyCreated) {
              result.newlyCreated++;
              result.details?.push({
                jobId: recoveryJob.id,
                action: 'CREATED',
                reason: `Created missing current-generation reminder for appointment ${appt.id}`,
              });
            }
          }
        }
      }
    }

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
      patientEmail?: string | null;
      patientPhone: string;
      revision?: number;
      scheduleRevision?: number;
    },
    tx?: Prisma.TransactionClient | PrismaService,
  ) {
    const formattedTime = this.formatTashkentTime(appointment.startTime);
    const revision = appointment.revision ?? 1;
    const scheduleRevision = appointment.scheduleRevision ?? 1;

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
            startTime: appointment.startTime.toISOString(),
            scheduleRevision,
            formattedTime,
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
            startTime: appointment.startTime.toISOString(),
            scheduleRevision,
            formattedTime,
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
            formattedTime,
            adminUrl: `${frontendUrl}/admin/calendar?appointmentId=${appointment.id}`,
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
            startTime: appointment.startTime.toISOString(),
            scheduleRevision,
            formattedTime,
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
      patientEmail?: string | null;
      patientPhone: string;
      revision?: number;
    },
    tx?: Prisma.TransactionClient | PrismaService,
  ) {
    const formattedTime = this.formatTashkentTime(appointment.startTime);
    const revision = appointment.revision ?? 1;

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
          startTime: appointment.startTime.toISOString(),
          formattedTime,
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
      patientEmail?: string | null;
      patientPhone: string;
      revision?: number;
    },
    tx?: Prisma.TransactionClient | PrismaService,
  ) {
    // 1. Cancel pending reminders immediately inside tx
    await this.cancelAppointmentReminders(appointment.id, tx);

    const formattedTime = this.formatTashkentTime(appointment.startTime);
    const revision = appointment.revision ?? 1;

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
          startTime: appointment.startTime.toISOString(),
          formattedTime,
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
      patientEmail?: string | null;
      patientPhone: string;
      revision: number;
      scheduleRevision?: number;
    },
    tx?: Prisma.TransactionClient | PrismaService,
  ) {
    // 1. Cancel previous pending reminders inside tx
    await this.cancelAppointmentReminders(appointment.id, tx);

    const formattedTime = this.formatTashkentTime(appointment.startTime);
    const scheduleRevision = appointment.scheduleRevision ?? appointment.revision;

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
          startTime: appointment.startTime.toISOString(),
          scheduleRevision,
          formattedTime,
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
            startTime: appointment.startTime.toISOString(),
            scheduleRevision,
            formattedTime,
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

  private async deliverJob(job: any, workerLeaseToken: string) {
    // 1. Pre-flight check: ONLY apply status suppression to reminders!
    if (job.appointmentId && job.templateKey === 'appointment_reminder') {
      const appt = await this.prisma.appointment.findUnique({
        where: { id: job.appointmentId },
        select: { status: true, startTime: true, revision: true, scheduleRevision: true },
      });

      // Cancel reminder if appointment is cancelled, completed, or no-show
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
      // (A delivered reminder for schedule A must NOT suppress reminder for rescheduled schedule B!)
      const targetScheduleRevision = job.scheduleRevision ?? currentScheduleRev;
      const alreadyDeliveredForSchedule = await this.prisma.notificationJob.findFirst({
        where: {
          appointmentId: job.appointmentId,
          templateKey: 'appointment_reminder',
          id: { not: job.id },
          OR: [
            { scheduleRevision: targetScheduleRevision },
            {
              scheduleRevision: null,
              payload: { path: ['startTime'], equals: new Date(appt.startTime).toISOString() },
            },
          ],
          status: { in: [NotificationStatus.SENT, NotificationStatus.SIMULATED] },
        },
      });
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

      // If duration changed without rescheduling start time, the appointment revision incremented
      // but scheduleRevision and start time are preserved! Worker proceeds with delivery without cancelling.
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
            "last_error" = ${isRealDelivery ? null : 'Development sink (simulated delivery)'},
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
            "last_error" = ${err?.message || String(err)},
            "locked_at" = NULL,
            "lease_token" = NULL,
            "scheduled_for" = NOW() + INTERVAL '2 minutes'
        WHERE id = ${job.id} AND "lease_token" = ${workerLeaseToken};
      `;
    }
  }

  private async deliverEmail(job: any): Promise<boolean> {
    const smtpFrom = this.configService.get<string>('SMTP_FROM', 'DentaCare <info@dentacare.uz>');
    const payload = job.payload || {};
    const formattedTime = payload.formattedTime || this.formatTashkentTime(payload.startTime || new Date());

    let subject = `DentaCare: Qabul bildirishnomasi`;
    let text = `Hurmatli bemor! Sizning ${payload.serviceName || ''} bo'yicha qabulingiz qayd etildi. Vaqti: ${formattedTime}.`;

    if (job.templateKey === 'patient_booking_confirmed') {
      subject = `DentaCare: Qabulingiz tasdiqlandi!`;
      text = `Hurmatli bemor! Sizning ${payload.serviceName || ''} bo'yicha qabulingiz tasdiqlandi. Qabul vaqti: ${formattedTime}. Sizni kutamiz!`;
    } else if (job.templateKey === 'appointment_cancellation') {
      subject = `DentaCare: Qabul bekor qilindi`;
      text = `Hurmatli bemor! Sizning ${payload.serviceName || ''} bo'yicha qabulingiz (${formattedTime}) bekor qilindi.`;
    } else if (job.templateKey === 'appointment_rescheduled') {
      subject = `DentaCare: Qabul yangi vaqtga ko'chirildi`;
      text = `Hurmatli bemor! Sizning ${payload.serviceName || ''} bo'yicha qabulingiz yangi vaqtga rejalashtirildi: ${formattedTime}.`;
    } else if (job.templateKey === 'appointment_reminder') {
      subject = `DentaCare: Qabul eslatmasi`;
      text = `Hurmatli bemor! Eslatib o'tamiz, bugun ${formattedTime} da ${payload.serviceName || ''} qabuliga yozilgansiz.`;
    }

    if (this.mailTransporter) {
      await this.mailTransporter.sendMail({
        from: smtpFrom,
        to: job.recipient,
        subject,
        text,
        headers: {
          'X-DentaCare-Job-ID': job.id,
          'X-DentaCare-Deduplication': job.deduplicationKey || job.id,
        },
      });
      return true;
    } else {
      this.logger.log(
        `[DEV SINK: EMAIL] To: ${this.redactRecipient(job.recipient)} | Subject: ${subject}`,
      );
      return false;
    }
  }

  private async deliverSms(job: any): Promise<boolean> {
    const smsApiKey = this.configService.get<string>('SMS_API_KEY');
    const smsApiUrl = this.configService.get<string>('SMS_API_URL');
    const payload = job.payload || {};
    const formattedTime = payload.formattedTime || this.formatTashkentTime(payload.startTime || new Date());

    let message = `DentaCare: ${payload.serviceName || ''} - ${formattedTime}`;
    if (job.templateKey === 'patient_booking_confirmed') {
      message = `DentaCare: Qabulingiz tasdiqlandi. ${payload.serviceName || ''} - ${formattedTime}`;
    } else if (job.templateKey === 'appointment_cancellation') {
      message = `DentaCare: Qabulingiz bekor qilindi. ${payload.serviceName || ''}`;
    } else if (job.templateKey === 'appointment_rescheduled') {
      message = `DentaCare: Qabul yangi vaqtga ko'chirildi: ${formattedTime}`;
    } else if (job.templateKey === 'appointment_reminder') {
      message = `DentaCare Eslatma: Bugun ${formattedTime} da qabuldasiz.`;
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
        this.logger.warn(`SMS dispatch failed: ${e?.message}`);
        throw e;
      }
    } else {
      this.logger.log(
        `[DEV SINK: SMS] To: ${this.redactRecipient(job.recipient)} | Message: ${message}`,
      );
      return false;
    }
  }

  private async deliverTelegram(job: any): Promise<boolean> {
    const botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    const payload = job.payload || {};
    const formattedTime = payload.formattedTime || this.formatTashkentTime(payload.startTime || new Date());

    const text = `🔔 *Yangi qabul so'rovi!*\n\nXizmat: ${payload.serviceName}\nVaqti: ${formattedTime}\n\n👉 Boshqaruv paneli: ${payload.adminUrl}`;

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
        this.logger.warn(`Telegram API call failed: ${e?.message}`);
        throw e;
      }
    } else {
      this.logger.log(
        `[DEV SINK: TELEGRAM] Chat: ${this.redactRecipient(job.recipient)} | Message: ${text.replace(/\n/g, ' ')}`,
      );
      return false;
    }
  }

  async findAll(params: { status?: NotificationStatus; page?: number; limit?: number }) {
    const { status, page = 1, limit = 50 } = params;
    const where: Prisma.NotificationJobWhereInput = {};
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      this.prisma.notificationJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notificationJob.count({ where }),
    ]);

    return { items, total, page, limit };
  }
}
