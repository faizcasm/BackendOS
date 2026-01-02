# Caching Module

Provides caching functionality with Redis support and in-memory fallback.

## Features
- Redis-based caching
- Automatic fallback to in-memory cache
- Configurable TTL (Time To Live)
- Key prefixing support
- Pattern-based cache invalidation
- Caching middleware for Express routes

## API
- `get<T>(key: string): Promise<T | null>` - Get cached value
- `set(key: string, value: any, options?: CacheOptions): Promise<boolean>` - Set cache
- `delete(key: string): Promise<boolean>` - Delete cached value
- `clear(pattern?: string): Promise<boolean>` - Clear cache by pattern

## Usage

```typescript
import { cachingModule } from './modules/caching';

// Use service directly
await cachingModule.service.set('key', value, { ttl: 300 });
const data = await cachingModule.service.get('key');

// Use middleware
app.get('/api/data', cachingModule.middleware(300), handler);
```
