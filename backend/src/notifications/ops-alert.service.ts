import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { NotificationChannel, NotificationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const WINDOW_MS = 30 * 60 * 1000;
const ALERT_TEMPLATE = 'ops_failed_notifications_alert';

/**
 * Operational alert: every 30 minutes, if any notification (SMS, email,
 * Telegram, bot reminders) ended up FAILED in the previous window, post one
 * summary to OPS_TELEGRAM_CHAT_ID (falls back to TELEGRAM_CHAT_ID).
 *
 * - No recipients or patient data in the message: counts, channels, templates
 *   and a truncated sample error only.
 * - Exactly once per window, even with several backend replicas: the alert is
 *   claimed by inserting a notification_jobs row with a unique dedup key
 *   (status SENT, so the outbox worker never picks it up).
 */
@Injectable()
export class OpsAlertService {
  private readonly logger = new Logger(OpsAlertService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  static windowFor(now: Date) {
    const end = new Date(Math.floor(now.getTime() / WINDOW_MS) * WINDOW_MS);
    return { start: new Date(end.getTime() - WINDOW_MS), end };
  }

  async summarizeFailures(start: Date, end: Date) {
    const where: Prisma.NotificationJobWhereInput = {
      status: NotificationStatus.FAILED,
      updatedAt: { gte: start, lt: end },
      templateKey: { not: ALERT_TEMPLATE },
    };
    const [groups, sample] = await Promise.all([
      this.prisma.notificationJob.groupBy({
        by: ['channel', 'templateKey'],
        where,
        _count: { _all: true },
      }),
      this.prisma.notificationJob.findFirst({
        where,
        orderBy: { updatedAt: 'desc' },
        select: { lastError: true },
      }),
    ]);
    const total = groups.reduce((sum, g) => sum + g._count._all, 0);
    return {
      total,
      groups: groups
        .map((g) => ({ channel: g.channel, templateKey: g.templateKey, count: g._count._all }))
        .sort((a, b) => b.count - a.count),
      sampleError: sample?.lastError ? sample.lastError.slice(0, 200) : null,
    };
  }

  buildText(summary: Awaited<ReturnType<OpsAlertService['summarizeFailures']>>, start: Date, end: Date) {
    const fmt = (d: Date) => d.toISOString().slice(11, 16);
    const lines = [
      `⚠️ Bildirishnomalar yuborilmadi: ${summary.total} ta (${fmt(start)}–${fmt(end)} UTC)`,
      '',
      ...summary.groups.map((g) => `• ${g.channel} / ${g.templateKey}: ${g.count}`),
    ];
    if (summary.sampleError) lines.push('', `Oxirgi xato: ${summary.sampleError}`);
    const frontendUrl = this.config.get<string>('FRONTEND_URL');
    if (frontendUrl) lines.push('', `Batafsil: ${frontendUrl.replace(/\/$/, '')}/admin/notifications`);
    return lines.join('\n');
  }

  @Cron('1,31 * * * *')
  async scheduledRun() {
    if (this.config.get<string>('NODE_ENV') === 'test') return;
    try {
      await this.run(new Date());
    } catch (err: any) {
      this.logger.error(`Ops alert failed: ${err?.message}`);
    }
  }

  async run(now: Date): Promise<{ total: number; sent: boolean; reason?: string }> {
    const { start, end } = OpsAlertService.windowFor(now);
    const summary = await this.summarizeFailures(start, end);
    if (summary.total === 0) return { total: 0, sent: false, reason: 'no failures' };

    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN');
    const chatId = this.config.get<string>('OPS_TELEGRAM_CHAT_ID') || this.config.get<string>('TELEGRAM_CHAT_ID');
    if (!token || !chatId) {
      this.logger.warn(`${summary.total} failed notifications in the last window; no Telegram chat configured for ops alerts`);
      return { total: summary.total, sent: false, reason: 'not configured' };
    }

    // Claim this window once across replicas
    try {
      await this.prisma.notificationJob.create({
        data: {
          channel: NotificationChannel.TELEGRAM,
          status: NotificationStatus.SENT,
          templateKey: ALERT_TEMPLATE,
          recipient: 'ops',
          attempts: 1,
          sentAt: now,
          deduplicationKey: `${ALERT_TEMPLATE}_${start.toISOString()}`,
          payload: { total: summary.total, windowStart: start.toISOString() },
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return { total: summary.total, sent: false, reason: 'already sent' };
      }
      throw e;
    }

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: this.buildText(summary, start, end), disable_web_page_preview: true }),
    });
    if (!res.ok) {
      this.logger.error(`Ops alert Telegram send failed: HTTP ${res.status}`);
      return { total: summary.total, sent: false, reason: `telegram ${res.status}` };
    }
    return { total: summary.total, sent: true };
  }
}
