import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_LIMITS = { ipEmail: 5, ip: 20, email: 10 } as const;

type Bucket = { count: number; resetAt: number };

/**
 * Staff login limits in three layers, each per 15 minutes:
 *  - IP + email: 5 attempts (one person guessing one account)
 *  - IP: 20 attempts (one machine trying many accounts); a successful login does NOT reset it
 *  - email: 10 attempts (many machines guessing one account)
 *
 * Every attempt is counted before the password is checked, so parallel requests cannot slip past
 * a limit. A successful login clears the IP+email and email layers only.
 *
 * The counters live in this process. On several instances (serverless, more than one container)
 * each one keeps its own counters, so production needs shared storage (Redis) for strict limits.
 */
@Injectable()
export class LoginRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  private keys(ip: string, email: string) {
    const e = email.trim().toLowerCase();
    return { ipEmail: `ip-email:${ip}|${e}`, ip: `ip:${ip}`, email: `email:${e}` };
  }

  private hit(key: string, now: number): number {
    const b = this.buckets.get(key);
    if (!b || b.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
      return 1;
    }
    b.count += 1;
    return b.count;
  }

  private sweep(now: number) {
    if (this.buckets.size < 10_000) return;
    for (const [k, b] of this.buckets) if (b.resetAt <= now) this.buckets.delete(k);
  }

  /** Counts one attempt in every layer; throws 429 when any layer is over its limit. */
  consume(ip: string | undefined, email: string): void {
    const now = Date.now();
    this.sweep(now);
    const k = this.keys(ip || 'unknown', email);
    // Count every layer first (no short-circuit), then decide
    const ipHits = this.hit(k.ip, now);
    const ipEmailHits = this.hit(k.ipEmail, now);
    const emailHits = this.hit(k.email, now);
    if (ipHits > LOGIN_LIMITS.ip || ipEmailHits > LOGIN_LIMITS.ipEmail || emailHits > LOGIN_LIMITS.email) {
      throw new HttpException(
        "Juda ko'p urinish. 15 daqiqadan keyin qayta urinib ko'ring",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /** After a successful login: the account layers start over, the IP layer does not. */
  succeeded(ip: string | undefined, email: string): void {
    const k = this.keys(ip || 'unknown', email);
    this.buckets.delete(k.ipEmail);
    this.buckets.delete(k.email);
  }

  /** Test helper. */
  reset(): void {
    this.buckets.clear();
  }
}
