# Deployment Guide

This guide covers running BackendOS in production. The service is a single
Node.js process backed by PostgreSQL (required) and Redis (optional).

## Prerequisites

- Node.js ≥ 20 (or the official Docker image)
- PostgreSQL 14+
- Redis 6+ (optional — set `REDIS_REQUIRED=false` if you skip it)
- A reverse proxy terminating TLS (nginx, Caddy, Traefik, ALB, …)

## 1. Environment configuration

All configuration comes from the environment and is validated by Joi at boot.
See [`.env.example`](./.env.example) for the full list.

**Production boot fails fast** if `NODE_ENV=production` and either:

- `JWT_SECRET` or `JWT_REFRESH_SECRET` still contains a placeholder value, or
- `DATABASE_URL` is missing.

Generate strong secrets:

```bash
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(48).toString('hex'))"
node -e "console.log('JWT_REFRESH_SECRET=' + require('crypto').randomBytes(48).toString('hex'))"
```

Minimum set for production:

```env
NODE_ENV=production
PORT=3000

DATABASE_URL=postgresql://user:password@db-host:5432/backendos?schema=public
JWT_SECRET=<64+ random chars>
JWT_REFRESH_SECRET=<64+ random chars>

REDIS_HOST=redis-host
REDIS_PORT=6379
REDIS_PASSWORD=<if your redis requires auth>
REDIS_REQUIRED=true

LOG_LEVEL=info
CORS_ORIGINS=https://app.example.com
METRICS_ENABLED=true
# METRICS_TOKEN=<random>     # protects GET /metrics
```

Never commit `.env`. Inject secrets through your orchestrator's secret store.

## 2. Build

```bash
npm ci
npx prisma generate   # runs automatically as part of npm run build
npm run build         # outputs dist/
```

Verify with a dry run:

```bash
NODE_ENV=production JWT_SECRET=... JWT_REFRESH_SECRET=... DATABASE_URL=... node dist/server.js
```

## 3. Database migrations

Migrations live in `prisma/migrations` and are applied with:

```bash
npx prisma migrate deploy      # apply all pending migrations (safe/repeatable)
npm run prisma:seed            # optional: demo/seed data
```

Run migrations **before** starting new application code (before/after deploy,
depending on your compatibility strategy). For local development use
`npx prisma migrate dev` instead, which can create and apply migrations.

## 4. Docker

The repository ships a multi-stage [`Dockerfile`](./Dockerfile):

| Stage | Purpose |
| --- | --- |
| `dependencies` | `npm ci` of production dependencies only |
| `build` | full install + `prisma generate` + `npm run build` (also used as the migration image) |
| final | non-root `backendos` user (uid 1001), copies `dist/`, `prisma/` and the generated client, `HEALTHCHECK` on `/api/health/live` |

```bash
docker build -t backendos:2.0.0 .
docker run -d -p 3000:3000 \
  -e NODE_ENV=production \
  -e DATABASE_URL=postgresql://... \
  -e JWT_SECRET=... -e JWT_REFRESH_SECRET=... \
  --name backendos backendos:2.0.0
```

The image runs `node dist/server.js` as a non-root user.

## 5. Docker Compose

[`docker-compose.yml`](./docker-compose.yml) wires everything together:

| Service | Role |
| --- | --- |
| `postgres` | PostgreSQL 16 with healthcheck and persistent volume |
| `redis` | Redis 7 (append-only, 256 MB LRU cap) with healthcheck |
| `migrate` | one-shot: `prisma migrate deploy` + seed, then exits |
| `api` | the application; waits for healthy DB/Redis and a successful migration |
| `prometheus`, `grafana` | optional, `--profile monitoring` |

```bash
export JWT_SECRET=...
export JWT_REFRESH_SECRET=...

docker compose up -d --build                     # app stack
docker compose --profile monitoring up -d        # + Prometheus :9090, Grafana :3001
docker compose logs -f api
```

Override host ports and credentials via environment variables
(`PORT`, `POSTGRES_PORT`, `REDIS_PORT`, `POSTGRES_USER`, …) — see the compose file.

## 6. Without containers (VPS / bare metal)

```bash
npm ci --omit=dev
npm run build
npx prisma migrate deploy
npm start            # node dist/server.js
```

Run it under a process manager, e.g. **PM2**:

```bash
npm i -g pm2
pm2 start dist/server.js --name backendos -i 1
pm2 save
pm2 startup
```

or as a **systemd** unit:

```ini
[Unit]
Description=BackendOS
After=network.target postgresql.service

[Service]
Type=simple
User=backendos
WorkingDirectory=/srv/backendos
Environment=NODE_ENV=production
EnvironmentFile=/etc/backendos/env
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

## 7. Reverse proxy example (nginx)

```nginx
server {
    listen 443 ssl http2;
    server_name api.example.com;

    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    client_max_body_size 20m;   # >= MAX_FILE_SIZE

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Request-Id $request_id;
    }

    # Keep metrics off the public internet
    location = /metrics { allow 10.0.0.0/8; deny all; }
}
```

## 8. Health checks & orchestration

| Endpoint | Use |
| --- | --- |
| `GET /api/health/live` | liveness probe — process is up |
| `GET /api/health/ready` | readiness probe — DB/Redis reachable |
| `GET /api/health` | aggregated status for dashboards |
| `GET /metrics` | Prometheus exposition (guard with `METRICS_TOKEN`) |

The Docker image already declares a `HEALTHCHECK` against `/api/health/live`.
For Kubernetes, wire `livenessProbe` to `/live` and `readinessProbe` to `/ready`.

## 9. Observability

- **Logs**: structured JSON via Winston (`LOG_LEVEL`). Ship container stdout to
  your log collector.
- **Metrics**: Prometheus scrapes `/metrics`; Grafana dashboards are provisioned
  from [`monitoring/grafana`](./monitoring/grafana).
- **Alerting**: alert on 5xx ratio, p95 latency, readiness failures and queue
  depth (`backendos_jobs_processed_total` by status).

## 10. Production checklist

- [ ] Strong, unique `JWT_SECRET` and `JWT_REFRESH_SECRET` (rotated, stored in a secret manager)
- [ ] `NODE_ENV=production` and boot-time config validation passing
- [ ] TLS terminated at the proxy; `CORS_ORIGINS` restricted to your front end
- [ ] `prisma migrate deploy` run as a separate step before rollout
- [ ] PostgreSQL backups + point-in-time recovery configured
- [ ] Redis persistence/auth configured (or `REDIS_REQUIRED=false` deliberately)
- [ ] Rate limiting left enabled on public routes
- [ ] `/metrics` not publicly reachable
- [ ] Health probes wired into your orchestrator
- [ ] Log retention/rotation and error alerting configured
- [ ] Image built from the multi-stage Dockerfile (non-root, minimal surface)
