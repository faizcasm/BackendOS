import type { Request, Response, NextFunction } from 'express';
import type { LoggingService } from './logging.service';

/** Endpoints that would otherwise flood the logs on every scrape/tick. */
const NOISY_PATHS = new Set(['/metrics', '/api/health/live', '/api/health/ready']);

/**
 * Structured access log: one line per completed request with correlation id,
 * method, path, status, duration and authenticated user (if any).
 */
export const createLoggingMiddleware = (loggingService: LoggingService) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const start = process.hrtime.bigint();
    const path = req.originalUrl || req.url;

    res.on('finish', () => {
      if (NOISY_PATHS.has(req.path) && res.statusCode < 400) return;

      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      const metadata = {
        requestId: req.requestId,
        method: req.method,
        path,
        status: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        userId: req.user?.userId,
      };

      if (res.statusCode >= 500) loggingService.error('request', metadata);
      else if (res.statusCode >= 400) loggingService.warn('request', metadata);
      else loggingService.info('request', metadata);
    });

    next();
  };
};
