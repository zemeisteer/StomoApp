import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * Explicit origin list, never `*`: credentials (cookies) are sent cross-origin, so a wildcard or a
 * reflected origin would let any site act as the signed-in user. Foreign origins get no CORS headers.
 */
export function allowedOrigins(frontendUrl: string | undefined, extra: string | undefined, devOrigins: boolean): string[] {
  const list = [frontendUrl || 'http://localhost:3000', ...(extra || '').split(',')]
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  if (devOrigins) list.push('http://localhost:3000', 'http://127.0.0.1:3000');
  for (const o of list) {
    if (o === '*' || !/^https?:\/\/[^/*\s]+$/.test(o)) {
      throw new Error(`CORS origin "${o}" is not an explicit http(s) origin`);
    }
  }
  return [...new Set(list)];
}

export function buildCorsOptions(origins: string[]): CorsOptions {
  const allowed = new Set(origins);
  return {
    origin: (origin, callback) => callback(null, !origin || allowed.has(origin)),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Idempotency-Key', 'X-Requested-With', 'X-CSRF-Token'],
  };
}
