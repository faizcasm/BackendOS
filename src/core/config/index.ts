import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000'),
  nodeEnv: process.env.NODE_ENV || 'development',

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'backendos',
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'default-secret-change-in-production',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'default-refresh-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  },

  s3: {
    endpoint: process.env.S3_ENDPOINT || 'https://s3.amazonaws.com',
    accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
    bucket: process.env.S3_BUCKET || 'backendos-files',
    region: process.env.S3_REGION || 'us-east-1',
  },

  ai: {
    openaiKey: process.env.OPENAI_API_KEY,
    anthropicKey: process.env.ANTHROPIC_API_KEY,
  },

  log: {
    level: process.env.LOG_LEVEL || 'info',
  },

  modules: {
    auth: process.env.MODULE_AUTH !== 'false',
    rateLimiting: process.env.MODULE_RATE_LIMITING !== 'false',
    caching: process.env.MODULE_CACHING !== 'false',
    jobs: process.env.MODULE_JOBS !== 'false',
    fileUpload: process.env.MODULE_FILE_UPLOAD !== 'false',
    logging: process.env.MODULE_LOGGING !== 'false',
    monitoring: process.env.MODULE_MONITORING !== 'false',
    aiHelpers: process.env.MODULE_AI_HELPERS !== 'false',
    audit: process.env.MODULE_AUDIT !== 'false',
  },
};
