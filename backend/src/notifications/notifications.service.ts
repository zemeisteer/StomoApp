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

export interface EnqueueNotificationParams {
  channel: NotificationChannel;
  templateKey: string;
  recipient: string;
  payload: Record<string, any>;
  appointmentId?: string;
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
      });
      this.logger.log('SMTP mail transporter initialized');
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

  /**
   * Enqueue a durable notification job with deduplication
   */
  async enqueue(params: EnqueueNotificationParams) {
    try {
      if (params.deduplicationKey) {
        const existing = await this.prisma.notificationJob.findUnique({
          where: { deduplicationKey: params.deduplicationKey },
        });
        if (existing) {
          return existing; // already queued
        }
      }

      return await this.prisma.notificationJob.create({
        data: {
          channel: params.channel,
          templateKey: params.templateKey,
          recipient: params.recipient,
          payload: params.payload as Prisma.InputJsonValue,
          appointmentId: params.appointmentId || null,
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
   * Helper: Queue standard appointment notifications
   */
  async notifyBookingCreated(appointment: {
    id: string;
    startTime: Date;
    serviceName: string;
    patientEmail?: string | null;
    patientPhone: string;
  }) {
    // 1. Patient Email or SMS
    if (appointment.patientEmail) {
      await this.enqueue({
        channel: NotificationChannel.EMAIL,
        templateKey: 'patient_booking_received',
        recipient: appointment.patientEmail,
        appointmentId: appointment.id,
        deduplicationKey: `booking_email_${appointment.id}`,
        payload: {
          appointmentId: appointment.id,
          serviceName: appointment.serviceName,
          startTime: appointment.startTime.toISOString(),
        },
      });
    } else {
      await this.enqueue({
        channel: NotificationChannel.SMS,
        templateKey: 'patient_booking_received_sms',
        recipient: appointment.patientPhone,
        appointmentId: appointment.id,
        deduplicationKey: `booking_sms_${appointment.id}`,
        payload: {
          appointmentId: appointment.id,
          serviceName: appointment.serviceName,
          startTime: appointment.startTime.toISOString(),
        },
      });
    }

    // 2. Staff Telegram alert (no patient details, link to authenticated admin only)
    const telegramChatId = this.configService.get<string>('TELEGRAM_CHAT_ID');
    if (telegramChatId) {
      const frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');
      await this.enqueue({
        channel: NotificationChannel.TELEGRAM,
        templateKey: 'staff_new_booking',
        recipient: telegramChatId,
        appointmentId: appointment.id,
        deduplicationKey: `staff_tg_${appointment.id}`,
        payload: {
          serviceName: appointment.serviceName,
          startTime: appointment.startTime.toISOString(),
          adminUrl: `${frontendUrl}/admin/calendar?appointmentId=${appointment.id}`,
        },
      });
    }

    // 3. Reminder (2 hours before start)
    const reminderTime = new Date(appointment.startTime.getTime() - 2 * 60 * 60 * 1000);
    if (reminderTime > new Date()) {
      await this.enqueue({
        channel: appointment.patientEmail ? NotificationChannel.EMAIL : NotificationChannel.SMS,
        templateKey: 'appointment_reminder',
        recipient: appointment.patientEmail || appointment.patientPhone,
        appointmentId: appointment.id,
        scheduledFor: reminderTime,
        deduplicationKey: `reminder_${appointment.id}`,
        payload: {
          appointmentId: appointment.id,
          serviceName: appointment.serviceName,
          startTime: appointment.startTime.toISOString(),
        },
      });
    }
  }

  /**
   * Cancel pending reminders when appointment is rescheduled or cancelled
   */
  async cancelAppointmentReminders(appointmentId: string) {
    await this.prisma.notificationJob.updateMany({
      where: {
        appointmentId,
        status: { in: [NotificationStatus.PENDING, NotificationStatus.PROCESSING] },
      },
      data: {
        status: NotificationStatus.CANCELLED,
      },
    });
  }

  /**
   * Cron runner: Process pending notification jobs every minute
   * Uses PostgreSQL FOR UPDATE SKIP LOCKED to ensure multiple workers never deliver the same job.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async processPendingJobs() {
    try {
      const claimedRows = await this.prisma.$queryRaw<{ id: string }[]>`
        UPDATE "notification_jobs"
        SET status = 'PROCESSING'::"notification_status", "locked_at" = NOW()
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

      const claimedIds = claimedRows.map(r => r.id);
      const jobs = await this.prisma.notificationJob.findMany({
        where: { id: { in: claimedIds } },
      });

      for (const job of jobs) {
        await this.deliverJob(job);
      }
    } catch (err: any) {
      this.logger.error(`Error in processPendingJobs: ${err?.message}`);
    }
  }

  private async deliverJob(job: any) {
    // Pre-flight check: if reminder for an appointment that is no longer active, cancel without delivery
    if (job.appointmentId) {
      const appt = await this.prisma.appointment.findUnique({
        where: { id: job.appointmentId },
        select: { status: true },
      });

      if (!appt || ([AppointmentStatus.CANCELLED, AppointmentStatus.COMPLETED, AppointmentStatus.NO_SHOW] as string[]).includes(appt.status)) {
        await this.prisma.notificationJob.update({
          where: { id: job.id },
          data: {
            status: NotificationStatus.CANCELLED,
            lastError: `Qabul holati (${appt?.status || 'topilmadi'}) tufayli bildirishnoma bekor qilindi`,
          },
        });
        return;
      }
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

      await this.prisma.notificationJob.update({
        where: { id: job.id },
        data: {
          status: isRealDelivery ? NotificationStatus.SENT : NotificationStatus.SIMULATED,
          sentAt: new Date(),
          attempts: job.attempts + 1,
          lastError: isRealDelivery ? null : 'Development sink (simulated delivery)',
        },
      });
    } catch (err: any) {
      const nextAttempts = job.attempts + 1;
      const willFail = nextAttempts >= job.maxAttempts;

      await this.prisma.notificationJob.update({
        where: { id: job.id },
        data: {
          attempts: nextAttempts,
          status: willFail ? NotificationStatus.FAILED : NotificationStatus.PENDING,
          lastError: err?.message || String(err),
          lockedAt: null,
        },
      });
    }
  }

  private async deliverEmail(job: any): Promise<boolean> {
    const smtpFrom = this.configService.get<string>('SMTP_FROM', 'DentaCare <info@dentacare.uz>');
    const payload = job.payload || {};

    if (this.mailTransporter) {
      await this.mailTransporter.sendMail({
        from: smtpFrom,
        to: job.recipient,
        subject: `DentaCare: Qabul tafsilotlari - ${payload.serviceName || ''}`,
        text: `Hurmatli bemor! Sizning ${payload.serviceName} bo'yicha qabulingiz qayd etildi. Vaqti: ${payload.startTime}.`,
      });
      return true;
    } else {
      // Explicit development sink
      this.logger.log(
        `[DEV SINK: EMAIL] To: ${this.redactRecipient(job.recipient)} | Template: ${job.templateKey}`,
      );
      return false;
    }
  }

  private async deliverSms(job: any): Promise<boolean> {
    const smsApiKey = this.configService.get<string>('SMS_API_KEY');
    const smsApiUrl = this.configService.get<string>('SMS_API_URL');
    const payload = job.payload || {};

    if (smsApiKey && smsApiUrl) {
      // Real SMS provider dispatch
      try {
        const res = await fetch(smsApiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${smsApiKey}`,
          },
          body: JSON.stringify({
            recipient: job.recipient,
            message: `DentaCare: ${payload.serviceName} - ${payload.startTime}`,
          }),
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
      // Explicit development sink
      this.logger.log(
        `[DEV SINK: SMS] To: ${this.redactRecipient(job.recipient)} | Template: ${job.templateKey}`,
      );
      return false;
    }
  }

  private async deliverTelegram(job: any): Promise<boolean> {
    const botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    const payload = job.payload || {};

    // Notice: Patient PII is completely excluded! Only link to authenticated admin!
    const text = `🔔 *Yangi qabul so'rovi!*\n\nXizmat: ${payload.serviceName}\nVaqti: ${payload.startTime}\n\n👉 Boshqaruv paneli: ${payload.adminUrl}`;

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
      // Explicit development sink
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
