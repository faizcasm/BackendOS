# Rate Limiting Module

Provides configurable rate limiting functionality for BackendOS.

## Features
- IP-based rate limiting
- User-based rate limiting
- Configurable time windows and request limits
- Multiple pre-configured limiters
- Custom rate limiter creation

## Pre-configured Limiters
- Global rate limiter (100 requests per 15 minutes)
- Strict rate limiter (10 requests per 15 minutes)
- Auth rate limiter (5 requests per 15 minutes)
- API rate limiter (60 requests per minute)

## Usage

```typescript
import { rateLimitingModule } from './modules/rate-limiting';

// Use global rate limiter
app.use(rateLimitingModule.limiters.global);

// Use for specific routes
app.use('/api/auth', rateLimitingModule.limiters.auth);
```
