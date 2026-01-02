import express, { Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from '../shared/utils/config';
import { authModule } from '../modules/auth';
import { rateLimitingModule } from '../modules/rate-limiting';
import { cachingModule } from '../modules/caching';
import { jobsModule } from '../modules/jobs';
import { fileUploadModule } from '../modules/file-upload';
import { loggingModule } from '../modules/logging';
import { monitoringModule } from '../modules/monitoring';
import { aiHelpersModule } from '../modules/ai-helpers';

export class BackendOS {
  private app: Application;
  private modules: any[];

  constructor() {
    this.app = express();
    this.modules = [
      authModule,
      rateLimitingModule,
      cachingModule,
      jobsModule,
      fileUploadModule,
      loggingModule,
      monitoringModule,
      aiHelpersModule,
    ];
  }

  async initialize(): Promise<void> {
    // Security middleware
    this.app.use(helmet());
    this.app.use(cors());

    // Body parsing middleware
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Logging middleware
    if (config.modules.logging && loggingModule.metadata.enabled) {
      this.app.use(loggingModule.middleware);
    }

    // Initialize all modules
    for (const module of this.modules) {
      const configKey = this.getModuleConfigKey(module.metadata.name) as keyof typeof config.modules;
      if (config.modules[configKey]) {
        await module.initialize();
      }
    }

    // Register module routes
    this.registerRoutes();

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        name: 'BackendOS',
        version: '1.0.0',
        description: 'A modular monolith backend platform',
        modules: this.getModuleStatus(),
        documentation: '/api/docs',
      });
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: 'The requested endpoint does not exist',
        path: req.path,
      });
    });

    // Error handler
    this.app.use((err: any, req: any, res: any, next: any) => {
      loggingModule.service.error('Unhandled error', {
        error: err.message,
        stack: err.stack,
        path: req.path,
      });

      res.status(err.status || 500).json({
        error: 'Internal Server Error',
        message: config.nodeEnv === 'development' ? err.message : 'An error occurred',
      });
    });
  }

  private registerRoutes(): void {
    // Auth module routes
    if (config.modules.auth && authModule.metadata.enabled) {
      this.app.use('/api/auth', authModule.router);
    }

    // File upload module routes
    if (config.modules.fileUpload && fileUploadModule.metadata.enabled) {
      this.app.use('/api/upload', fileUploadModule.router);
    }

    // Monitoring module routes
    if (config.modules.monitoring && monitoringModule.metadata.enabled) {
      this.app.use('/api/health', monitoringModule.router);
    }

    // AI helpers module routes
    if (config.modules.aiHelpers && aiHelpersModule.metadata.enabled) {
      this.app.use('/api/ai', aiHelpersModule.router);
    }
  }

  private getModuleConfigKey(moduleName: string): string {
    // Convert 'auth' to 'auth', 'rate-limiting' to 'rateLimiting', etc.
    return moduleName.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
  }

  private getModuleStatus() {
    return this.modules.map(module => {
      const configKey = this.getModuleConfigKey(module.metadata.name) as keyof typeof config.modules;
      return {
        name: module.metadata.name,
        version: module.metadata.version,
        description: module.metadata.description,
        enabled: module.metadata.enabled && config.modules[configKey],
      };
    });
  }

  async start(): Promise<void> {
    await this.initialize();

    const port = config.port;
    this.app.listen(port, () => {
      loggingModule.service.info(`BackendOS started on port ${port}`);
      loggingModule.service.info(`Environment: ${config.nodeEnv}`);
      loggingModule.service.info('Enabled modules:', {
        modules: this.getModuleStatus().filter(m => m.enabled).map(m => m.name),
      });
    });
  }

  async shutdown(): Promise<void> {
    loggingModule.service.info('Shutting down BackendOS...');
    
    for (const module of this.modules) {
      await module.shutdown();
    }

    loggingModule.service.info('BackendOS shutdown complete');
  }

  getApp(): Application {
    return this.app;
  }

  getModule(name: string) {
    return this.modules.find(m => m.metadata.name === name);
  }
}

// Export singleton instance
export const backendOS = new BackendOS();
