/**
 * Process entry point: boots BackendOS and installs signal handlers for a
 * graceful drain (Kubernetes sends SIGTERM, Ctrl-C sends SIGINT).
 */
import { backendOS } from './core/app';
import { logger } from './core/logger';

let shuttingDown = false;

const shutdown = async (signal: string): Promise<void> => {
  if (shuttingDown) {
    logger.warn('shutdown already in progress', { signal });
    return;
  }
  shuttingDown = true;

  logger.info('signal received', { signal });
  try {
    await backendOS.shutdown();
    process.exit(0);
  } catch (error) {
    logger.error('graceful shutdown failed', { message: (error as Error).message });
    process.exit(1);
  }
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

// Never swallow unexpected crashes silently.
process.on('unhandledRejection', (reason) => {
  logger.error('unhandled promise rejection', {
    message: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

process.on('uncaughtException', (error) => {
  logger.error('uncaught exception, shutting down', {
    message: error.message,
    stack: error.stack,
  });
  void shutdown('uncaughtException').finally(() => process.exit(1));
});

backendOS.start().catch((error) => {
  logger.error('failed to start backendos', {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exit(1);
});
