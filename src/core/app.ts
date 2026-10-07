import express, { type Application } from 'express';
import compression from 'compression';
import type { Server as HttpServer } from 'http';
import { config } from './config';
import { logger } from './logger';
import { packageJson } from './package';
import { redisClient } from './redis';
import { closeDatabase, initializeDatabase } from './db';
import { securityHeaders, corsMiddleware } from './middlewares/security';
import { requestIdMiddleware } from './middlewares/request-id';
import { notFoundHandler } from './middlewares/not-found';
import { errorHandler } from './middlewares/error-handler';
import { metricsMiddleware, metricsAuthGuard, metricsHandler } from './middlewares/metrics';
import { createDocsRouter } from './docs';
import { authModule } from '../modules/auth';
import { rateLimitingModule } from '../modules/rate-limiting';
import { cachingModule } from '../modules/caching';
import { jobsModule } from '../modules/jobs';
import { fileUploadModule } from '../modules/file-upload';
import { loggingModule } from '../modules/logging';
import { monitoringModule } from '../modules/monitoring';
import { aiHelpersModule } from '../modules/ai-helpers';

export interface BackendOSModule {
  metadata: { name: string; version: string; description: string; enabled: boolean };
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  router?: unknown;
}

const HEALTH_PATHS = new Set(['/api/health', '/api/health/ready', '/api/health/live']);

export class BackendOS {
  private readonly app: Application;
  private server: HttpServer | null = null;
  private initialized = false;
  private readonly modules: BackendOSModule[];

  constructor() {
    this.app = express();
    this.modules = [
      loggingModule,
      rateLimitingModule,
      cachingModule,
      authModule,
      jobsModule,
      fileUploadModule,
      monitoringModule,
      aiHelpersModule,
    ];
  }

  /**
   * Boots infrastructure (Redis, database) and wires middleware + routes.
   * Safe to call once; subsequent calls are no-ops.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // ---------------------------------------------------------- infrastructure
    try {
      await redisClient.connect();
    } catch (error) {
      logger.warn('redis connection failed during startup', {
        message: (error as Error).message,
      });
      if (config.redis.required) throw error;
    }

    try {
      await initializeDatabase();
    } catch (error) {
      logger.warn('database connection failed during startup', {
        message: (error as Error).message,
      });
      if (config.isProd) throw error;
    }

    // ------------------------------------------------------------- middleware
    this.app.set('trust proxy', config.trustProxy);
    this.app.disable('x-powered-by');
    this.app.set('etag', 'strong');

    this.app.use(securityHeaders);
    this.app.use(corsMiddleware);
    this.app.use(compression());
    this.app.use(requestIdMiddleware);

    this.app.use(express.json({ limit: config.bodyLimit }));
    this.app.use(express.urlencoded({ extended: true, limit: config.bodyLimit }));

    if (config.modules.logging) {
      this.app.use(loggingModule.middleware);
    }

    if (config.metrics.enabled) {
      this.app.use(metricsMiddleware);
    }

    // --------------------------------------------------------- module start-up
    for (const module of this.modules) {
      if (!this.isModuleEnabled(module)) continue;
      await module.initialize();
    }

    if (this.rateLimitingEnabled()) {
      const globalLimiter = rateLimitingModule.limiters.global;
      this.app.use((req, res, next) => {
        // Never throttle health probes or Prometheus scrapes.
        if (HEALTH_PATHS.has(req.path) || req.path === config.metrics.path) {
          next();
          return;
        }
        globalLimiter(req, res, next);
      });
    }

    // ------------------------------------------------------------- endpoints
    this.registerRoutes();

    this.initialized = true;
    logger.info('backendos initialized', {
      environment: config.nodeEnv,
      modules: this.getModuleStatus()
        .filter((module) => module.enabled)
        .map((module) => module.name),
    });
  }

  private isModuleEnabled(module: BackendOSModule): boolean {
    const key = this.getModuleConfigKey(module.metadata.name) as keyof typeof config.modules;
    const flag = config.modules[key];
    return Boolean(flag) && module.metadata.enabled;
  }

  private registerRoutes(): void {
    // Prometheus exposition (optional token guard)
    if (config.metrics.enabled) {
      this.app.get(config.metrics.path, metricsAuthGuard, metricsHandler);
    }

    // Interactive API documentation
    if (config.docs.enabled && config.modules.docs) {
      this.app.use(config.docs.path, createDocsRouter());
    }

    const limiter = this.rateLimitingEnabled() ? rateLimitingModule.limiters : null;

    // Health checks must never be throttled
    if (this.isModuleEnabled(monitoringModule)) {
      this.app.use('/api/health', monitoringModule.router);
    }

    if (this.isModuleEnabled(authModule)) {
      const authChain = limiter ? [limiter.auth] : [];
      this.app.use('/api/auth', ...authChain, authModule.router as never);
    }

    if (this.isModuleEnabled(fileUploadModule)) {
      this.app.use('/api/upload', fileUploadModule.router as never);
    }

    if (this.isModuleEnabled(aiHelpersModule)) {
      const aiChain = limiter ? [limiter.api] : [];
      this.app.use('/api/ai', ...aiChain, aiHelpersModule.router as never);
    }

    // Service metadata
    this.app.get('/', (_req, res) => {
      res.json({
        name: packageJson.name,
        version: packageJson.version,
        description: 'A modular monolith backend platform',
        environment: config.nodeEnv,
        documentation: config.docs.enabled ? config.docs.path : undefined,
        modules: this.getModuleStatus(),
        health: '/api/health',
        metrics: config.metrics.enabled ? config.metrics.path : undefined,
      });
    });

    this.app.use(notFoundHandler);
    this.app.use(errorHandler);
  }

  /** True when the global rate limiter should be mounted. */
  private rateLimitingEnabled(): boolean {
    return config.rateLimit.enabled && config.modules.rateLimiting;
  }

  private getModuleConfigKey(moduleName: string): string {
    return moduleName.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
  }

  getModuleStatus(): Array<{
    name: string;
    version: string;
    description: string;
    enabled: boolean;
  }> {
    return this.modules.map((module) => ({
      name: module.metadata.name,
      version: module.metadata.version,
      description: module.metadata.description,
      enabled: this.isModuleEnabled(module),
    }));
  }

  /**
   * Starts the HTTP server and resolves once it is listening.
   * The returned handle lets callers (tests, scripts) close it cleanly.
   */
  async start(): Promise<HttpServer> {
    if (this.server) return this.server;

    await this.initialize();

    this.server = await new Promise<HttpServer>((resolve, reject) => {
      const server = this.app.listen(config.port, config.host, () => resolve(server));
      server.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
          reject(new Error(`Port ${config.port} is already in use`));
          return;
        }
        reject(error);
      });
    });

    logger.info('backendos started', {
      port: config.port,
      host: config.host,
      environment: config.nodeEnv,
      pid: process.pid,
      docs: config.docs.enabled ? config.docs.path : undefined,
      metrics: config.metrics.enabled ? config.metrics.path : undefined,
    });

    return this.server;
  }

  /**
   * Drains in-flight requests, then shuts modules and connections down.
   * Never throws: shutdown must be idempotent and best-effort.
   */
  async shutdown(): Promise<void> {
    logger.info('shutdown initiated');

    if (this.server) {
      const server = this.server;
      this.server = null;

      await Promise.race([
        new Promise<void>((resolve) => {
          server.close(() => resolve());
          // Sever idle keep-alive sockets so close() can complete.
          server.closeIdleConnections?.();
          setTimeout(() => {
            server.closeAllConnections?.();
            resolve();
          }, config.shutdownTimeoutMs).unref();
        }),
        new Promise<void>((resolve) => setTimeout(resolve, config.shutdownTimeoutMs + 100).unref()),
      ]);
    }

    const results = await Promise.allSettled(this.modules.map((module) => module.shutdown()));
    for (const result of results) {
      if (result.status === 'rejected') {
        logger.error('module shutdown failed', { message: String(result.reason) });
      }
    }

    await Promise.allSettled([redisClient.disconnect(), closeDatabase()]);
    logger.info('shutdown complete');
    this.initialized = false;
  }

  getApp(): Application {
    return this.app;
  }

  getServer(): HttpServer | null {
    return this.server;
  }

  getModule(name: string): BackendOSModule | undefined {
    return this.modules.find((module) => module.metadata.name === name);
  }
}

// Convenience singleton for `import { backendOS } from './core/app'`
export const backendOS = new BackendOS();
