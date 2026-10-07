# Rate Limiting module

Distributed request throttling built on `express-rate-limit`, with Redis-backed counters and an in-memory fallback.

## Features

- Four ready-made limiters: `global`, `strict`, `auth`, and `api`
- Shared counters across replicas via a `rate-limit-redis` store (prefix `backendos:ratelimit:<name>:`) whenever Redis is connected, per-process memory otherwise
- Draft-8 `RateLimit-*` standard headers, `Retry-After` on rejection, and a JSON body `{ error, code: 'RATE_LIMITED', requestId }`
- `createLimiter()` factory for custom windows, limits, and messages
- Core mounts the global limiter on every request and the `auth`/`api` limiters on their route prefixes

## Usage

```typescript
import { rateLimitingModule, RateLimitService, authLimiter } from '../../modules/rate-limiting';

app.use(rateLimitingModule.limiters.global);
app.use('/api/auth', rateLimitingModule.limiters.auth);
app.use('/api/ai', rateLimitingModule.limiters.api);

// Custom limiter
const limiter = new RateLimitService().createLimiter({
  prefix: 'contact',
  windowMs: 60_000,
  max: 5,
});
```

### Built-in limiters

| Limiter   | Window                          | Limit                | Mounted by core on   |
| --------- | ------------------------------- | -------------------- | -------------------- |
| `global`  | `RATE_LIMIT_WINDOW_MS` (15 min) | `RATE_LIMIT_MAX_REQUESTS` (100) | all requests except the probe/metrics paths listed below |
| `strict`  | 15 min                          | 10                   | not mounted (use manually) |
| `auth`    | 15 min                          | 20                   | `/api/auth`          |
| `api`     | 1 min                           | 60                   | `/api/ai`            |

## Configuration

| Variable                 | Purpose                              | Default |
| ------------------------ | ------------------------------------ | ------- |
| `RATE_LIMIT_ENABLED`     | Master switch for the module         | `true`  |
| `RATE_LIMIT_WINDOW_MS`   | Window for the `global` limiter      | `900000` (15 min) |
| `RATE_LIMIT_MAX_REQUESTS`| Max requests per window for `global` | `100`   |
| `MODULE_RATE_LIMITING`   | Mount the module                     | `true`  |

## Notes

- Limiters are constructed lazily during module initialization so the Redis store attaches after the core Redis connection is up; reading `limiters` earlier falls back to memory.
- When Redis is unreachable the counters are process-local, so effective limits scale with the number of replicas.
- The global limiter skips only `/api/health`, `/api/health/ready`, `/api/health/live`, and the Prometheus path (`METRICS_PATH`).
- The standalone factory `authLimiter()` is exported for mounting a fresh auth limiter outside the module.
