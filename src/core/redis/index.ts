import Redis, { type RedisOptions } from 'ioredis';
import { config } from '../config';
import { logger } from '../logger';

/**
 * Shared Redis client.
 *
 * - Single connection reused by caching, rate limiting and health checks.
 * - `connect()` pings the server with a short timeout so startup can fail
 *   fast (or degrade gracefully) instead of hanging.
 * - BullMQ gets its own connection *options* (never this shared instance)
 *   because it needs blocking commands with `maxRetriesPerRequest: null`.
 */
class RedisClient {
  private client: Redis | null = null;
  private connected = false;

  buildOptions(): RedisOptions {
    // ioredis defaults to waiting 2s for the socket to close on disconnect
    // (a *ref'd* timer), which delays process exit. 500ms is plenty for a
    // graceful goodbye and keeps shutdown — and test workers — snappy.
    const common: RedisOptions = {
      lazyConnect: false,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy: (times: number) => Math.min(times * 100, 3000),
      disconnectTimeout: 500,
    };

    if (config.redis.url) return common;

    return {
      ...common,
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
    };
  }

  /**
   * Connection settings suitable for BullMQ workers/queues.
   * BullMQ duplicates connections for blocking commands, so it consumes
   * plain options rather than a shared `Redis` instance.
   */
  getBullMQOptions(): RedisOptions {
    return {
      ...this.buildOptions(),
      maxRetriesPerRequest: null,
    };
  }

  async connect(timeoutMs = 3000): Promise<void> {
    if (this.client) return;

    const client = new Redis({
      ...this.buildOptions(),
      connectionName: 'backendos',
    });

    client.on('connect', () => {
      this.connected = true;
      logger.info('redis connected', { host: config.redis.host, port: config.redis.port });
    });

    client.on('ready', () => {
      this.connected = true;
    });

    client.on('error', (err: Error) => {
      if (this.connected) {
        this.connected = false;
      }
      logger.warn('redis error', { message: err.message });
    });

    client.on('end', () => {
      this.connected = false;
    });

    this.client = client;

    try {
      await Promise.race([
        client.ping(),
        new Promise<never>((_resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error(`Redis ping timed out after ${timeoutMs}ms`)),
            timeoutMs
          );
          timer.unref?.();
        }),
      ]);
      this.connected = true;
    } catch (error) {
      this.connected = false;
      logger.warn('redis unavailable, falling back to in-process implementations', {
        message: (error as Error).message,
      });
    }
  }

  getClient(): Redis {
    if (!this.client) {
      // Lazily create a client so late consumers (e.g. a route hit before
      // `initialize()` completed) still get a working connection.
      this.client = new Redis({
        ...this.buildOptions(),
        connectionName: 'backendos',
      });
      this.client.on('error', (err: Error) => logger.warn('redis error', { message: err.message }));
      this.client.on('ready', () => {
        this.connected = true;
      });
      this.client.on('end', () => {
        this.connected = false;
      });
    }
    return this.client;
  }

  isReady(): boolean {
    return this.connected && this.client?.status === 'ready';
  }

  async disconnect(): Promise<void> {
    if (!this.client) return;
    const client = this.client;
    this.client = null;
    this.connected = false;

    // Only attempt QUIT on a live socket; on a dead/reconnecting client it
    // would block until the timeout for nothing and keep the process alive.
    if (client.status === 'ready' || client.status === 'connecting') {
      try {
        await Promise.race([
          client.quit(),
          new Promise<void>((resolve) => setTimeout(resolve, 1000).unref()),
        ]);
      } catch {
        // The socket may already be closed or reconnecting.
      }
    }

    // Guarantee the handle is released even if QUIT never made it out.
    client.disconnect();
    logger.info('redis disconnected');
  }
}

export const redisClient = new RedisClient();
