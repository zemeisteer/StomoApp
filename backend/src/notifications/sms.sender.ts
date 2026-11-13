import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * SMS delivery behind one interface.
 *
 * Eskiz (used when ESKIZ_EMAIL and ESKIZ_PASSWORD are set, unless SMS_PROVIDER=generic): Eskiz notify API. Logs in with
 *   ESKIZ_EMAIL / ESKIZ_PASSWORD, caches the bearer token and logs in again once on 401.
 *   Sender name: ESKIZ_FROM (Eskiz default "4546"). Base URL: SMS_API_URL or https://notify.eskiz.uz/api.
 *   Eskiz only delivers texts that match templates approved in the Eskiz cabinet.
 * Otherwise (generic): POST {recipient, message, idempotencyKey} as JSON to SMS_API_URL with
 *   "Authorization: Bearer SMS_API_KEY" (for a self-hosted or other gateway).
 */

/**
 * Provider error bodies may echo the recipient number or the message (one-time codes). These
 * errors end up in logs and the outbox, so every run of 5+ digits is masked before they leave here.
 */
export function redactProviderText(text: string): string {
  return text.replace(/\+?\d[\d\s-]{3,}\d/g, (m) => (m.replace(/\D/g, '').length >= 5 ? '***' : m)).slice(0, 200);
}

@Injectable()
export class SmsSender {
  private readonly logger = new Logger(SmsSender.name);
  private eskizToken: string | null = null;

  constructor(private readonly config: ConfigService) {}

  private get(key: string) {
    return (this.config.get<string>(key) || '').trim();
  }

  /** Eskiz only when its login is configured, so existing SMS_API_URL/SMS_API_KEY setups keep working. */
  get provider(): 'eskiz' | 'generic' {
    if (this.get('SMS_PROVIDER').toLowerCase() === 'generic') return 'generic';
    return this.get('ESKIZ_EMAIL') && this.get('ESKIZ_PASSWORD') ? 'eskiz' : 'generic';
  }

  private get eskizBase() {
    const url = this.get('SMS_API_URL');
    return (url && url.includes('eskiz') ? url : 'https://notify.eskiz.uz/api').replace(/\/+$/, '');
  }

  isConfigured(): boolean {
    if (this.provider === 'eskiz') return Boolean(this.get('ESKIZ_EMAIL') && this.get('ESKIZ_PASSWORD'));
    const key = this.get('SMS_API_KEY');
    return Boolean(key && !key.startsWith('your_') && this.get('SMS_API_URL'));
  }

  describe() {
    return this.provider === 'eskiz' ? 'Eskiz' : 'SMS Gateway';
  }

  /** Throws when the provider rejects the message, so the outbox can retry. */
  async send(phone: string, message: string, idempotencyKey?: string): Promise<void> {
    if (this.provider === 'eskiz') return this.sendEskiz(phone, message);

    const res = await fetch(this.get('SMS_API_URL'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.get('SMS_API_KEY')}`,
        ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}),
      },
      body: JSON.stringify({ recipient: phone, message, ...(idempotencyKey ? { idempotencyKey } : {}) }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`SMS provider error ${res.status}: ${redactProviderText(await res.text())}`);
  }

  private async eskizLogin(): Promise<string> {
    const body = new URLSearchParams({ email: this.get('ESKIZ_EMAIL'), password: this.get('ESKIZ_PASSWORD') });
    const res = await fetch(`${this.eskizBase}/auth/login`, { method: 'POST', body, signal: AbortSignal.timeout(8000) });
    const json: any = await res.json().catch(() => null);
    const token = json?.data?.token;
    if (!res.ok || typeof token !== 'string') throw new Error(`Eskiz login failed (${res.status})`);
    this.eskizToken = token;
    return token;
  }

  private async sendEskiz(phone: string, message: string, retried = false): Promise<void> {
    const token = this.eskizToken || (await this.eskizLogin());
    const body = new URLSearchParams({
      mobile_phone: phone.replace(/\D/g, ''),
      message,
      from: this.get('ESKIZ_FROM') || '4546',
    });
    const res = await fetch(`${this.eskizBase}/message/sms/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body,
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 401 && !retried) {
      // Tokens expire after ~30 days: log in again once
      this.eskizToken = null;
      return this.sendEskiz(phone, message, true);
    }
    if (!res.ok) {
      const text = redactProviderText(await res.text());
      this.logger.warn(`Eskiz rejected SMS (${res.status})`);
      throw new Error(`Eskiz error ${res.status}: ${text}`);
    }
  }
}
