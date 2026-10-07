import rateLimit, { type RateLimitRequestHandler, type Options } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { config } from '../../../core/config';
import { redisClient } from '../../../core/redis';
import type { RateLimitConfig } from '../../../shared/types';

const REDIS_PREFIX = 'backendos:ratelimit';

/**
 * Rate limiting backed by Redis when available (shared counters across
 * replicas) with an in-memory fallback for local development.
 */
export class RateLimitService {
  private storeFor(prefix: string): Options['store'] | undefined {
    if (!redisClient.isReady()) return undefined;

    const client = redisClient.getClient();
    return new RedisStore({
      prefix: `${REDIS_PREFIX}:${prefix}:`,
      sendCommand: (...args: string[]) => client.call(args[0], ...args.slice(1)) as Promise<any>,
    });
  }

  createLimiter(
    customConfig?: Partial<RateLimitConfig> & { prefix?: string },
    base: Partial<Options> = {}
  ): RateLimitRequestHandler {
    const rateLimitConfig: RateLimitConfig = {
      windowMs: customConfig?.windowMs ?? config.rateLimit.windowMs,
      max: customConfig?.max ?? config.rateLimit.maxRequests,
      message: customConfig?.message ?? 'Too many requests, please try again later.',
    };

    const store = this.storeFor(customConfig?.prefix ?? 'global');

    return rateLimit({
      windowMs: rateLimitConfig.windowMs,
      limit: rateLimitConfig.max,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      skipSuccessfulRequests: false,
      ...(store ? { store } : {}),
      message: { error: rateLimitConfig.message, code: 'RATE_LIMITED' },
      handler: (req, res, next, options) => {
        res.setHeader('Retry-After', String(Math.ceil(options.windowMs / 1000)));
        res.status(options.statusCode).json({
          error: rateLimitConfig.message,
          code: 'RATE_LIMITED',
          requestId: req.requestId,
        });
      },
      ...base,
    });
  }

  /** Broad protection for every public endpoint. */
  getGlobalLimiter(): RateLimitRequestHandler {
    return this.createLimiter({ prefix: 'global' });
  }

  /** Aggressive limiter for abuse-prone routes (login, reset, contact forms). */
  getStrictLimiter(): RateLimitRequestHandler {
    return this.createLimiter(
      {
        prefix: 'strict',
        windowMs: 15 * 60 * 1000,
        max: 10,
        message: 'Too many requests from this IP, please try again after 15 minutes',
      },
      { skipSuccessfulRequests: false }
    );
  }

  /** Credential-stuffing protection: counts every attempt, not only failures. */
  getAuthLimiter(): RateLimitRequestHandler {
    return this.createLimiter(
      {
        prefix: 'auth',
        windowMs: 15 * 60 * 1000,
        max: 20,
        message: 'Too many authentication attempts, please try again later',
      },
      { skipSuccessfulRequests: false }
    );
  }

  /** Steady per-minute budget for normal API traffic. */
  getApiLimiter(): RateLimitRequestHandler {
    return this.createLimiter({
      prefix: 'api',
      windowMs: 60 * 1000,
      max: 60,
      message: 'API rate limit exceeded',
    });
  }
}

/** Standalone factory for apps that mount the limiter outside the module. */
export const authLimiter = (): RateLimitRequestHandler => new RateLimitService().getAuthLimiter();
