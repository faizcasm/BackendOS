import fs from 'fs';
import path from 'path';
import { LoggingService } from './src/logging.service';
import { createLoggingMiddleware } from './src/logging.middleware';
import { ModuleMetadata } from '../../shared/types';

export class LoggingModule {
  public readonly metadata: ModuleMetadata = {
    name: 'logging',
    version: '1.0.0',
    description: 'Structured logging module with Winston',
    enabled: true,
  };

  public readonly service: LoggingService;
  public readonly middleware: ReturnType<typeof createLoggingMiddleware>;

  constructor() {
    // Ensure logs directory exists
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    this.service = new LoggingService();
    this.middleware = createLoggingMiddleware(this.service);
  }

  async initialize(): Promise<void> {
    this.service.info(`[${this.metadata.name}] Module initialized`);
  }

  async shutdown(): Promise<void> {
    this.service.info(`[${this.metadata.name}] Module shutdown`);
  }
}

export const loggingModule = new LoggingModule();
