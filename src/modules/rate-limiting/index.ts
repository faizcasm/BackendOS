import { RateLimitService } from './src/rate-limit.service';
import { ModuleMetadata } from '../../shared/types';

export class RateLimitingModule {
  public readonly metadata: ModuleMetadata = {
    name: 'rate-limiting',
    version: '1.0.0',
    description: 'Rate limiting and throttling module',
    enabled: true,
  };

  public readonly service: RateLimitService;
  public readonly limiters: {
    global: ReturnType<RateLimitService['getGlobalLimiter']>;
    strict: ReturnType<RateLimitService['getStrictLimiter']>;
    auth: ReturnType<RateLimitService['getAuthLimiter']>;
    api: ReturnType<RateLimitService['getApiLimiter']>;
  };

  constructor() {
    this.service = new RateLimitService();
    this.limiters = {
      global: this.service.getGlobalLimiter(),
      strict: this.service.getStrictLimiter(),
      auth: this.service.getAuthLimiter(),
      api: this.service.getApiLimiter(),
    };
  }

  async initialize(): Promise<void> {
    console.log(`[${this.metadata.name}] Module initialized`);
  }

  async shutdown(): Promise<void> {
    console.log(`[${this.metadata.name}] Module shutdown`);
  }
}

export const rateLimitingModule = new RateLimitingModule();
