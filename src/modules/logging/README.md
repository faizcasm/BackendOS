# Logging Module

Provides structured logging with multiple transports and log levels.

## Features
- Multiple log levels (debug, info, warn, error)
- Structured logging with Winston
- Console and file transports
- Request/response logging
- Customizable log formats
- Metadata support

## Log Levels
- `debug` - Detailed debugging information
- `info` - General informational messages
- `warn` - Warning messages
- `error` - Error messages

## Usage

```typescript
import { loggingModule } from './modules/logging';

// Log messages
loggingModule.service.info('User logged in', { userId: '123' });
loggingModule.service.error('Database error', { error: err });

// Use middleware
app.use(loggingModule.middleware);
```
