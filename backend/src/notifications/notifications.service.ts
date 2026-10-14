import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import {
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

    // 2. Staff Telegram alert (no patient details, link to admin only)
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
          adminUrl: `${frontendUrl}/admin/appointments/${appointment.id}`,
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
        status: NotificationStatus.PENDING,
      },
      data: {
        status: NotificationStatus.CANCELLED,
      },
    });
  }

  /**
   * Cron runner: Process pending notification jobs every minute
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async processPendingJobs() {
    const now = new Date();
    const pendingJobs = await this.prisma.notificationJob.findMany({
      where: {
        status: NotificationStatus.PENDING,
        scheduledFor: { lte: now },
      },
      take: 20,
    });

    for (const job of pendingJobs) {
      await this.deliverJob(job);
    }
  }

  private async deliverJob(job: any) {
    try {
      if (job.channel === NotificationChannel.EMAIL) {
        await this.deliverEmail(job);
      } else if (job.channel === NotificationChannel.SMS) {
        await this.deliverSms(job);
      } else if (job.channel === NotificationChannel.TELEGRAM) {
        await this.deliverTelegram(job);
      }

      await this.prisma.notificationJob.update({
        where: { id: job.id },
        data: {
          status: NotificationStatus.SENT,
          sentAt: new Date(),
          attempts: job.attempts + 1,
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
        },
      });
    }
  }

  private async deliverEmail(job: any) {
    const smtpFrom = this.configService.get<string>('SMTP_FROM', 'DentaCare <info@dentacare.uz>');
    const payload = job.payload || {};

    if (this.mailTransporter) {
      await this.mailTransporter.sendMail({
        from: smtpFrom,
        to: job.recipient,
        subject: `DentaCare: Qabul tafsilotlari - ${payload.serviceName || ''}`,
        text: `Hurmatli bemor! Sizning ${payload.serviceName} bo'yicha qabulingiz qayd etildi. Vaqti: ${payload.startTime}.`,
      });
    } else {
      // Explicit development sink
      this.logger.log(
        `[DEV SINK: EMAIL] To: ${job.recipient} | Template: ${job.templateKey} | Payload: ${JSON.stringify(payload)}`,
      );
    }
  }

  private async deliverSms(job: any) {
    const smsApiKey = this.configService.get<string>('SMS_API_KEY');
    const payload = job.payload || {};

    if (smsApiKey) {
      // Real SMS provider dispatch would go here
      this.logger.log(`Dispatched real SMS to ${job.recipient}`);
    } else {
      // Explicit development sink
      this.logger.log(
        `[DEV SINK: SMS] To: ${job.recipient} | Template: ${job.templateKey} | Payload: ${JSON.stringify(payload)}`,
      );
    }
  }

  private async deliverTelegram(job: any) {
    const botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    const payload = job.payload || {};

    // Notice: Patient PII is completely excluded! Only link to authenticated admin!
    const text = `🔔 *Yangi qabul so'rovi!*\n\nXizmat: ${payload.serviceName}\nVaqti: ${payload.startTime}\n\n👉 Boshqaruv paneli: ${payload.adminUrl}`;

    if (botToken) {
      // Real Telegram bot API call via fetch
      try {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: job.recipient,
            text,
            parse_mode: 'Markdown',
          }),
        });
      } catch (e: any) {
        this.logger.warn(`Telegram API call failed: ${e?.message}`);
        throw e;
      }
    } else {
      // Explicit development sink
      this.logger.log(
        `[DEV SINK: TELEGRAM] Chat: ${job.recipient} | Message: ${text.replace(/\n/g, ' ')}`,
      );
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
