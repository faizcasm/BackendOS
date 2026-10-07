import winston from 'winston';
import { config } from '../config';

const { combine, timestamp, errors, splat, colorize, printf, metadata } = winston.format;

const consoleFormat = () =>
  combine(
    colorize(),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    splat(),
    printf(({ timestamp: ts, level, message, requestId, ...rest }) => {
      const meta = { ...rest };
      delete meta.service;
      delete meta.environment;
      delete meta.level;
      delete meta.message;
      delete meta.timestamp;
      const id = requestId ? ` [${requestId}]` : '';
      const extra = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
      return `${ts} ${level}${id}: ${message}${extra}`;
    })
  );

const jsonFormat = () =>
  combine(
    timestamp(),
    errors({ stack: true }),
    splat(),
    metadata({ fillExcept: ['message', 'level', 'timestamp', 'label'] })
  );

const transports: winston.transport[] = [
  new winston.transports.Console({
    silent: config.isTest && process.env.LOG_SILENT !== 'false',
    format: config.isProd ? jsonFormat() : consoleFormat(),
  }),
];

if (config.log.fileEnabled) {
  transports.push(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 10,
      tailable: true,
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 10,
      tailable: true,
    })
  );
}

/**
 * The single Winston instance shared by the whole application.
 * Modules should call `logger.child(...)` to attach request context.
 */
export const logger = winston.createLogger({
  level: config.log.level,
  defaultMeta: { service: 'backendos', environment: config.nodeEnv },
  transports,
  exitOnError: false,
});

export type Logger = winston.Logger;

/** Request-scoped logger that stamps every line with a correlation id. */
export const createRequestLogger = (requestId: string): Logger => logger.child({ requestId });

export const logRequest = (
  req: {
    method?: string;
    originalUrl?: string;
    url?: string;
    ip?: string;
    get?: (h: string) => string | undefined;
    user?: { userId?: string };
  },
  res: { statusCode: number },
  durationMs: number,
  requestId?: string
): void => {
  logger.info('http request', {
    requestId,
    method: req.method,
    url: req.originalUrl || req.url,
    status: res.statusCode,
    durationMs: Math.round(durationMs),
    ip: req.ip,
    userAgent: req.get?.('user-agent'),
    userId: req.user?.userId,
  });
};

export const logError = (
  error: Error & { code?: string; statusCode?: number },
  req?: { originalUrl?: string; url?: string; method?: string; ip?: string },
  requestId?: string
): void => {
  logger.error('unhandled error', {
    requestId,
    message: error.message,
    code: error.code,
    statusCode: error.statusCode,
    stack: error.stack,
    url: req?.originalUrl || req?.url,
    method: req?.method,
    ip: req?.ip,
  });
};
