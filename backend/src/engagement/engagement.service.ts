import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { NotificationChannel, NotificationStatus, Prisma } from '@prisma/client';
import { formatInTimeZone } from 'date-fns-tz';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export const RECALL_TEMPLATE = 'patient_recall';
export const BIRTHDAY_TEMPLATE = 'patient_birthday';
export const LOW_STOCK_TEMPLATE = 'ops_low_stock';
/** Templates whose final text is prepared at enqueue time and stored in payload.text. */
export const PRERENDERED_TEMPLATES = [RECALL_TEMPLATE, BIRTHDAY_TEMPLATE, LOW_STOCK_TEMPLATE];

const SEND_HOUR_LOCAL = 10; // automatic patient messages go out at 10:00 clinic time
const LOW_STOCK_HOUR_LOCAL = 9;
const MAX_AUTO_RECALLS_PER_DAY = 100;

type RecallRow = {
  id: string;
  full_name: string;
  phone: string;
  telegram_user_id: string | null;
  preferred_language: string;
  marketing_opt_out: boolean;
  last_recall_at: Date | null;
  last_visit: Date;
  interval_days: number;
  service_names: string | null;
};

@Injectable()
export class EngagementService {
  private readonly logger = new Logger(EngagementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  private async clinic() {
    const s = await this.prisma.clinicSettings.findFirst();
    return {
      id: s?.id,
      name: s?.name || 'Klinika',
      nameRu: s?.nameRu || s?.name || 'Клиника',
      phone: s?.phone && !s.phone.trim().startsWith('[') ? s.phone : '',
      timezone: s?.timezone || 'Asia/Tashkent',
      recallEnabled: Boolean(s?.recallEnabled),
      recallMonths: s?.recallMonths ?? 6,
      birthdayEnabled: Boolean(s?.birthdayEnabled),
    };
  }

  private siteUrl() {
    const url = this.config.get<string>('PUBLIC_SITE_URL') || this.config.get<string>('FRONTEND_URL') || '';
    return url.replace(/\/+$/, '');
  }

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------

  async getSettings() {
    const c = await this.clinic();
    return { recallEnabled: c.recallEnabled, recallMonths: c.recallMonths, birthdayEnabled: c.birthdayEnabled };
  }

  async updateSettings(dto: { recallEnabled?: boolean; recallMonths?: number; birthdayEnabled?: boolean }, userId: string) {
    const c = await this.clinic();
    if (!c.id) throw new NotFoundException('Klinika sozlamalari topilmadi');
    await this.prisma.clinicSettings.update({
      where: { id: c.id },
      data: { recallEnabled: dto.recallEnabled, recallMonths: dto.recallMonths, birthdayEnabled: dto.birthdayEnabled },
    });
    await this.audit.log({ userId, action: 'engagement.settings_updated', entity: 'ClinicSettings', entityId: c.id, details: dto });
    return this.getSettings();
  }

  // ---------------------------------------------------------------------------
  // Recall list
  // ---------------------------------------------------------------------------

  /**
   * Patients due for a check-up and with nothing booked. The interval comes from the services of
   * their last finished visit (shortest positive recall_days); services with 0 never recall, and
   * services without a value use the clinic default (recall_months).
   */
  private async dueRows(months: number, limit = 300) {
    const defaultDays = Math.round(months * 30.44);
    return this.prisma.$queryRaw<RecallRow[]>`
      WITH last_visit AS (
        SELECT DISTINCT ON (patient_id) id AS appointment_id, patient_id, service_id,
               COALESCE(actual_end_time, start_time) AS last_visit
        FROM appointments WHERE status = 'COMPLETED'
        ORDER BY patient_id, COALESCE(actual_end_time, start_time) DESC
      ),
      upcoming AS (
        SELECT DISTINCT patient_id FROM appointments
        WHERE status IN ('PENDING', 'CONFIRMED') AND start_time > NOW()
      ),
      visit_interval AS (
        SELECT lv.patient_id, lv.last_visit,
               CASE
                 WHEN r.min_days IS NOT NULL THEN r.min_days
                 WHEN r.total > 0 AND r.zero_count = r.total THEN NULL
                 ELSE ${defaultDays}::int
               END AS interval_days,
               r.service_names
        FROM last_visit lv
        LEFT JOIN LATERAL (
          SELECT MIN(s.recall_days) FILTER (WHERE s.recall_days > 0) AS min_days,
                 COUNT(*) FILTER (WHERE s.recall_days = 0) AS zero_count,
                 COUNT(s.id) AS total,
                 STRING_AGG(DISTINCT s.name_uz, ', ') AS service_names
          FROM services s
          WHERE s.id IN (
            SELECT i.service_id FROM appointment_service_items i WHERE i.appointment_id = lv.appointment_id
            UNION SELECT lv.service_id
          )
        ) r ON true
      )
      SELECT p.id, p.full_name, p.phone, p.telegram_user_id, p.preferred_language,
             p.marketing_opt_out, p.last_recall_at, vi.last_visit, vi.interval_days, vi.service_names
      FROM patients p
      JOIN visit_interval vi ON vi.patient_id = p.id
      LEFT JOIN upcoming u ON u.patient_id = p.id
      WHERE p.is_active = true
        AND u.patient_id IS NULL
        AND vi.interval_days IS NOT NULL
        AND vi.last_visit <= NOW() - make_interval(days => vi.interval_days)
      ORDER BY vi.last_visit ASC
      LIMIT ${limit}`;
  }

  async listRecallDue() {
    const c = await this.clinic();
    const rows = await this.dueRows(c.recallMonths);
    const now = Date.now();
    return {
      recallMonths: c.recallMonths,
      items: rows.map((r) => ({
        patientId: r.id,
        fullName: r.full_name,
        phone: r.phone,
        telegramLinked: Boolean(r.telegram_user_id),
        optedOut: r.marketing_opt_out,
        lastVisitAt: r.last_visit,
        monthsSinceVisit: Math.floor((now - new Date(r.last_visit).getTime()) / (30.44 * 24 * 60 * 60 * 1000)),
        daysSinceVisit: Math.floor((now - new Date(r.last_visit).getTime()) / (24 * 60 * 60 * 1000)),
        intervalDays: Number(r.interval_days),
        lastServices: r.service_names,
        // Already reminded for this gap (automatic message or a staff call after the last visit)
        contactedAt: r.last_recall_at && r.last_recall_at >= r.last_visit ? r.last_recall_at : null,
      })),
    };
  }

  /** Birthdays in the next `days` days (clinic calendar), today first. */
  async listBirthdays(days = 7) {
    const c = await this.clinic();
    const patients = await this.prisma.patient.findMany({
      where: { isActive: true, birthDate: { not: null } },
      select: { id: true, fullName: true, phone: true, birthDate: true, marketingOptOut: true, telegramUserId: true },
    });
    const today = formatInTimeZone(new Date(), c.timezone, 'yyyy-MM-dd');
    const base = new Date(`${today}T00:00:00Z`);
    const upcoming: Array<Record<string, unknown>> = [];
    for (const p of patients) {
      const bd = p.birthDate!;
      for (let d = 0; d < days; d++) {
        const day = new Date(base.getTime() + d * 86400000);
        if (day.getUTCMonth() === bd.getUTCMonth() && day.getUTCDate() === bd.getUTCDate()) {
          upcoming.push({
            patientId: p.id,
            fullName: p.fullName,
            phone: p.phone,
            telegramLinked: Boolean(p.telegramUserId),
            optedOut: p.marketingOptOut,
            birthDate: bd.toISOString().slice(0, 10),
            inDays: d,
            turnsAge: day.getUTCFullYear() - bd.getUTCFullYear(),
          });
          break;
        }
      }
    }
    return upcoming.sort((a: any, b: any) => a.inDays - b.inDays);
  }

  // ---------------------------------------------------------------------------
  // Messages
  // ---------------------------------------------------------------------------

  private recallText(lang: string, firstName: string, c: Awaited<ReturnType<EngagementService['clinic']>>) {
    const link = this.siteUrl() ? ` ${this.siteUrl()}/booking` : '';
    const phone = c.phone ? ` ${c.phone}` : '';
    return lang === 'ru'
      ? `${c.nameRu}: ${firstName}, пора на плановый осмотр. Регулярный осмотр помогает избежать сложного лечения. Запись:${link}${phone}`
      : `${c.name}: ${firstName}, profilaktik ko'rik vaqti keldi. Muntazam ko'rik murakkab davolashning oldini oladi. Yozilish:${link}${phone}`;
  }

  private birthdayText(lang: string, firstName: string, c: Awaited<ReturnType<EngagementService['clinic']>>) {
    return lang === 'ru'
      ? `${c.nameRu}: ${firstName}, поздравляем с днём рождения! Желаем здоровья и красивой улыбки.`
      : `${c.name}: ${firstName}, tug'ilgan kuningiz bilan tabriklaymiz! Sizga sog'lik va chiroyli tabassum tilaymiz.`;
  }

  /** Telegram when the patient linked the bot, otherwise SMS. Duplicate keys are silently skipped. */
  private async enqueue(
    patient: { id: string; phone: string; telegram_user_id?: string | null; telegramUserId?: string | null },
    templateKey: string,
    text: string,
    dedupKey: string,
  ) {
    const tg = patient.telegram_user_id ?? patient.telegramUserId ?? null;
    try {
      await this.prisma.notificationJob.create({
        data: {
          channel: tg ? NotificationChannel.TELEGRAM : NotificationChannel.SMS,
          templateKey,
          recipient: tg || patient.phone,
          payload: { text, patientId: patient.id },
          deduplicationKey: dedupKey,
        },
      });
      return true;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return false;
      throw e;
    }
  }

  /** Manual recall from the list. Works even when automatic recall is off; never for opted-out patients. */
  async sendRecall(patientId: string, userId: string) {
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient) throw new NotFoundException('Bemor topilmadi');
    if (patient.marketingOptOut) throw new BadRequestException('Bemor eslatmalardan voz kechgan');
    const c = await this.clinic();
    const firstName = patient.fullName.trim().split(/\s+/)[0];
    const day = formatInTimeZone(new Date(), c.timezone, 'yyyy-MM-dd');
    const queued = await this.enqueue(
      { id: patient.id, phone: patient.phone, telegramUserId: patient.telegramUserId },
      RECALL_TEMPLATE,
      this.recallText(patient.preferredLanguage, firstName, c),
      `recall_manual_${patient.id}_${day}`,
    );
    if (!queued) throw new BadRequestException('Bugun bu bemorga eslatma allaqachon yuborilgan');
    await this.prisma.patient.update({ where: { id: patientId }, data: { lastRecallAt: new Date() } });
    await this.audit.log({ userId, action: 'engagement.recall_sent', entity: 'Patient', entityId: patientId, details: { manual: true } });
    return { queued: true };
  }

  async markContacted(patientId: string, userId: string) {
    const res = await this.prisma.patient.updateMany({ where: { id: patientId }, data: { lastRecallAt: new Date() } });
    if (res.count !== 1) throw new NotFoundException('Bemor topilmadi');
    await this.audit.log({ userId, action: 'engagement.recall_contacted', entity: 'Patient', entityId: patientId });
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // Automatic runs
  // ---------------------------------------------------------------------------

  /** Daily recall + birthday batch. Idempotent per patient and day/visit via dedup keys. */
  async runDaily(now = new Date()) {
    const c = await this.clinic();
    const result = { recalls: 0, birthdays: 0 };
    const day = formatInTimeZone(now, c.timezone, 'yyyy-MM-dd');

    if (c.recallEnabled) {
      const rows = (await this.dueRows(c.recallMonths)).filter(
        (r) => !r.marketing_opt_out && !(r.last_recall_at && r.last_recall_at >= r.last_visit),
      );
      for (const r of rows.slice(0, MAX_AUTO_RECALLS_PER_DAY)) {
        const visitKey = new Date(r.last_visit).toISOString().slice(0, 10);
        const ok = await this.enqueue(r, RECALL_TEMPLATE, this.recallText(r.preferred_language, r.full_name.trim().split(/\s+/)[0], c), `recall_${r.id}_${visitKey}`);
        if (ok) {
          await this.prisma.patient.update({ where: { id: r.id }, data: { lastRecallAt: now } });
          result.recalls++;
        }
      }
    }

    if (c.birthdayEnabled) {
      const [, mm, dd] = day.split('-').map(Number);
      const patients = await this.prisma.$queryRaw<Array<{ id: string; full_name: string; phone: string; telegram_user_id: string | null; preferred_language: string }>>`
        SELECT id, full_name, phone, telegram_user_id, preferred_language FROM patients
        WHERE is_active = true AND marketing_opt_out = false AND birth_date IS NOT NULL
          AND EXTRACT(MONTH FROM birth_date) = ${mm} AND EXTRACT(DAY FROM birth_date) = ${dd}`;
      for (const p of patients) {
        const ok = await this.enqueue(p, BIRTHDAY_TEMPLATE, this.birthdayText(p.preferred_language, p.full_name.trim().split(/\s+/)[0], c), `birthday_${p.id}_${day.slice(0, 4)}`);
        if (ok) result.birthdays++;
      }
    }
    return result;
  }

  /** Low-stock summary to the staff/ops Telegram chat, once per day. */
  async runLowStockAlert(now = new Date()) {
    const chatId = this.config.get<string>('OPS_TELEGRAM_CHAT_ID') || this.config.get<string>('TELEGRAM_CHAT_ID');
    if (!chatId) return { sent: false, items: 0 };
    const items = await this.prisma.$queryRaw<Array<{ name: string; quantity: number; unit: string; min_threshold: number }>>`
      SELECT name, quantity, unit, min_threshold FROM inventory_items
      WHERE quantity <= min_threshold ORDER BY (quantity::float / GREATEST(min_threshold, 1)) ASC LIMIT 25`;
    if (items.length === 0) return { sent: false, items: 0 };
    const c = await this.clinic();
    const day = formatInTimeZone(now, c.timezone, 'yyyy-MM-dd');
    const lines = items.map((i) => `• ${i.name}: ${i.quantity} ${i.unit} (min ${i.min_threshold})`);
    const text = `${c.name}: omborda kam qolgan mahsulotlar (${items.length})\n${lines.join('\n')}`;
    try {
      await this.prisma.notificationJob.create({
        data: {
          channel: NotificationChannel.TELEGRAM,
          status: NotificationStatus.PENDING,
          templateKey: LOW_STOCK_TEMPLATE,
          recipient: chatId,
          payload: { text },
          deduplicationKey: `ops_low_stock_${day}`,
        },
      });
      return { sent: true, items: items.length };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return { sent: false, items: items.length };
      throw e;
    }
  }

  /** Hourly tick; work happens only in the configured local hour. */
  @Cron('7 * * * *')
  async tick() {
    if (process.env.NODE_ENV === 'test') return;
    try {
      const c = await this.clinic();
      const hour = Number(formatInTimeZone(new Date(), c.timezone, 'H'));
      if (hour === SEND_HOUR_LOCAL) {
        const r = await this.runDaily();
        if (r.recalls || r.birthdays) this.logger.log(`Engagement: ${r.recalls} recalls, ${r.birthdays} birthday messages queued`);
      }
      if (hour === LOW_STOCK_HOUR_LOCAL) await this.runLowStockAlert();
    } catch (e) {
      this.logger.error(`Engagement tick failed: ${(e as Error).message}`);
    }
  }
}
