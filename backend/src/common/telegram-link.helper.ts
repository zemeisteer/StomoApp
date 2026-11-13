import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Stateless, single-use Telegram deep-link tokens for staff self-service linking.
 *
 * Format (fits Telegram's 64-char /start payload, charset [A-Za-z0-9_-]):
 *   link_<staffId>_<expiresAtBase36>_<hmacHex20>
 *
 * The HMAC also covers the staff member's current tokenVersion and Telegram ID,
 * so a token stops working once it has been used (the Telegram ID changes),
 * after logout-everywhere / role change / deactivation (tokenVersion bumps),
 * and after LINK_TTL_MS.
 */
export const TELEGRAM_LINK_PREFIX = 'link_';
export const TELEGRAM_LINK_TTL_MS = 10 * 60 * 1000;

export interface LinkState {
  staffId: string;
  tokenVersion: number;
  telegramUserId: string | null;
}

function sign(secret: string, state: LinkState, expiresAt: number): string {
  return createHmac('sha256', secret)
    .update(`tg-link:${state.staffId}:${expiresAt}:${state.tokenVersion}:${state.telegramUserId ?? ''}`)
    .digest('hex')
    .slice(0, 20);
}

export function createTelegramLinkToken(secret: string, state: LinkState, now = Date.now()) {
  const expiresAt = now + TELEGRAM_LINK_TTL_MS;
  const token = `${TELEGRAM_LINK_PREFIX}${state.staffId}_${expiresAt.toString(36)}_${sign(secret, state, expiresAt)}`;
  return { token, expiresAt: new Date(expiresAt) };
}

/** Extracts the staff id without verifying; use verifyTelegramLinkToken afterwards. */
export function parseTelegramLinkToken(token: string): { staffId: string; expiresAt: number; sig: string } | null {
  if (!token || !token.startsWith(TELEGRAM_LINK_PREFIX)) return null;
  const parts = token.slice(TELEGRAM_LINK_PREFIX.length).split('_');
  if (parts.length !== 3) return null;
  const [staffId, exp36, sig] = parts;
  const expiresAt = parseInt(exp36, 36);
  if (!/^[a-z0-9]{8,40}$/.test(staffId) || !Number.isFinite(expiresAt) || !/^[0-9a-f]{20}$/.test(sig)) {
    return null;
  }
  return { staffId, expiresAt, sig };
}

export function verifyTelegramLinkToken(secret: string, token: string, state: LinkState, now = Date.now()): boolean {
  const parsed = parseTelegramLinkToken(token);
  if (!parsed || parsed.staffId !== state.staffId || parsed.expiresAt < now) return false;
  const expected = Buffer.from(sign(secret, state, parsed.expiresAt));
  const actual = Buffer.from(parsed.sig);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
