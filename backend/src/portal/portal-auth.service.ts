import { BadRequestException, HttpException, HttpStatus, Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export const PORTAL_COOKIE = 'patient_session';
export const PORTAL_SESSION_DAYS = 7;
const CODE_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_CODES_PER_HOUR = 5;
const AUDIENCE = 'patient-portal';

export type PortalSession = { phone: string };

/** Uzbek mobile numbers only: +998 followed by 9 digits. */
export function normalizeUzPhone(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const digits = input.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('998')) return `+${digits}`;
  if (digits.length === 9) return `+998${digits}`;
  return null;
}

@Injectable()
export class PortalAuthService {
  private readonly logger = new Logger(PortalAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** Separate key from staff tokens: a staff JWT can never be replayed as a patient session. */
  private get secret() {
    const base = this.config.get<string>('JWT_SECRET', 'dev-secret-change-me');
    return crypto.createHmac('sha256', base).update('patient-portal-session-v1').digest('hex');
  }

  private hashCode(phone: string, code: string) {
    return crypto.createHmac('sha256', this.secret).update(`${phone}:${code}`).digest('hex');
  }

  private get isProduction() {
    return process.env.NODE_ENV === 'production';
  }

  /**
   * Sends a 6-digit code. Responds the same way whether or not the number belongs to a patient,
   * so the endpoint cannot be used to discover who is a clinic patient.
   */
  async requestCode(rawPhone: unknown, lang: 'uz' | 'ru', ip: string | null) {
    const phone = normalizeUzPhone(rawPhone);
    if (!phone) throw new BadRequestException("Telefon raqami noto'g'ri. Masalan: +998 90 123 45 67");

    const now = Date.now();
    const recent = await this.prisma.portalOtp.findMany({
      where: { phone, createdAt: { gte: new Date(now - 60 * 60 * 1000) } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (recent[0] && now - recent[0].createdAt.getTime() < RESEND_COOLDOWN_MS) {
      const wait = Math.ceil((RESEND_COOLDOWN_MS - (now - recent[0].createdAt.getTime())) / 1000);
      throw new HttpException({ message: `Kodni qayta so'rash uchun ${wait} soniya kuting`, retryAfter: wait }, HttpStatus.TOO_MANY_REQUESTS);
    }
    if (recent.length >= MAX_CODES_PER_HOUR) {
      throw new HttpException("Juda ko'p urinish. Bir soatdan keyin qayta urinib ko'ring", HttpStatus.TOO_MANY_REQUESTS);
    }

    const patient = await this.prisma.patient.findFirst({
      where: { phone, isActive: true },
      select: { id: true, telegramUserId: true, preferredLanguage: true },
      orderBy: { createdAt: 'asc' },
    });

    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    let channel = 'NONE';
    if (patient) {
      channel = await this.deliver(phone, code, patient.telegramUserId, (patient.preferredLanguage as 'uz' | 'ru') || lang);
    }
    // Always store an attempt (also for unknown numbers) so rate limits apply uniformly
    await this.prisma.portalOtp.create({
      data: { phone, codeHash: this.hashCode(phone, code), channel, expiresAt: new Date(now + CODE_TTL_MS), ip },
    });

    const viaTelegram = channel === 'TELEGRAM';
    return {
      sent: true,
      channel: viaTelegram ? 'TELEGRAM' : 'SMS',
      expiresInSeconds: CODE_TTL_MS / 1000,
      resendInSeconds: RESEND_COOLDOWN_MS / 1000,
      // Without any delivery provider outside production, the code is shown to make local testing possible
      ...(channel === 'DEV' ? { devCode: code } : {}),
    };
  }

  /** Telegram (free, instant) for linked patients, otherwise SMS. */
  private async deliver(phone: string, code: string, telegramUserId: string | null, lang: 'uz' | 'ru') {
    const clinic = await this.prisma.clinicSettings.findFirst({ select: { name: true, nameRu: true } });
    const name = (lang === 'ru' ? clinic?.nameRu : clinic?.name) || 'Klinika';
    const text =
      lang === 'ru'
        ? `${name}: код для входа в личный кабинет ${code}. Никому не сообщайте его.`
        : `${name}: shaxsiy kabinetga kirish kodi ${code}. Uni hech kimga aytmang.`;

    const botToken = this.config.get<string>('PATIENT_BOT_TOKEN') || this.config.get<string>('TELEGRAM_BOT_TOKEN');
    if (telegramUserId && botToken) {
      try {
        const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: telegramUserId, text }),
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) return 'TELEGRAM';
        this.logger.warn(`Portal code via Telegram failed with ${res.status}; falling back to SMS`);
      } catch (e) {
        this.logger.warn(`Portal code via Telegram failed: ${(e as Error).message}; falling back to SMS`);
      }
    }

    const smsApiKey = this.config.get<string>('SMS_API_KEY');
    const smsApiUrl = this.config.get<string>('SMS_API_URL');
    if (smsApiKey && smsApiUrl) {
      const res = await fetch(smsApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${smsApiKey}` },
        body: JSON.stringify({ recipient: phone, message: text }),
        signal: AbortSignal.timeout(5000),
      }).catch((e) => {
        this.logger.error(`Portal code SMS failed: ${(e as Error).message}`);
        return null;
      });
      if (!res || !res.ok) throw new ServiceUnavailableException("Kodni yuborib bo'lmadi. Birozdan keyin urinib ko'ring");
      return 'SMS';
    }

    if (this.isProduction) throw new ServiceUnavailableException("SMS xizmati sozlanmagan. Klinikaga murojaat qiling");
    this.logger.log(`[DEV SINK: PORTAL OTP] ${phone.slice(0, 6)}***** code=${code}`);
    return 'DEV';
  }

  async verifyCode(rawPhone: unknown, rawCode: unknown): Promise<string> {
    const phone = normalizeUzPhone(rawPhone);
    const code = typeof rawCode === 'string' ? rawCode.replace(/\D/g, '') : '';
    if (!phone || code.length !== 6) throw new BadRequestException("Kod noto'g'ri");

    const otp = await this.prisma.portalOtp.findFirst({
      where: { phone, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp || otp.attempts >= MAX_ATTEMPTS) throw new UnauthorizedException("Kod eskirgan. Yangi kod so'rang");

    const expected = Buffer.from(otp.codeHash);
    const given = Buffer.from(this.hashCode(phone, code));
    const ok = otp.channel !== 'NONE' && expected.length === given.length && crypto.timingSafeEqual(expected, given);
    if (!ok) {
      await this.prisma.portalOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      const left = MAX_ATTEMPTS - otp.attempts - 1;
      throw new UnauthorizedException(left > 0 ? `Kod noto'g'ri. Yana ${left} ta urinish qoldi` : "Kod bloklandi. Yangi kod so'rang");
    }

    // Single use, even under concurrent verification requests
    const consumed = await this.prisma.portalOtp.updateMany({ where: { id: otp.id, consumedAt: null }, data: { consumedAt: new Date() } });
    if (consumed.count !== 1) throw new UnauthorizedException("Kod allaqachon ishlatilgan");

    return this.jwt.sign({ phone } satisfies PortalSession, {
      secret: this.secret,
      audience: AUDIENCE,
      expiresIn: `${PORTAL_SESSION_DAYS}d`,
    });
  }

  verifySession(token: string | undefined): PortalSession | null {
    if (!token) return null;
    try {
      const payload = this.jwt.verify<PortalSession & { aud: string }>(token, { secret: this.secret, audience: AUDIENCE });
      return normalizeUzPhone(payload.phone) ? { phone: payload.phone } : null;
    } catch {
      return null;
    }
  }
}
