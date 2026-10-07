import { logger } from '../../../core/logger';
import { redisClient } from '../../../core/redis';
import type { CacheOptions } from '../../../shared/types';

interface MemoryEntry {
  value: unknown;
  expiry: number;
}

const DEFAULT_TTL_SECONDS = 3600;
const MAX_MEMORY_ENTRIES = 10_000;
const KEY_PREFIX = 'cache';

/**
 * Cache abstraction with two interchangeable backends:
 *
 *  - Redis (preferred): shared across replicas, survives restarts.
 *  - In-memory LRU-ish map: zero-dependency fallback that keeps the app
 *    functional when Redis is unreachable.
 *
 * All public methods never throw: cache failures must not break requests.
 */
export class CacheService {
  private memory = new Map<string, MemoryEntry>();
  private hits = 0;
  private misses = 0;

  private backend(): 'redis' | 'memory' {
    return redisClient.isReady() ? 'redis' : 'memory';
  }

  private buildKey(key: string, options?: CacheOptions): string {
    return options?.prefix ? `${KEY_PREFIX}:${options.prefix}:${key}` : `${KEY_PREFIX}:${key}`;
  }

  /** Current backend plus hit/miss counters (exposed on the health endpoint). */
  stats(): { backend: 'redis' | 'memory'; hits: number; misses: number; entries: number } {
    return {
      backend: this.backend(),
      hits: this.hits,
      misses: this.misses,
      entries: this.memory.size,
    };
  }

  async get<T>(key: string, options?: CacheOptions): Promise<T | null> {
    const fullKey = this.buildKey(key, options);

    if (this.backend() === 'redis') {
      try {
        const value = await redisClient.getClient().get(fullKey);
        if (value === null) {
          this.misses += 1;
          return null;
        }
        this.hits += 1;
        return JSON.parse(value) as T;
      } catch (error) {
        logger.warn('cache get failed', { key: fullKey, message: (error as Error).message });
      }
    }

    const entry = this.memory.get(fullKey);
    if (!entry) {
      this.misses += 1;
      return null;
    }
    if (Date.now() > entry.expiry) {
      this.memory.delete(fullKey);
      this.misses += 1;
      return null;
    }
    this.hits += 1;
    return entry.value as T;
  }

  async set(key: string, value: unknown, options?: CacheOptions): Promise<boolean> {
    const ttl = options?.ttl && options.ttl > 0 ? options.ttl : DEFAULT_TTL_SECONDS;
    const fullKey = this.buildKey(key, options);

    if (this.backend() === 'redis') {
      try {
        await redisClient.getClient().setex(fullKey, ttl, JSON.stringify(value));
        return true;
      } catch (error) {
        logger.warn('cache set failed', { key: fullKey, message: (error as Error).message });
      }
    }

    this.evictIfNeeded();
    this.memory.set(fullKey, { value, expiry: Date.now() + ttl * 1000 });
    return true;
  }

  async delete(key: string, options?: CacheOptions): Promise<boolean> {
    const fullKey = this.buildKey(key, options);

    if (this.backend() === 'redis') {
      try {
        await redisClient.getClient().del(fullKey);
        return true;
      } catch (error) {
        logger.warn('cache delete failed', { key: fullKey, message: (error as Error).message });
      }
    }

    return this.memory.delete(fullKey);
  }

  /** Remaining TTL in seconds, or -1 when no expiry / unknown. */
  async ttl(key: string, options?: CacheOptions): Promise<number> {
    const fullKey = this.buildKey(key, options);

    if (this.backend() === 'redis') {
      try {
        return await redisClient.getClient().ttl(fullKey);
      } catch {
        return -1;
      }
    }

    const entry = this.memory.get(fullKey);
    if (!entry) return -1;
    return Math.max(0, Math.ceil((entry.expiry - Date.now()) / 1000));
  }

  /**
   * Cache-aside helper: returns the cached value or runs `factory`, stores the
   * result and returns it. Concurrent callers may stampede; the caller can
   * avoid that by keeping `factory` cheap or wrapping it in its own lock.
   */
  async wrap<T>(key: string, factory: () => Promise<T> | T, options?: CacheOptions): Promise<T> {
    const cached = await this.get<T>(key, options);
    if (cached !== null) return cached;

    const value = await factory();
    await this.set(key, value, options);
    return value;
  }

  /** Atomic increment, useful for counters and simple fixed-window budgets. */
  async incr(key: string, ttlSeconds?: number, options?: CacheOptions): Promise<number | null> {
    const fullKey = this.buildKey(key, options);

    if (this.backend() === 'redis') {
      try {
        const client = redisClient.getClient();
        const value = await client.incr(fullKey);
        if (value === 1 && ttlSeconds) {
          await client.expire(fullKey, ttlSeconds);
        }
        return value;
      } catch (error) {
        logger.warn('cache incr failed', { key: fullKey, message: (error as Error).message });
        return null;
      }
    }

    const entry = this.memory.get(fullKey);
    const now = Date.now();
    const current = entry && entry.expiry > now ? (entry.value as number) : 0;
    const next = current + 1;
    this.memory.set(fullKey, {
      value: next,
      expiry: ttlSeconds ? now + ttlSeconds * 1000 : now + DEFAULT_TTL_SECONDS * 1000,
    });
    return next;
  }

  /**
   * Clears keys. A glob pattern (`user:*`) is honoured on both backends; Redis
   * uses SCAN (never KEYS) so production traffic is not blocked.
   */
  async clear(pattern?: string): Promise<boolean> {
    if (this.backend() === 'redis') {
      try {
        const client = redisClient.getClient();
        const target = pattern
          ? pattern.startsWith(`${KEY_PREFIX}:`)
            ? pattern
            : `${KEY_PREFIX}:${pattern}`
          : `${KEY_PREFIX}:*`;
        await this.deleteByPattern(target, client);
        return true;
      } catch (error) {
        logger.warn('cache clear failed', { message: (error as Error).message });
        return false;
      }
    }

    if (!pattern) {
      this.memory.clear();
      return true;
    }

    // Memory keys carry the same `cache:` prefix the Redis backend uses.
    const prefixed = pattern.startsWith(`${KEY_PREFIX}:`) ? pattern : `${KEY_PREFIX}:${pattern}`;
    const regex = new RegExp(
      `^${prefixed.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`
    );
    for (const key of Array.from(this.memory.keys())) {
      if (regex.test(key)) this.memory.delete(key);
    }
    return true;
  }

  private async deleteByPattern(
    pattern: string,
    client: {
      scan(...args: any[]): Promise<[string, string[]]>;
      del(...keys: string[]): Promise<number>;
    }
  ): Promise<void> {
    let cursor = '0';
    do {
      const [next, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = next;
      if (keys.length > 0) await client.del(...keys);
    } while (cursor !== '0');
  }

  private evictIfNeeded(): void {
    if (this.memory.size < MAX_MEMORY_ENTRIES) return;

    const now = Date.now();
    for (const [key, entry] of this.memory) {
      if (entry.expiry <= now) this.memory.delete(key);
    }

    // Still full: drop oldest inserts (Map preserves insertion order).
    while (this.memory.size >= MAX_MEMORY_ENTRIES) {
      const oldest = this.memory.keys().next().value;
      if (oldest === undefined) break;
      this.memory.delete(oldest);
    }
  }

  /** True when a request should be served from cache (tests + health). */
  get isRedisAvailable(): boolean {
    return this.backend() === 'redis';
  }

  async disconnect(): Promise<void> {
    this.memory.clear();
    // The underlying Redis connection is shared and owned by core/redis.
  }
}
