import { isPlaceholderSecret, requireSecret, validateAllSecrets } from './jwt-secret';

const strong = (tag: string) => `${tag}_0123456789abcdef0123456789abcdef`;

function cfg(values: Record<string, string | undefined>) {
  return { get: <T = string>(key: string) => values[key] as unknown as T };
}

describe('secrets fail closed', () => {
  const originalEnv = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  const good = {
    JWT_SECRET: strong('access'),
    JWT_REFRESH_SECRET: strong('refresh'),
    SERVICE_TOKEN: strong('service'),
  };

  it.each(['change_me', 'CHANGE_ME_openssl_rand_hex_32', 'generate_strong_jwt_secret', 'generate-a-secure-string', 'replace_with_secret', 'your_secret_here'])(
    'treats %s as a placeholder',
    (v) => expect(isPlaceholderSecret(v)).toBe(true),
  );

  it('accepts real values in production', () => {
    process.env.NODE_ENV = 'production';
    expect(() => validateAllSecrets(cfg(good))).not.toThrow();
  });

  it.each([undefined, 'production', 'development', 'staging'])('refuses weak secrets when NODE_ENV=%s', (env) => {
    if (env === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = env;
    for (const key of ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'SERVICE_TOKEN'] as const) {
      expect(() => validateAllSecrets(cfg({ ...good, [key]: undefined }))).toThrow(key);
      expect(() => validateAllSecrets(cfg({ ...good, [key]: 'short' }))).toThrow(key);
      expect(() => validateAllSecrets(cfg({ ...good, [key]: 'CHANGE_ME_openssl_rand_hex_32_padding_xx' }))).toThrow(key);
    }
  });

  it('refuses equal access and refresh secrets', () => {
    process.env.NODE_ENV = 'production';
    expect(() => validateAllSecrets(cfg({ ...good, JWT_REFRESH_SECRET: good.JWT_SECRET }))).toThrow(/differ/);
  });

  it('refuses template payment secrets but allows empty ones', () => {
    process.env.NODE_ENV = 'production';
    expect(() => validateAllSecrets(cfg({ ...good, PAYME_KEY: '' }))).not.toThrow();
    expect(() => validateAllSecrets(cfg({ ...good, PAYME_KEY: 'your_payme_key' }))).toThrow('PAYME_KEY');
    expect(() => validateAllSecrets(cfg({ ...good, CLICK_SECRET_KEY: 'CHANGE_ME' }))).toThrow('CLICK_SECRET_KEY');
  });

  it('lets only the test runner use short secrets, never a missing one', () => {
    process.env.NODE_ENV = 'test';
    expect(requireSecret(cfg({ JWT_SECRET: 'short' }))).toBe('short');
    expect(() => requireSecret(cfg({}), 'SERVICE_TOKEN')).toThrow('SERVICE_TOKEN');
  });
});
