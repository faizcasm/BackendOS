import { CacheService } from './src/cache.service';
import { createCacheMiddleware } from './src/cache.middleware';
import { ModuleMetadata } from '../../shared/types';

export class CachingModule {
  public readonly metadata: ModuleMetadata = {
    name: 'caching',
    version: '1.0.0',
    description: 'Caching module with Redis and in-memory fallback',
    enabled: true,
  };

  public readonly service: CacheService;

  constructor() {
    this.service = new CacheService();
  }

  middleware(ttl?: number, keyGenerator?: (req: any) => string) {
    return createCacheMiddleware(this.service, ttl, keyGenerator);
  }

  async initialize(): Promise<void> {
    console.log(`[${this.metadata.name}] Module initialized`);
  }

  async shutdown(): Promise<void> {
    await this.service.disconnect();
    console.log(`[${this.metadata.name}] Module shutdown`);
  }
}

export const cachingModule = new CachingModule();
