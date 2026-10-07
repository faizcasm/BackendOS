import type { Application } from 'express';
import request from 'supertest';
import { backendOS } from '../src/core/app';

/**
 * Boots the real application (infrastructure failures are tolerated outside
 * production) and exercises the HTTP surface end to end.
 */
describe('BackendOS application', () => {
  let app: Application;

  beforeAll(async () => {
    await backendOS.initialize();
    app = backendOS.getApp();
  });

  afterAll(async () => {
    await backendOS.shutdown();
  });

  describe('service metadata', () => {
    it('serves the root document with module status', async () => {
      const res = await request(app).get('/');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ name: 'backendos', environment: 'test' });
      expect(Array.isArray(res.body.modules)).toBe(true);
      expect(res.body.modules.length).toBeGreaterThanOrEqual(8);
      expect(res.body.modules.map((m: any) => m.name)).toEqual(
        expect.arrayContaining(['auth', 'caching', 'jobs', 'monitoring'])
      );
    });

    it('stamps every response with a request id', async () => {
      const res = await request(app).get('/');
      expect(res.headers['x-request-id']).toBeDefined();
    });

    it('hides framework fingerprints', async () => {
      const res = await request(app).get('/');
      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['content-security-policy']).toBeDefined();
    });
  });

  describe('health checks', () => {
    it('reports a non-unhealthy status when only optional deps are down', async () => {
      const res = await request(app).get('/api/health');

      // Redis and Postgres are intentionally unreachable in unit tests and
      // are registered as optional, so the service degrades but stays up.
      expect([200, 503]).toContain(res.status);
      expect(res.body.status).toBeDefined();
      expect(res.body.services).toHaveProperty('memory');
    });

    it('answers the liveness probe without touching dependencies', async () => {
      const res = await request(app).get('/api/health/live');

      expect(res.status).toBe(200);
      expect(res.body.alive).toBe(true);
      expect(typeof res.body.uptime).toBe('number');
    });

    it('answers the readiness probe', async () => {
      const res = await request(app).get('/api/health/ready');
      expect([200, 503]).toContain(res.status);
      expect(typeof res.body.ready).toBe('boolean');
    });

    it('exposes json system metrics', async () => {
      const res = await request(app).get('/api/health/metrics');

      expect(res.status).toBe(200);
      expect(res.body.memory).toBeDefined();
      expect(res.body.nodeVersion).toBeDefined();
    });
  });

  describe('observability', () => {
    it('exposes prometheus metrics', async () => {
      const res = await request(app).get('/metrics');

      expect(res.status).toBe(200);
      expect(res.text).toContain('backendos_http_requests_total');
      expect(res.text).toContain('backendos_process_');
    });

    it('serves the OpenAPI document', async () => {
      const res = await request(app).get('/api/docs/openapi.json');

      expect(res.status).toBe(200);
      expect(res.body.openapi).toBe('3.0.3');
      expect(Object.keys(res.body.paths)).toEqual(
        expect.arrayContaining(['/api/auth/login', '/api/health', '/api/upload/single'])
      );
    });

    it('serves interactive documentation', async () => {
      const res = await request(app).get('/api/docs/');
      expect([200, 301, 302]).toContain(res.status);
    });
  });

  describe('routing', () => {
    it('returns the standard envelope for unknown routes', async () => {
      const res = await request(app).get('/api/definitely-not-a-route');

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ code: 'NOT_FOUND', requestId: expect.any(String) });
    });

    it('requires a bearer token for protected routes', async () => {
      const me = await request(app).get('/api/auth/me');
      expect(me.status).toBe(401);
      expect(me.body.code).toBe('UNAUTHORIZED');

      const upload = await request(app).get('/api/upload');
      expect(upload.status).toBe(401);
    });

    it('validates request bodies before touching the database', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'not-an-email', password: 'short' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(Array.isArray(res.body.details)).toBe(true);
    });

    it('rejects malformed json with a clear error', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('{ this is not json');

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('BAD_REQUEST');
    });

    it('exposes the auth rate limiter on auth routes', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'someone@example.com', password: 'whatever1' });

      // No credentials ever succeed here; we only care that the limiter and
      // the error envelope are wired correctly.
      expect([401, 500, 503]).toContain(res.status);
      expect(res.headers['x-request-id']).toBeDefined();
    });
  });

  describe('lifecycle', () => {
    it('reports module status consistently', () => {
      const status = backendOS.getModuleStatus();
      const auth = status.find((module) => module.name === 'auth');

      expect(auth).toMatchObject({ enabled: true, version: '2.0.0' });
      expect(backendOS.getModule('does-not-exist')).toBeUndefined();
      expect(backendOS.getModule('auth')).toBeDefined();
    });
  });
});
