import morgan from 'morgan';
import { LoggingService } from './logging.service';

export const createLoggingMiddleware = (loggingService: LoggingService) => {
  // Custom morgan format
  const format = ':method :url :status :response-time ms - :res[content-length]';

  // Custom morgan stream
  const stream = {
    write: (message: string) => {
      loggingService.info(message.trim());
    },
  };

  return morgan(format, { stream });
};
