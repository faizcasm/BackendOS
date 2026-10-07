import express from 'express';
import request from 'supertest';
import { requestIdMiddleware, REQUEST_ID_HEADER } from '../src/core/middlewares/request-id';
import { metricsAuthGuard, metricsHandler } from '../src/core/middlewares/metrics';
import { notFoundHandler } from '../src/core/middlewares/not-found';
import { errorHandler } from '../src/core/middlewares/error-handler';
import { buildCorsOptions } from '../src/core/middlewares/security';
import { NotFoundError, UnauthorizedError } from '../src/core/errors';

const buildApp = () => {
  const app = express();
  app.use(requestIdMiddleware);
  app.get('/ok', (req, res) => res.json({ requestId: req.requestId, hasLogger: Boolean(req.log) }));
  app.get('/guarded', metricsAuthGuard, (_req, res) => res.status(200).send('metrics-ok'));
  app.get('/metrics', metricsHandler);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
};

describe('request id middleware', () => {
  it('generates an id and exposes a request logger', async () => {
    const res = await request(buildApp()).get('/ok');

    expect(res.status).toBe(200);
    expect(res.body.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.hasLogger).toBe(true);
    expect(res.headers['x-request-id']).toBe(res.body.requestId);
  });

  it('honours an inbound correlation id from an upstream gateway', async () => {
    const res = await request(buildApp()).get('/ok').set(REQUEST_ID_HEADER, 'gateway-id-42');

    expect(res.body.requestId).toBe('gateway-id-42');
  });

  it('ignores malformed inbound ids', async () => {
    const res = await request(buildApp())
      .get('/ok')
      .set(REQUEST_ID_HEADER, 'not a valid id <script>');

    expect(res.body.requestId).not.toBe('not a valid id <script>');
    expect(res.body.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('metrics endpoint protection', () => {
  it('allows scrapes when no token is configured', async () => {
    const res = await request(buildApp()).get('/guarded');
    expect(res.status).toBe(200);
  });

  it('renders the prometheus exposition format', async () => {
    const res = await request(buildApp()).get('/metrics');

    expect(res.status).toBe(200);
    expect(res.text).toContain('backendos_http_requests_total');
    expect(res.headers['content-type']).toContain('text/plain');
  });
});

describe('cors allow-list', () => {
  it('reflects origins in development (wildcard default)', () => {
    const options = buildCorsOptions();

    // Wildcard mode uses the `origin: true` shortcut (reflect any origin).
    expect(options.origin).toBe(true);
    expect(options.credentials).toBe(false);
  });

  it('rejects origins outside an explicit allow-list', () => {
    const previous = process.env.CORS_ORIGINS;
    process.env.CORS_ORIGINS = 'https://app.example.com';

    jest.resetModules();
    const { buildCorsOptions: build } = require('../src/core/middlewares/security');
    const options = build();

    if (previous === undefined) delete process.env.CORS_ORIGINS;
    else process.env.CORS_ORIGINS = previous;

    const origin = options.origin as (
      value: string | undefined,
      cb: (error: Error | null, allowed?: boolean) => void
    ) => void;

    origin('https://evil.example', (error, allowed) => {
      expect(error).toBeNull();
      expect(allowed).toBe(false);
    });

    origin('https://app.example.com', (error, allowed) => {
      expect(error).toBeNull();
      expect(allowed).toBe(true);
    });
  });

  it('exposes correlation headers to browsers', () => {
    expect(buildCorsOptions().exposedHeaders).toContain('X-Request-Id');
  });
});

describe('terminal 404 handler', () => {
  it('produces the standard error envelope', async () => {
    const res = await request(buildApp()).get('/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      code: 'NOT_FOUND',
      requestId: expect.any(String),
    });
    expect(res.body.error).toContain('/does-not-exist');
  });
});

describe('error propagation helpers', () => {
  it('forwards UnauthorizedError through the envelope', async () => {
    const app = express();
    app.use(requestIdMiddleware);
    app.get('/secret', (_req, _res, next) => next(new UnauthorizedError('nope')));
    app.use(errorHandler);

    const res = await request(app).get('/secret');

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'nope', code: 'UNAUTHORIZED' });
  });

  it('keeps NotFoundError codes stable', () => {
    const error = new NotFoundError('gone');
    expect(error.code).toBe('NOT_FOUND');
    expect(error.statusCode).toBe(404);
  });
});
