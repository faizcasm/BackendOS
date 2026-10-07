/**
 * Configuration validation tests.
 *
 * The config module validates `process.env` at import time, so each case is
 * loaded in an isolated module registry with a controlled environment.
 */
type ConfigModule = typeof import('../src/core/config');

const BASE_ENV: Record<string, string | undefined> = {
  NODE_ENV: 'production',
  PORT: '4000',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/app',
  JWT_SECRET: 'a-strong-secret-with-enough-length',
  JWT_REFRESH_SECRET: 'another-strong-secret-here',
  CORS_ORIGINS: 'https://app.example.com, https://admin.example.com',
  MAX_FILE_SIZE: '2048',
  MODULE_JOBS: 'false',
};

const originalEnv = { ...process.env };

const applyEnv = (overrides: Record<string, string | undefined>): void => {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, originalEnv, BASE_ENV);

  // `process.env.X = undefined` would store the string "undefined", so
  // removals have to be explicit.
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
};

const loadConfig = (
  overrides: Record<string, string | undefined>
): {
  config?: ConfigModule['config'];
  error?: Error;
} => {
  let config: ConfigModule['config'] | undefined;
  let error: Error | undefined;

  jest.isolateModules(() => {
    applyEnv(overrides);

    try {
      config = (require('../src/core/config') as ConfigModule).config;
    } catch (caught) {
      error = caught as Error;
    }
  });

  return { config, error };
};

afterEach(() => {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, originalEnv);
});

describe('core/config', () => {
  it('loads a valid production configuration', () => {
    const { config, error } = loadConfig({});

    expect(error).toBeUndefined();
    expect(config?.port).toBe(4000);
    expect(config?.isProd).toBe(true);
    expect(config?.corsOrigins).toEqual(['https://app.example.com', 'https://admin.example.com']);
    expect(config?.modules.jobs).toBe(false);
    expect(typeof config?.rateLimit.maxRequests).toBe('number');
  });

  it('refuses to boot in production without a database url', () => {
    const { error } = loadConfig({ DATABASE_URL: undefined });

    expect(error?.message).toMatch(/DATABASE_URL/);
  });

  it('refuses placeholder JWT secrets in production', () => {
    const { error } = loadConfig({
      JWT_SECRET: 'default-secret-change-in-production',
    });

    expect(error?.message).toMatch(/JWT_SECRET/);
  });

  it('requires distinct access and refresh secrets', () => {
    const { error } = loadConfig({
      JWT_REFRESH_SECRET: 'a-strong-secret-with-enough-length',
    });

    expect(error?.message).toMatch(/must be different/);
  });

  it('rejects malformed numeric values', () => {
    const { error } = loadConfig({ PORT: 'not-a-port' });

    expect(error?.message).toMatch(/PORT/);
  });

  it('allows development to boot without secrets', () => {
    const { config, error } = loadConfig({
      NODE_ENV: 'development',
      DATABASE_URL: undefined,
      JWT_SECRET: undefined,
      JWT_REFRESH_SECRET: undefined,
    });

    expect(error).toBeUndefined();
    expect(config?.isDev).toBe(true);
    expect(config?.db.url).toBe('');
  });

  it('parses list based settings such as allowed file types', () => {
    const { config } = loadConfig({
      ALLOWED_FILE_TYPES: 'image/png, image/pdf ,',
    });

    expect(config?.upload.allowedTypes).toEqual(['image/png', 'image/pdf']);
  });
});
