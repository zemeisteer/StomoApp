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
  scheduledFor?: Date;
  deduplicationKey?: string;
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
          scheduledFor: params.scheduledFor || new Date(),
          deduplicationKey: params.deduplicationKey || null,
          status: NotificationStatus.PENDING,
        },
      });
    } catch (e: any) {
      this.logger.error(`Failed to enqueue notification: ${e?.message}`);
      return null;
    }
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
    },
    tx?: Prisma.TransactionClient | PrismaService,
  ) {
    const formattedTime = this.formatTashkentTime(appointment.startTime);
    const revision = appointment.revision ?? 1;

    // 1. Patient Confirmation / Received (Email or SMS)
    if (appointment.patientEmail) {
      await this.enqueue(
        {
          channel: NotificationChannel.EMAIL,
          templateKey: 'patient_booking_received',
          recipient: appointment.patientEmail,
          appointmentId: appointment.id,
          appointmentRevision: revision,
          deduplicationKey: `booking_email_${appointment.id}`,
          payload: {
            appointmentId: appointment.id,
            serviceName: appointment.serviceName,
            startTime: appointment.startTime.toISOString(),
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
          deduplicationKey: `booking_sms_${appointment.id}`,
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
          scheduledFor: reminderTime,
          deduplicationKey: `reminder_${appointment.id}_rev${revision}`,
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
    },
    tx?: Prisma.TransactionClient | PrismaService,
  ) {
    // 1. Cancel previous pending reminders inside tx
    await this.cancelAppointmentReminders(appointment.id, tx);

    const formattedTime = this.formatTashkentTime(appointment.startTime);

    // 2. Queue reschedule notification
    await this.enqueue(
      {
        channel: appointment.patientEmail ? NotificationChannel.EMAIL : NotificationChannel.SMS,
        templateKey: 'appointment_rescheduled',
        recipient: appointment.patientEmail || appointment.patientPhone,
        appointmentId: appointment.id,
        appointmentRevision: appointment.revision,
        deduplicationKey: `rescheduled_${appointment.id}_rev${appointment.revision}`,
        payload: {
          appointmentId: appointment.id,
          serviceName: appointment.serviceName,
          startTime: appointment.startTime.toISOString(),
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
          scheduledFor: reminderTime,
          deduplicationKey: `reminder_${appointment.id}_rev${appointment.revision}`,
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
        select: { status: true, startTime: true, revision: true },
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

      // Check if appointment was rescheduled to a DIFFERENT start time
      const payloadStartTime = job.payload?.startTime ? new Date(job.payload.startTime).getTime() : null;
      const apptStartTime = appt.startTime.getTime();
      const startTimeChanged = payloadStartTime !== null && payloadStartTime !== apptStartTime;

      if (startTimeChanged) {
        await this.prisma.$executeRaw`
          UPDATE "notification_jobs"
          SET status = 'CANCELLED'::"notification_status",
              "last_error" = 'Qabul qayta rejalashtirilganligi sababli eski eslatma bekor qilindi',
              "lease_token" = NULL
          WHERE id = ${job.id} AND "lease_token" = ${workerLeaseToken};
        `;
        return;
      }

      // Check if a newer reminder for this appointment has already been sent
      const newerDelivered = await this.prisma.notificationJob.findFirst({
        where: {
          appointmentId: job.appointmentId,
          templateKey: 'appointment_reminder',
          id: { not: job.id },
          status: { in: [NotificationStatus.SENT, NotificationStatus.SIMULATED] },
        },
      });
      if (newerDelivered) {
        await this.prisma.$executeRaw`
          UPDATE "notification_jobs"
          SET status = 'CANCELLED'::"notification_status",
              "last_error" = 'Ushbu qabul uchun yangi eslatma allaqachon yuborilgan',
              "lease_token" = NULL
          WHERE id = ${job.id} AND "lease_token" = ${workerLeaseToken};
        `;
        return;
      }

      // If duration changed without rescheduling start time, the appointment revision incremented
      // but the reminder time is still valid! Worker proceeds with delivery without cancelling.
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
