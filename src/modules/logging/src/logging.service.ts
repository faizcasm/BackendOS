import { logger, type Logger } from '../../../core/logger';
import type { LogData } from '../../../shared/types';

/**
 * Thin façade over the shared Winston instance so modules can depend on a
 * service object (and be mocked in tests) while still writing to one logger.
 */
export class LoggingService {
  private readonly logger: Logger;

  constructor(context: Record<string, unknown> = {}) {
    this.logger = Object.keys(context).length > 0 ? logger.child(context) : logger;
  }

  debug(message: string, metadata?: Record<string, unknown>): void {
    this.logger.debug(message, metadata);
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    this.logger.info(message, metadata);
  }

  warn(message: string, metadata?: Record<string, unknown>): void {
    this.logger.warn(message, metadata);
  }

  error(message: string, metadata?: Record<string, unknown>): void {
    this.logger.error(message, metadata);
  }

  log(data: LogData): void {
    this.logger.log({
      level: data.level,
      message: data.message,
      ...(data.metadata ?? {}),
    });
  }
}
