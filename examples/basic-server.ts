/**
 * Basic Server Example
 * 
 * Demonstrates a minimal BackendOS setup with core modules
 */

import express from 'express';
import { authModule } from '../src/modules/auth';
import { rateLimitingModule } from '../src/modules/rate-limiting';
import { loggingModule } from '../src/modules/logging';
import { monitoringModule } from '../src/modules/monitoring';

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(loggingModule.middleware);

// Rate limiting
app.use(rateLimitingModule.limiters.global);

// Routes
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to BackendOS Basic Example',
    features: ['auth', 'rate-limiting', 'logging', 'monitoring'],
  });
});

// Auth routes
app.use('/auth', rateLimitingModule.limiters.auth, authModule.router);

// Health checks
app.use('/health', monitoringModule.router);

// Protected route example
app.get('/protected', authModule.middleware.authenticate, (req, res) => {
  res.json({
    message: 'This is a protected route',
    user: req.user,
  });
});

// Start server
async function start() {
  await authModule.initialize();
  await loggingModule.initialize();
  await monitoringModule.initialize();

  app.listen(PORT, () => {
    loggingModule.service.info(`Basic server started on port ${PORT}`);
    console.log(`
🚀 Basic Server Running
    
✓ Server: http://localhost:${PORT}
✓ Health: http://localhost:${PORT}/health
✓ Auth: http://localhost:${PORT}/auth
    
Try it out:
- Register: POST http://localhost:${PORT}/auth/register
- Login: POST http://localhost:${PORT}/auth/login
- Health: GET http://localhost:${PORT}/health
    `);
  });
}

// Handle shutdown
process.on('SIGTERM', async () => {
  await authModule.shutdown();
  await loggingModule.shutdown();
  await monitoringModule.shutdown();
  process.exit(0);
});

start().catch(console.error);
