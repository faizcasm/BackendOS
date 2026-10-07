# BackendOS

[![CI](https://github.com/faizcasm/BackendOS/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/faizcasm/BackendOS/actions/workflows/ci-cd.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org/)
[![Code Style](https://img.shields.io/badge/code%20style-prettier-ff69b4.svg)](https://prettier.io/)

> A modular monolith backend platform with authentication, rate limiting, caching, background jobs, file uploads, logging and monitoring — ready to run in production.

BackendOS is a single Node.js/TypeScript service that ships the infrastructure features every SaaS backend needs, organized into independent modules you can use as a whole or extract later.

## Features

| Module | What it gives you |
| --- | --- |
| **Auth** | Registration/login, JWT access tokens, opaque refresh tokens (SHA-256 hashed at rest) with rotation and reuse detection, RBAC (`requireRole`), audit logging — all backed by Prisma/PostgreSQL |
| **Rate limiting** | Sliding-window limits via `express-rate-limit`, shared across instances with Redis |
| **Caching** | Redis cache with key prefixing, SCAN-based wildcard invalidation and a cache middleware |
| **Jobs** | BullMQ queues for background and scheduled work |
| **File uploads** | Multer uploads with MIME/size validation, path-traversal-safe downloads, local disk or S3-compatible storage (`STORAGE_DRIVER=s3`) |
| **Logging** | Structured Winston logging with request IDs and quiet-path filtering |
| **Monitoring** | Liveness/readiness probes, JSON system metrics and a Prometheus `/metrics` endpoint |
| **AI helpers** | Prompt templates and completions over OpenAI/Anthropic (optional) |

Cross-cutting: validated environment config (Joi, fail-fast in production), Helmet + CORS + compression, centralized error handling, OpenAPI/Swagger UI at `/api/docs`.

## Requirements

- **Node.js ≥ 20** (CI runs on 20 and 22)
- **PostgreSQL 14+** (for auth and any Prisma-backed data)
- **Redis 6+** (optional — set `REDIS_REQUIRED=false` to run without it; caching, shared rate limits and jobs degrade gracefully or disable)

## Quick start

### Local development

```bash
git clone https://github.com/faizcasm/BackendOS.git
cd BackendOS
npm install
cp .env.example .env          # then edit values
npx prisma migrate dev        # create/apply migrations
npm run prisma:seed           # optional demo data
npm run dev                   # http://localhost:3000
```

### Docker Compose

The compose file runs PostgreSQL, Redis, a one-shot migration job and the API:

```bash
# Required: set strong secrets first
export JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
export JWT_REFRESH_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")

docker compose up -d          # api + postgres + redis + migrations
docker compose --profile monitoring up -d   # + Prometheus (:9090) and Grafana (:3001)
```

The API image is a multi-stage, non-root build (`docker build -t backendos .`), and the container health check hits `GET /api/health/live`.

## Configuration

All configuration is environment-driven, validated at boot by Joi, and documented in [`.env.example`](./.env.example). Production boot **fails fast** if placeholder JWT secrets are used or `DATABASE_URL` is missing.

```env
NODE_ENV=development
PORT=3000

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/backendos?schema=public

JWT_SECRET=change-me
JWT_REFRESH_SECRET=change-me-too

REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_REQUIRED=false

STORAGE_DRIVER=local         # or: s3
LOG_LEVEL=info
METRICS_ENABLED=true
```

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for how configuration and modules fit together.

## API

Interactive Swagger documentation is served at **`/api/docs`** when `DOCS_ENABLED=true` (default).

### Health & observability

```http
GET /api/health          # aggregated health summary
GET /api/health/live     # liveness probe
GET /api/health/ready    # readiness probe (DB/Redis)
GET /api/health/metrics  # JSON process/system metrics
GET /metrics             # Prometheus exposition (optional METRICS_TOKEN guard)
```

### Authentication

```http
POST /api/auth/register        { "email", "password" }
POST /api/auth/login           { "email", "password" }
POST /api/auth/refresh         { "refreshToken" }      # rotates, detects reuse
POST /api/auth/logout          { "refreshToken" }
POST /api/auth/logout-all                                  # revoke all sessions
GET  /api/auth/me             Authorization: Bearer <token>
POST /api/auth/change-password Authorization: Bearer <token>
GET  /api/auth/users          Authorization: Bearer <admin token>
DELETE /api/auth/me           Authorization: Bearer <token>
```

### File uploads

```http
POST /api/upload/single           multipart/form-data, field "file"
POST /api/upload/multiple         multipart/form-data, field "files" (max 10)
GET  /api/upload/                 list uploaded files
GET  /api/upload/:filename/download
DELETE /api/upload/:filename
GET  /api/upload/meta/limits      current size/type limits
```

Upload routes are authenticated and filenames are sanitized against path traversal.

### AI helpers

```http
POST /api/ai/complete           { "prompt", "provider", "model?", "temperature?", "maxTokens?" }
POST /api/ai/explain            { "path", "method?", "provider" }
POST /api/ai/analyze-logs       { "logs": [...], "error?", "context?", "provider" }
GET  /api/ai/templates
POST /api/ai/template/:name     { "variables", "provider?", "model?", "temperature?" }
```

## Usage as a library

Modules are exported from `src/index.ts` (compiled to `dist/index.js`) and can also be embedded in your own Express app:

```typescript
import { cachingModule, jobsModule, authModule } from 'backendos';

await cachingModule.service.set('key', 'value', { ttl: 300 });
const value = await cachingModule.service.get('key');

await jobsModule.service.addJob('email', { to: 'user@example.com' });
```

Runnable examples live in [`examples/`](./examples):

```bash
npm run example:basic
npm run example:full
```

## Development

```bash
npm run dev            # ts-node + nodemon
npm run lint           # ESLint (flat config)
npm run format         # Prettier write  /  npm run format:check
npm run typecheck      # tsc for src and tests
npm test               # Jest (hermetic — no DB/Redis needed)
npm run test:ci        # Jest + coverage thresholds
npm run build          # prisma generate + tsc → dist/
npm start              # node dist/server.js
```

## Project structure

```
src/
├── core/               # app bootstrap, config, db, redis, logger, middlewares, docs
├── modules/            # feature modules (auth, caching, jobs, file-upload, …)
├── shared/             # shared types and utilities
├── index.ts            # library barrel (side-effect free)
└── server.ts           # executable entrypoint
prisma/                 # schema, migrations, seed
tests/                  # Jest suites
monitoring/             # Prometheus + Grafana provisioning
examples/               # usage examples
```

Each module exposes its public API from `index.ts` and keeps internals under `src/`. See [ARCHITECTURE.md](./ARCHITECTURE.md) and the per-module READMEs:

[Auth](./src/modules/auth/README.md) ·
[Rate limiting](./src/modules/rate-limiting/README.md) ·
[Caching](./src/modules/caching/README.md) ·
[Jobs](./src/modules/jobs/README.md) ·
[File upload](./src/modules/file-upload/README.md) ·
[Logging](./src/modules/logging/README.md) ·
[Monitoring](./src/modules/monitoring/README.md) ·
[AI helpers](./src/modules/ai-helpers/README.md)

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for PM2, Docker, Compose and cloud deployments. In short:

```bash
npm ci
npm run build
npx prisma migrate deploy      # apply migrations
npm start
```

## Security

- Helmet security headers, CORS allow-list, compression
- Global + per-route rate limiting (Redis-backed when available)
- Bcrypt password hashing, short-lived access tokens, rotating refresh tokens with reuse detection
- Upload validation, authenticated download/delete, path-traversal protection
- Non-root Docker image, secrets injected via environment

Report vulnerabilities per [SECURITY.md](./SECURITY.md) — please do not open public issues for security reports.

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md) for setup, style, and PR guidelines. All changes must pass `lint`, `typecheck`, `format:check`, tests and build in CI.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).

## License

[MIT](./LICENSE) © faizcasm
