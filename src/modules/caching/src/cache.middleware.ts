import type { Request, Response, NextFunction } from 'express';
import { logger } from '../../../core/logger';
import type { CacheService } from './cache.service';

/**
 * Response cache for idempotent GET requests.
 *
 * Only 200 JSON responses are cached; authenticated responses are skipped by
 * default (pass `keyGenerator` that includes the user id when you really want
 * per-user caching).
 */
export const createCacheMiddleware = (
  cacheService: CacheService,
  ttl: number = 300,
  keyGenerator?: (req: Request) => string
) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Never share cached bodies between users: skip authenticated requests
    // unless the caller supplies a key generator (e.g. keyed on user id).
    if (req.method !== 'GET' || (Boolean(req.headers.authorization) && !keyGenerator)) {
      next();
      return;
    }

    const key = keyGenerator ? keyGenerator(req) : `http:${req.originalUrl || req.url}`;

    try {
      const cachedResponse = await cacheService.get<unknown>(key, { prefix: 'http' });
      if (cachedResponse !== null) {
        res.setHeader('X-Cache', 'HIT');
        res.json(cachedResponse);
        return;
      }

      res.setHeader('X-Cache', 'MISS');

      const originalJson = res.json.bind(res);
      res.json = (data: unknown): Response => {
        if (res.statusCode === 200) {
          cacheService
            .set(key, data, { ttl, prefix: 'http' })
            .catch((error: Error) =>
              logger.warn('failed to store response in cache', { message: error.message })
            );
        }
        return originalJson(data);
      };

      next();
    } catch (error) {
      logger.warn('cache middleware error', { message: (error as Error).message });
      next();
    }
  };
};
