import fs from 'fs';
import path from 'path';
import { config } from '../../core/config';
import { LoggingService } from './src/logging.service';
import { createLoggingMiddleware } from './src/logging.middleware';
import type { ModuleMetadata } from '../../shared/types';

export * from './src/logging.service';
export * from './src/logging.middleware';

export class LoggingModule {
  public readonly metadata: ModuleMetadata = {
    name: 'logging',
    version: '2.0.0',
    description: 'Structured request and application logging',
    enabled: true,
  };

  public readonly service: LoggingService;
  public readonly middleware: ReturnType<typeof createLoggingMiddleware>;

  constructor() {
    if (config.log.fileEnabled) {
      const logsDir = path.join(process.cwd(), 'logs');
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true, mode: 0o750 });
      }
    }

    this.service = new LoggingService({ module: 'logging' });
    this.middleware = createLoggingMiddleware(this.service);
  }

  async initialize(): Promise<void> {
    this.service.info('logging module initialized', { level: config.log.level });
  }

  async shutdown(): Promise<void> {
    // Winston transports are flushed by the core shutdown routine.
  }
}

export const loggingModule = new LoggingModule();
