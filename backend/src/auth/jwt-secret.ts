/** Minimum length of a signing secret outside the test runner. */
export const MIN_SECRET_LENGTH = 32;

type ConfigLike = { get<T = string>(key: string): T | undefined };

/** Template values from the .env example files: never accepted as a real secret. */
export function isPlaceholderSecret(value: string): boolean {
  return /change[_-]?me|^generate_|^replace_with|^your_/i.test(value.trim());
}

/**
 * Reads a signing secret. There is no default anywhere in the code: a missing secret, a placeholder
 * or one shorter than 32 characters stops the app at start-up (only the test runner may use a short one).
 */
export function requireSecret(config: ConfigLike, key: 'JWT_SECRET' | 'JWT_REFRESH_SECRET' = 'JWT_SECRET'): string {
  const value = String(config.get<string>(key) ?? '').trim();
  const isTest = process.env.NODE_ENV === 'test';
  if (!value) throw new Error(`${key} sozlanmagan (is not configured)`);
  if (!isTest && (value.length < MIN_SECRET_LENGTH || isPlaceholderSecret(value))) {
    throw new Error(`${key} kamida ${MIN_SECRET_LENGTH} belgidan iborat haqiqiy qiymat bo'lishi shart (must be a real value of at least ${MIN_SECRET_LENGTH} characters)`);
  }
  return value;
}
