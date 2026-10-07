/**
 * BackendOS public API.
 *
 * This barrel is side-effect free: importing it never opens sockets, connects
 * to a database or starts a server. Call `backendOS.start()` when you want to
 * boot the bundled Express application.
 *
 * @example
 * ```ts
 * import { backendOS, cachingModule } from 'backendos';
 *
 * await backendOS.start();
 * await cachingModule.service.set('hello', { world: true }, { ttl: 60 });
 * ```
 */

// Application
export { BackendOS, backendOS, type BackendOSModule } from './core/app';

// Configuration & observability
export { config, type AppConfig } from './core/config';
export { logger, createRequestLogger, type Logger } from './core/logger';
export { packageJson } from './core/package';

// Errors
export * from './core/errors';

// Infrastructure clients
export { prisma, initializeDatabase, closeDatabase } from './core/db';
export { redisClient } from './core/redis';

// Middleware
export { requestIdMiddleware, REQUEST_ID_HEADER } from './core/middlewares/request-id';
export { notFoundHandler } from './core/middlewares/not-found';
export { errorHandler, normaliseError } from './core/middlewares/error-handler';
export { securityHeaders, corsMiddleware, buildCorsOptions } from './core/middlewares/security';
export {
  metricsMiddleware,
  metricsHandler,
  metricsAuthGuard,
  register as prometheusRegister,
} from './core/middlewares/metrics';
export { createAuditLog, auditMiddleware } from './core/middlewares/audit';

// Modules
export * from './modules/auth';
export * from './modules/rate-limiting';
export * from './modules/caching';
export * from './modules/jobs';
export * from './modules/file-upload';
export * from './modules/logging';
export * from './modules/monitoring';
export * from './modules/ai-helpers';

// Shared types
export * from './shared/types';
