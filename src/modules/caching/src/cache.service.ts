import Redis from 'ioredis';
import { config } from '../../../shared/utils/config';
import { CacheOptions } from '../../../shared/types';

export class CacheService {
  private client: Redis | null = null;
  private isRedisAvailable = false;
  private memoryCache: Map<string, { value: any; expiry: number }> = new Map();

  constructor() {
    this.initRedis();
  }

  private initRedis() {
    try {
      this.client = new Redis({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        retryStrategy: (times) => {
          if (times > 3) {
            console.warn('Redis connection failed, falling back to memory cache');
            return null;
          }
          return Math.min(times * 100, 3000);
        },
      });

      this.client.on('connect', () => {
        this.isRedisAvailable = true;
        console.log('Redis connected successfully');
      });

      this.client.on('error', (err) => {
        this.isRedisAvailable = false;
        console.warn('Redis error, using memory cache:', err.message);
      });
    } catch (error) {
      console.warn('Redis initialization failed, using memory cache');
      this.isRedisAvailable = false;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      if (this.isRedisAvailable && this.client) {
        const value = await this.client.get(key);
        return value ? JSON.parse(value) : null;
      } else {
        return this.getFromMemory(key);
      }
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  async set(key: string, value: any, options?: CacheOptions): Promise<boolean> {
    try {
      const ttl = options?.ttl || 3600;
      const prefixedKey = options?.prefix ? `${options.prefix}:${key}` : key;

      if (this.isRedisAvailable && this.client) {
        await this.client.setex(prefixedKey, ttl, JSON.stringify(value));
        return true;
      } else {
        return this.setInMemory(prefixedKey, value, ttl);
      }
    } catch (error) {
      console.error('Cache set error:', error);
      return false;
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      if (this.isRedisAvailable && this.client) {
        await this.client.del(key);
        return true;
      } else {
        this.memoryCache.delete(key);
        return true;
      }
    } catch (error) {
      console.error('Cache delete error:', error);
      return false;
    }
  }

  async clear(pattern?: string): Promise<boolean> {
    try {
      if (this.isRedisAvailable && this.client) {
        if (pattern) {
          const keys = await this.client.keys(pattern);
          if (keys.length > 0) {
            await this.client.del(...keys);
          }
        } else {
          await this.client.flushdb();
        }
        return true;
      } else {
        if (pattern) {
          const regex = new RegExp(pattern.replace('*', '.*'));
          for (const key of this.memoryCache.keys()) {
            if (regex.test(key)) {
              this.memoryCache.delete(key);
            }
          }
        } else {
          this.memoryCache.clear();
        }
        return true;
      }
    } catch (error) {
      console.error('Cache clear error:', error);
      return false;
    }
  }

  private getFromMemory<T>(key: string): T | null {
    const cached = this.memoryCache.get(key);
    if (!cached) return null;
    
    if (Date.now() > cached.expiry) {
      this.memoryCache.delete(key);
      return null;
    }
    
    return cached.value;
  }

  private setInMemory(key: string, value: any, ttl: number): boolean {
    this.memoryCache.set(key, {
      value,
      expiry: Date.now() + ttl * 1000,
    });
    return true;
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
    }
  }
}
