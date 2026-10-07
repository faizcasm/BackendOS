import helmet from 'helmet';
import cors, { type CorsOptions } from 'cors';
import { config } from '../config';

/**
 * Security headers.
 *
 * CSP allows inline scripts/styles only because Swagger UI (served from this
 * process) needs them; tighten `scriptSrc` if you don't expose `/api/docs`.
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      fontSrc: ["'self'", 'https:', 'data:'],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'"],
      upgradeInsecureRequests: config.isProd ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'no-referrer' },
  hsts: config.isProd ? { maxAge: 15552000, includeSubDomains: true, preload: true } : false,
});

const EXPOSED_HEADERS = [
  'X-Request-Id',
  'RateLimit-Limit',
  'RateLimit-Remaining',
  'RateLimit-Reset',
  'Retry-After',
];

/**
 * CORS with an explicit allow-list (`CORS_ORIGINS=a.com,b.com`).
 * With the default `*` the origin is reflected and credentials stay off.
 */
export const buildCorsOptions = (): CorsOptions => {
  const allowAll = config.corsOrigins.includes('*');

  if (allowAll) {
    return {
      origin: true,
      credentials: false,
      exposedHeaders: EXPOSED_HEADERS,
      maxAge: 600,
    };
  }

  const allowed = new Set(config.corsOrigins.map((origin) => origin.toLowerCase()));

  return {
    origin: (origin, callback) => {
      // Non-browser (no Origin header) or same-origin requests are allowed.
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowed.has(origin.toLowerCase())) {
        callback(null, true);
        return;
      }
      // No CORS headers => the browser blocks the response.
      callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: EXPOSED_HEADERS,
    maxAge: 600,
  };
};

export const corsMiddleware = cors(buildCorsOptions());
