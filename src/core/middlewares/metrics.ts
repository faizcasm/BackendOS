import { Request, Response, NextFunction } from 'express';
import { register, collectDefaultMetrics, Counter, Histogram } from 'prom-client';
import { logger } from '../logger';

// Collect default metrics
collectDefaultMetrics({ prefix: 'backendos_' });

// HTTP request metrics
export const httpRequestDuration = new Histogram({
  name: 'backendos_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
});

export const httpRequestTotal = new Counter({
  name: 'backendos_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

export const httpRequestErrors = new Counter({
  name: 'backendos_http_request_errors_total',
  help: 'Total number of HTTP request errors',
  labelNames: ['method', 'route', 'status_code'],
});

// Business metrics
export const authAttempts = new Counter({
  name: 'backendos_auth_attempts_total',
  help: 'Total number of authentication attempts',
  labelNames: ['type', 'success'],
});

export const fileUploads = new Counter({
  name: 'backendos_file_uploads_total',
  help: 'Total number of file uploads',
  labelNames: ['success'],
});

export const jobsProcessed = new Counter({
  name: 'backendos_jobs_processed_total',
  help: 'Total number of background jobs processed',
  labelNames: ['queue', 'status'],
});

// Middleware to collect metrics
export const metricsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route?.path || req.path || 'unknown';
    const statusCode = res.statusCode.toString();
    
    httpRequestDuration.observe(
      { method: req.method, route, status_code: statusCode },
      duration
    );
    
    httpRequestTotal.inc({
      method: req.method,
      route,
      status_code: statusCode,
    });
    
    if (res.statusCode >= 400) {
      httpRequestErrors.inc({
        method: req.method,
        route,
        status_code: statusCode,
      });
    }
  });
  
  next();
};

// Metrics endpoint handler
export const metricsHandler = async (req: Request, res: Response) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    logger.error('Error generating metrics', { error });
    res.status(500).end();
  }
};

export { register };
