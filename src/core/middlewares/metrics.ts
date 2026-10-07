import type { Request, Response, NextFunction } from 'express';
import { register, collectDefaultMetrics, Counter, Histogram, type Registry } from 'prom-client';
import { config } from '../config';
import { logger } from '../logger';
import { UnauthorizedError } from '../errors';

// Process/runtime metrics (event loop lag, GC, heap, handles, ...)
collectDefaultMetrics({ prefix: 'backendos_', register });

export const httpRequestDuration = new Histogram({
  name: 'backendos_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [register],
});

export const httpRequestTotal = new Counter({
  name: 'backendos_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const httpRequestErrors = new Counter({
  name: 'backendos_http_request_errors_total',
  help: 'Total number of HTTP requests that returned 4xx/5xx',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const authAttempts = new Counter({
  name: 'backendos_auth_attempts_total',
  help: 'Total number of authentication attempts',
  labelNames: ['type', 'success'],
  registers: [register],
});

export const fileUploads = new Counter({
  name: 'backendos_file_uploads_total',
  help: 'Total number of file uploads',
  labelNames: ['success'],
  registers: [register],
});

export const jobsProcessed = new Counter({
  name: 'backendos_jobs_processed_total',
  help: 'Total number of background jobs processed',
  labelNames: ['queue', 'status'],
  registers: [register],
});

/** Low-cardinality route label: matched pattern, never raw paths. */
const routeLabel = (req: Request): string => {
  if (req.route?.path) {
    return `${req.baseUrl}${req.route.path === '/' ? '' : req.route.path}` || '/';
  }
  return 'unmatched';
};

/** Records latency/throughput for every request. */
export const metricsMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
    const labels = {
      method: req.method,
      route: routeLabel(req),
      status_code: String(res.statusCode),
    };

    httpRequestDuration.observe(labels, durationSeconds);
    httpRequestTotal.inc(labels);
    if (res.statusCode >= 400) {
      httpRequestErrors.inc(labels);
    }
  });

  next();
};

/**
 * Guards the Prometheus endpoint when `METRICS_TOKEN` is set.
 * Accepts `Authorization: Bearer <token>` or `?token=<token>` for scrapers
 * that cannot set headers.
 */
export const metricsAuthGuard = (req: Request, _res: Response, next: NextFunction): void => {
  if (!config.metrics.token) {
    next();
    return;
  }

  const header = req.headers.authorization;
  const bearer = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  const token = bearer ?? (req.query.token as string | undefined);

  if (token !== config.metrics.token) {
    next(new UnauthorizedError('Invalid metrics token'));
    return;
  }
  next();
};

/** Prometheus text exposition endpoint. */
export const metricsHandler = async (_req: Request, res: Response): Promise<void> => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    logger.error('failed to render metrics', { message: (error as Error).message });
    res.status(500).end();
  }
};

export { register, type Registry };
