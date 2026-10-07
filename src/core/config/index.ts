import dotenv from 'dotenv';
import Joi from 'joi';

// Quiet load: only report when a .env file is actually present.
dotenv.config({ quiet: true });

/**
 * Placeholder secrets that must never reach production.
 * They are accepted in development/test so the app boots out of the box.
 */
const PLACEHOLDER_SECRETS = new Set([
  'default-secret-change-in-production',
  'default-refresh-secret',
  'change-me-in-production',
  'your-super-secret-jwt-key-change-this-in-production',
  'your-super-secret-refresh-key-change-this-in-production',
]);

const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),

  // HTTP server
  PORT: Joi.number().port().default(3000),
  HOST: Joi.string().default('0.0.0.0'),
  BODY_LIMIT: Joi.string().default('1mb'),
  /** express `trust proxy` setting: true/false, a number of hops, or a subnet list */
  TRUST_PROXY: Joi.alternatives()
    .try(Joi.boolean(), Joi.number().integer().min(0), Joi.string())
    .default(false),
  /** Comma separated list of allowed CORS origins. `*` disables the allow-list. */
  CORS_ORIGINS: Joi.string().default('*'),
  /** Graceful shutdown grace period in milliseconds */
  SHUTDOWN_TIMEOUT_MS: Joi.number().integer().min(0).default(10_000),

  // Database
  DATABASE_URL: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),

  // Redis
  REDIS_URL: Joi.string().optional().allow(''),
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),
  REDIS_DB: Joi.number().integer().min(0).default(0),
  /** Fail startup when Redis cannot be reached (recommended in production) */
  REDIS_REQUIRED: Joi.boolean().truthy('true').falsy('false').default(false),

  // Auth
  JWT_SECRET: Joi.string().min(16).default('default-secret-change-in-production'),
  JWT_REFRESH_SECRET: Joi.string().min(16).default('default-refresh-secret'),
  JWT_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
  BCRYPT_ROUNDS: Joi.number().integer().min(4).max(31).default(12),
  /** Minimum length accepted by the registration endpoint */
  PASSWORD_MIN_LENGTH: Joi.number().integer().min(6).max(128).default(8),

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: Joi.number().integer().min(1000).default(900_000),
  RATE_LIMIT_MAX_REQUESTS: Joi.number().integer().min(1).default(100),
  RATE_LIMIT_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true),

  // File uploads
  MAX_FILE_SIZE: Joi.number().integer().min(1).default(10_485_760),
  UPLOAD_DIR: Joi.string().default('./uploads'),
  ALLOWED_FILE_TYPES: Joi.string().default(
    'image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain,application/json'
  ),
  STORAGE_DRIVER: Joi.string().valid('local', 's3').default('local'),

  // S3 compatible storage
  S3_ENDPOINT: Joi.string().default('https://s3.amazonaws.com'),
  S3_ACCESS_KEY_ID: Joi.string().allow('').default(''),
  S3_SECRET_ACCESS_KEY: Joi.string().allow('').default(''),
  S3_BUCKET: Joi.string().default('backendos-files'),
  S3_REGION: Joi.string().default('us-east-1'),

  // AI providers (optional)
  OPENAI_API_KEY: Joi.string().allow('').optional(),
  ANTHROPIC_API_KEY: Joi.string().allow('').optional(),
  AI_TIMEOUT_MS: Joi.number().integer().min(1000).default(30_000),

  // Logging & observability
  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly')
    .default('info'),
  LOG_FILE_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
  METRICS_PATH: Joi.string().default('/metrics'),
  METRICS_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true),
  /** Optional bearer token protecting the metrics endpoint */
  METRICS_TOKEN: Joi.string().allow('').optional(),
  DOCS_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true),
  DOCS_PATH: Joi.string().default('/api/docs'),

  // Module toggles
  MODULE_AUTH: Joi.boolean().truthy('true').falsy('false').default(true),
  MODULE_RATE_LIMITING: Joi.boolean().truthy('true').falsy('false').default(true),
  MODULE_CACHING: Joi.boolean().truthy('true').falsy('false').default(true),
  MODULE_JOBS: Joi.boolean().truthy('true').falsy('false').default(true),
  MODULE_FILE_UPLOAD: Joi.boolean().truthy('true').falsy('false').default(true),
  MODULE_LOGGING: Joi.boolean().truthy('true').falsy('false').default(true),
  MODULE_MONITORING: Joi.boolean().truthy('true').falsy('false').default(true),
  MODULE_AI_HELPERS: Joi.boolean().truthy('true').falsy('false').default(true),
  MODULE_AUDIT: Joi.boolean().truthy('true').falsy('false').default(true),
  MODULE_DOCS: Joi.boolean().truthy('true').falsy('false').default(true),
}).unknown();

/**
 * Empty values (e.g. `JWT_SECRET=` copied from .env.example) are treated as
 * unset so that Joi defaults and production checks behave predictably.
 */
const sanitisedEnv = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => value !== undefined && value !== '')
);

const { value: env, error } = envSchema.validate(sanitisedEnv, {
  abortEarly: false,
  convert: true,
});

if (error) {
  const details = error.details.map((d) => `  - ${d.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${details}`);
}

const nodeEnv = env.NODE_ENV as 'development' | 'production' | 'test';
const isProd = nodeEnv === 'production';
const isTest = nodeEnv === 'test';

/**
 * Fail fast on unsafe defaults. A production backend that boots with a
 * well-known JWT secret is worse than one that refuses to start.
 */
const productionViolations: string[] = [];
if (isProd) {
  if (!env.JWT_SECRET || PLACEHOLDER_SECRETS.has(env.JWT_SECRET)) {
    productionViolations.push('JWT_SECRET is missing or still a placeholder value');
  }
  if (!env.JWT_REFRESH_SECRET || PLACEHOLDER_SECRETS.has(env.JWT_REFRESH_SECRET)) {
    productionViolations.push('JWT_REFRESH_SECRET is missing or still a placeholder value');
  }
  if (env.JWT_SECRET && env.JWT_SECRET === env.JWT_REFRESH_SECRET) {
    productionViolations.push('JWT_SECRET and JWT_REFRESH_SECRET must be different');
  }
}
if (productionViolations.length > 0) {
  throw new Error(
    `Unsafe production configuration:\n${productionViolations.map((v) => `  - ${v}`).join('\n')}`
  );
}

const parseList = (raw: string): string[] =>
  raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

export const config = {
  nodeEnv,
  isProd,
  isDev: nodeEnv === 'development',
  isTest,

  port: env.PORT as number,
  host: env.HOST as string,
  bodyLimit: env.BODY_LIMIT as string,
  trustProxy: env.TRUST_PROXY as boolean | number | string,
  corsOrigins: parseList(env.CORS_ORIGINS),
  shutdownTimeoutMs: env.SHUTDOWN_TIMEOUT_MS as number,

  db: {
    url: (env.DATABASE_URL as string | undefined) ?? '',
  },

  redis: {
    url: (env.REDIS_URL as string | undefined) || undefined,
    host: env.REDIS_HOST as string,
    port: env.REDIS_PORT as number,
    password: (env.REDIS_PASSWORD as string) || undefined,
    db: env.REDIS_DB as number,
    required: env.REDIS_REQUIRED as boolean,
  },

  jwt: {
    secret: env.JWT_SECRET as string,
    refreshSecret: env.JWT_REFRESH_SECRET as string,
    expiresIn: env.JWT_EXPIRES_IN as string,
    refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN as string,
  },

  security: {
    bcryptRounds: env.BCRYPT_ROUNDS as number,
    passwordMinLength: env.PASSWORD_MIN_LENGTH as number,
  },

  rateLimit: {
    enabled: env.RATE_LIMIT_ENABLED as boolean,
    windowMs: env.RATE_LIMIT_WINDOW_MS as number,
    maxRequests: env.RATE_LIMIT_MAX_REQUESTS as number,
  },

  upload: {
    maxFileSize: env.MAX_FILE_SIZE as number,
    uploadDir: env.UPLOAD_DIR as string,
    allowedTypes: parseList(env.ALLOWED_FILE_TYPES),
    storageDriver: env.STORAGE_DRIVER as 'local' | 's3',
  },

  s3: {
    endpoint: env.S3_ENDPOINT as string,
    accessKeyId: env.S3_ACCESS_KEY_ID as string,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY as string,
    bucket: env.S3_BUCKET as string,
    region: env.S3_REGION as string,
  },

  ai: {
    openaiKey: (env.OPENAI_API_KEY as string) || undefined,
    anthropicKey: (env.ANTHROPIC_API_KEY as string) || undefined,
    timeoutMs: env.AI_TIMEOUT_MS as number,
  },

  log: {
    level: env.LOG_LEVEL as string,
    fileEnabled: env.LOG_FILE_ENABLED as boolean,
  },

  metrics: {
    enabled: env.METRICS_ENABLED as boolean,
    path: env.METRICS_PATH as string,
    token: (env.METRICS_TOKEN as string) || undefined,
  },

  docs: {
    enabled: env.DOCS_ENABLED as boolean,
    path: env.DOCS_PATH as string,
  },

  modules: {
    auth: env.MODULE_AUTH as boolean,
    rateLimiting: env.MODULE_RATE_LIMITING as boolean,
    caching: env.MODULE_CACHING as boolean,
    jobs: env.MODULE_JOBS as boolean,
    fileUpload: env.MODULE_FILE_UPLOAD as boolean,
    logging: env.MODULE_LOGGING as boolean,
    monitoring: env.MODULE_MONITORING as boolean,
    aiHelpers: env.MODULE_AI_HELPERS as boolean,
    audit: env.MODULE_AUDIT as boolean,
    docs: env.MODULE_DOCS as boolean,
  },
};

export type AppConfig = typeof config;
