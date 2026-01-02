import { Request, Response, NextFunction } from 'express';
import { CacheService } from './cache.service';

export const createCacheMiddleware = (
  cacheService: CacheService,
  ttl: number = 300,
  keyGenerator?: (req: Request) => string
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET') {
      return next();
    }

    const key = keyGenerator 
      ? keyGenerator(req) 
      : `cache:${req.originalUrl || req.url}`;

    try {
      const cachedResponse = await cacheService.get(key);
      
      if (cachedResponse) {
        return res.json(cachedResponse);
      }

      const originalJson = res.json.bind(res);
      
      res.json = function (data: any) {
        cacheService.set(key, data, { ttl });
        return originalJson(data);
      };

      next();
    } catch (error) {
      next();
    }
  };
};
