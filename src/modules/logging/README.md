# Logging module

Structured request and application logging: an access-log middleware plus a thin service façade over the shared Winston logger.

## Features

- One access-log line per completed request with `requestId`, method, path, status, `durationMs`, IP, user agent, and authenticated user id
- Status-based severity: 5xx → error, 4xx → warn, otherwise info
- High-frequency probe paths (`/metrics`, `/api/health/live`, `/api/health/ready`) are skipped on success
- `LoggingService` with `debug` / `info` / `warn` / `error` / `log`, optionally bound to a child context
- Console transport: colorized text in development, JSON in production
- Optional rotating file transports (`logs/error.log`, `logs/combined.log`; 10 MB × 10 files) when enabled
- Mounted automatically by the core app when `MODULE_LOGGING` is on

## Usage

```typescript
import { loggingModule, LoggingService, createLoggingMiddleware } from '../../modules/logging';

// Shared service (bound to { module: 'logging' })
loggingModule.service.info('user logged in', { userId: '42' });
loggingModule.service.error('payment failed', { orderId, message: err.message });

// Module-scoped logger
const log = new LoggingService({ module: 'billing' });
log.warn('retrying charge', { attempt });

// Mount the access-log middleware yourself (core already does this)
app.use(createLoggingMiddleware(loggingModule.service));
```

This module exposes no HTTP routes.

## Configuration

| Variable            | Purpose                                      | Default |
| ------------------- | -------------------------------------------- | ------- |
| `LOG_LEVEL`         | Winston level (`error`…`silly`)              | `info`  |
| `LOG_FILE_ENABLED`  | Write rotating `logs/*.log` file transports  | `false` |
| `MODULE_LOGGING`    | Install the access-log middleware            | `true`  |

## Notes

- The actual logger lives in `src/core/logger`; this module only wraps it, so all modules share one Winston instance and level.
- File transports are created at import time when `LOG_FILE_ENABLED=true` — enable it before the process boots.
- Transports are flushed by the core shutdown routine; `shutdown()` here is intentionally a no-op.
