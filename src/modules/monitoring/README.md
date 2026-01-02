# Monitoring Module

Provides health checks and system monitoring capabilities.

## Features
- Health check endpoints
- Service status monitoring
- System metrics collection
- Uptime tracking
- Dependency health checks

## Health Check Status
- `healthy` - All services operational
- `unhealthy` - One or more services down

## Usage

```typescript
import { monitoringModule } from './modules/monitoring';

// Use health check routes
app.use('/health', monitoringModule.router);

// Add custom health checks
monitoringModule.service.addHealthCheck('database', async () => {
  // Check database connection
  return { status: 'up', latency: 5 };
});
```
