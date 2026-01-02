import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  jwt: {
    secret: process.env.JWT_SECRET || 'default-secret-change-in-production',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'default-refresh-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  },

  upload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'),
    uploadDir: process.env.UPLOAD_DIR || './uploads',
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
  },
};
