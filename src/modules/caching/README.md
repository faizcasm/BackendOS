# Caching module

Redis-first cache abstraction with an automatic in-memory fallback and a response-caching middleware for Express.

## Features

- `CacheService` with `get`, `set`, `delete`, `ttl`, cache-aside `wrap`, atomic `incr`, and pattern-based `clear`
- Redis backend when the shared core connection is ready, in-memory backend otherwise — selected per call
- Key namespacing via `prefix` (stored as `cache:<prefix>:<key>`); `clear('user:*')` uses Redis SCAN, never KEYS
- Default TTL of 1 hour; the memory backend caps at 10 000 entries with expiry + oldest-first eviction
- Response middleware for GET routes: caches 200 JSON bodies and sets `X-Cache: HIT|MISS`
- `stats()` reporting the active backend plus hit/miss/entry counters (surfaced by the health check)
- Cache failures are logged and swallowed so requests never break on cache errors

## Usage

```typescript
import { cachingModule, CacheService, createCacheMiddleware } from '../../modules/caching';

await cachingModule.service.set('user:42', user, { ttl: 300, prefix: 'users' });
const user = await cachingModule.service.get<User>('user:42', { prefix: 'users' });
const config = await cachingModule.service.wrap('app:config', loadConfig, { ttl: 60 });
await cachingModule.service.clear('users:*');

// Cache GET responses for 5 minutes
app.get('/api/data', cachingModule.middleware(300), handler);

// Per-user caching: you must key on the user id yourself
app.get('/api/me', cachingModule.middleware(60, (req) => `me:${req.user?.userId}`), handler);
```

## Configuration

| Variable            | Purpose                                   | Default |
| ------------------- | ----------------------------------------- | ------- |
| `REDIS_URL`         | Full Redis URL (overrides host/port)      | unset   |
| `REDIS_HOST`        | Redis host when no URL is set             | `localhost` |
| `REDIS_PORT`        | Redis port                                 | `6379`  |
| `REDIS_PASSWORD`    | Redis password                             | unset   |
| `REDIS_DB`          | Redis database index                       | `0`     |
| `REDIS_REQUIRED`    | Fail startup when Redis is unreachable     | `false` |
| `MODULE_CACHING`    | Mount the module                           | `true`  |

## Notes

- Uses the single Redis connection owned by `src/core/redis`; `disconnect()` only clears in-memory entries.
- The response middleware skips requests carrying an `Authorization` header unless you pass a `keyGenerator`, so cached bodies are never shared between users.
- Only HTTP 200 JSON responses are stored; non-GET requests always pass through.
