import { backendOS } from './core/app';

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await backendOS.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await backendOS.shutdown();
  process.exit(0);
});

// Start the application
backendOS.start().catch((error) => {
  console.error('Failed to start BackendOS:', error);
  process.exit(1);
});
