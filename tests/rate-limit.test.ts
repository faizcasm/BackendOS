import express from 'express';
import request from 'supertest';
import { RateLimitService } from '../src/modules/rate-limiting/src/rate-limit.service';

const buildApp = (limiter: ReturnType<RateLimitService['createLimiter']>) => {
  const app = express();
  app.get('/limited', limiter, (_req, res) => res.json({ ok: true }));
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(err.statusCode ?? 500).json({ error: err.message, code: err.code });
  });
  return app;
};

describe('RateLimitService', () => {
  it('creates limiters with configurable windows', () => {
    const service = new RateLimitService();
    const limiter = service.createLimiter({ windowMs: 60_000, max: 2, prefix: 'unit' });

    expect(typeof limiter).toBe('function');
  });

  it('allows requests under the budget and rejects the overflow', async () => {
    const service = new RateLimitService();
    const limiter = service.createLimiter({ windowMs: 60_000, max: 2, prefix: 'burst' });
    const app = buildApp(limiter);

    expect((await request(app).get('/limited')).status).toBe(200);
    expect((await request(app).get('/limited')).status).toBe(200);

    const limited = await request(app).get('/limited');
    expect(limited.status).toBe(429);
    expect(limited.body).toMatchObject({ code: 'RATE_LIMITED' });
    expect(limited.headers['retry-after']).toBeDefined();
  });

  it('emits standard rate limit headers so clients can back off', async () => {
    const service = new RateLimitService();
    const app = buildApp(service.createLimiter({ windowMs: 60_000, max: 5, prefix: 'headers' }));

    const res = await request(app).get('/limited');

    const standardHeader = Object.keys(res.headers).find((name) =>
      name.toLowerCase().startsWith('ratelimit-')
    );
    expect(standardHeader).toBeDefined();
  });

  it('ships the documented presets', () => {
    const service = new RateLimitService();

    expect(typeof service.getGlobalLimiter()).toBe('function');
    expect(typeof service.getAuthLimiter()).toBe('function');
    expect(typeof service.getStrictLimiter()).toBe('function');
    expect(typeof service.getApiLimiter()).toBe('function');
  });
});
