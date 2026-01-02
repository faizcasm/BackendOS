import rateLimit from 'express-rate-limit';
import { config } from '../../../shared/utils/config';
import { RateLimitConfig } from '../../../shared/types';

export class RateLimitService {
  createLimiter(customConfig?: Partial<RateLimitConfig>) {
    const rateLimitConfig: RateLimitConfig = {
      windowMs: customConfig?.windowMs || config.rateLimit.windowMs,
      max: customConfig?.max || config.rateLimit.maxRequests,
      message: customConfig?.message || 'Too many requests, please try again later.',
    };

    return rateLimit({
      windowMs: rateLimitConfig.windowMs,
      max: rateLimitConfig.max,
      message: { error: rateLimitConfig.message },
      standardHeaders: true,
      legacyHeaders: false,
    });
  }

  // Pre-configured rate limiters
  getGlobalLimiter() {
    return this.createLimiter();
  }

  getStrictLimiter() {
    return this.createLimiter({
      windowMs: 15 * 60 * 1000,
      max: 10,
      message: 'Too many requests from this IP, please try again after 15 minutes',
    });
  }

  getAuthLimiter() {
    return this.createLimiter({
      windowMs: 15 * 60 * 1000,
      max: 5,
      message: 'Too many authentication attempts, please try again later',
    });
  }

  getApiLimiter() {
    return this.createLimiter({
      windowMs: 60 * 1000,
      max: 60,
      message: 'API rate limit exceeded',
    });
  }
}
