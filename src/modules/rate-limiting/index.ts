import type { RateLimitRequestHandler } from 'express-rate-limit';
import { RateLimitService } from './src/rate-limit.service';
import { config } from '../../core/config';
import type { ModuleMetadata } from '../../shared/types';

export * from './src/rate-limit.service';

type Limiters = {
  global: RateLimitRequestHandler;
  strict: RateLimitRequestHandler;
  auth: RateLimitRequestHandler;
  api: RateLimitRequestHandler;
};

export class RateLimitingModule {
  public readonly metadata: ModuleMetadata = {
    name: 'rate-limiting',
    version: '2.0.0',
    description: 'Distributed rate limiting and throttling module',
    enabled: true,
  };

  public readonly service: RateLimitService;
  private _limiters?: Limiters;

  constructor() {
    this.service = new RateLimitService();
  }

  /**
   * Limiters are created lazily so the Redis-backed store (if any) is only
   * attached after core connections have been established. Accessing
   * `module.limiters` before `initialize()` is safe: an in-memory store is used.
   */
  get limiters(): Limiters {
    if (!this._limiters) {
      this._limiters = {
        global: this.service.getGlobalLimiter(),
        strict: this.service.getStrictLimiter(),
        auth: this.service.getAuthLimiter(),
        api: this.service.getApiLimiter(),
      };
    }
    return this._limiters;
  }

  get isEnabled(): boolean {
    return config.rateLimit.enabled;
  }

  async initialize(): Promise<void> {
    // Force construction now that Redis had a chance to connect.
    void this.limiters;
  }

  async shutdown(): Promise<void> {
    this._limiters = undefined;
  }
}

export const rateLimitingModule = new RateLimitingModule();
