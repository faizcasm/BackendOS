import { CacheService } from './src/cache.service';
import { createCacheMiddleware } from './src/cache.middleware';
import type { ModuleMetadata } from '../../shared/types';

export * from './src/cache.service';
export * from './src/cache.middleware';

export class CachingModule {
  public readonly metadata: ModuleMetadata = {
    name: 'caching',
    version: '2.0.0',
    description: 'Redis caching with in-memory fallback',
    enabled: true,
  };

  public readonly service: CacheService;

  constructor() {
    this.service = new CacheService();
  }

  /** `app.get('/users', cachingModule.middleware(60), handler)` */
  middleware(ttl?: number, keyGenerator?: (req: any) => string) {
    return createCacheMiddleware(this.service, ttl, keyGenerator);
  }

  async initialize(): Promise<void> {
    // Nothing to own: the shared Redis connection is managed by core/redis.
  }

  async shutdown(): Promise<void> {
    await this.service.disconnect();
  }
}

export const cachingModule = new CachingModule();
