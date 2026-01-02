import Redis from 'ioredis';
import { config } from '../config';

class RedisClient {
  private client: Redis | null = null;
  private isConnected = false;

  async connect(): Promise<void> {
    try {
      this.client = new Redis({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => {
          if (times > 3) {
            console.error('✗ Redis connection failed after 3 attempts');
            return null;
          }
          return Math.min(times * 100, 3000);
        },
      });

      this.client.on('connect', () => {
        this.isConnected = true;
        console.log('✓ Redis connected successfully');
      });

      this.client.on('error', (err) => {
        this.isConnected = false;
        console.error('✗ Redis error:', err.message);
      });

      await this.client.ping();
    } catch (error) {
      console.error('✗ Redis initialization failed:', error);
      throw error;
    }
  }

  getClient(): Redis {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis client not initialized or not connected');
    }
    return this.client;
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.isConnected = false;
      console.log('✓ Redis disconnected');
    }
  }

  isReady(): boolean {
    return this.isConnected;
  }
}

export const redisClient = new RedisClient();
