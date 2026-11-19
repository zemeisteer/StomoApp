import { isTestRunner } from '../common/runtime-env';

/** Minimum length of a signing secret outside the test runner. */
export const MIN_SECRET_LENGTH = 32;

type ConfigLike = { get<T = string>(key: string): T | undefined };

/** Secrets the app cannot run without. */
export type RequiredSecretKey = 'JWT_SECRET' | 'JWT_REFRESH_SECRET' | 'SERVICE_TOKEN';

/**
 * Payment provider secrets. They are optional (a provider stays disabled while its keys are empty),
 * but a template value is refused. Their length is set by the provider, so no minimum is enforced.
 */
export const OPTIONAL_PROVIDER_SECRETS = ['PAYME_KEY', 'CLICK_SECRET_KEY'] as const;

/** Template values from the .env example files: never accepted as a real secret. */
export function isPlaceholderSecret(value: string): boolean {
  return /change[_-]?me|^generate[_-]|^replace[_-]?with|^your[_-]/i.test(value.trim());
}


/**
 * Reads a signing secret. There is no default anywhere in the code: a missing secret, a placeholder
 * or one shorter than 32 characters stops the app at start-up (only the test runner may use a short one).
 */
export function requireSecret(config: ConfigLike, key: RequiredSecretKey = 'JWT_SECRET'): string {
  const raw = config.get<string>(key) ?? (key === 'SERVICE_TOKEN' ? config.get<string>('BOT_SERVICE_TOKEN') : undefined);
  const value = String(raw ?? '').trim();
  if (!value) throw new Error(`${key} sozlanmagan (is not configured)`);
  if (!isTestRunner() && (value.length < MIN_SECRET_LENGTH || isPlaceholderSecret(value))) {
    throw new Error(`${key} kamida ${MIN_SECRET_LENGTH} belgidan iborat haqiqiy qiymat bo'lishi shart (must be a real value of at least ${MIN_SECRET_LENGTH} characters)`);
  }
  return value;
}

/**
 * Start-up check for every secret. Throws (the app refuses to start) when a required secret is
 * missing, short or a placeholder, when both JWT secrets are equal, or when a payment secret
 * still holds a template value.
 */
export function validateAllSecrets(config: ConfigLike): void {
  const access = requireSecret(config, 'JWT_SECRET');
  const refresh = requireSecret(config, 'JWT_REFRESH_SECRET');
  requireSecret(config, 'SERVICE_TOKEN');
  if (!isTestRunner() && access === refresh) {
    throw new Error('JWT_SECRET va JWT_REFRESH_SECRET har xil bo\'lishi shart (must differ)');
  }
  for (const key of OPTIONAL_PROVIDER_SECRETS) {
    const value = String(config.get<string>(key) ?? '').trim();
    if (value && isPlaceholderSecret(value)) {
      throw new Error(`${key} hali shablon qiymatida (still holds a template placeholder)`);
    }
  }
}
