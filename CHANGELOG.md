# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-10-07

Production-readiness overhaul: a single validated configuration, a rewritten auth
stack, unified job queues, hardened uploads, a modern toolchain and full
open-source project scaffolding.

### Added

- `src/core/config`: single Joi-validated configuration with production fail-fast
  (placeholder JWT secrets and missing `DATABASE_URL` abort boot).
- `src/server.ts` executable entrypoint (`bin.backendos`, `CMD ["node","dist/server.js"]`);
  `src/index.ts` is now a side-effect-free library barrel.
- Prisma seed script (`prisma/seed.ts`) and `npm run prisma:*` scripts.
- Multi-stage, non-root `Dockerfile` (Node 22) with container healthcheck, plus a
  new `.dockerignore`.
- `migrate` service in `docker-compose.yml` running `prisma migrate deploy` + seed
  before the API starts; `monitoring` compose profile for Prometheus/Grafana.
- Grafana provisioning (`monitoring/grafana/`) with a Prometheus datasource and an
  overview dashboard matching the app's real metric names.
- ESLint 9 flat config (`eslint.config.mjs`) replacing `.eslintrc.json`.
- Jest coverage thresholds and a hermetic test suite (`tests/`) — 82 tests that
  need no database or Redis.
- CI rewrite (`.github/workflows/ci-cd.yml`): Node 20/22 matrix, lint/format/typecheck,
  tests with coverage, production build, Docker build/publish, dependency audit,
  Trivy and CodeQL; Dependabot configuration.
- Open-source scaffolding: `LICENSE` (MIT), `CODE_OF_CONDUCT.md`, expanded
  `CONTRIBUTING.md`, issue templates, pull request template.
- `compression`, `rate-limit-redis`, `swagger-ui-express`, `@prisma/adapter-pg` added.

### Changed

- Auth is now Prisma-backed: refresh tokens are opaque, stored as SHA-256 hashes
  with rotation and reuse detection; added `requireRole`, `optionalAuth` and audit
  logging on auth events.
- Jobs consolidated on BullMQ (the legacy `job.service.ts`/Bull implementation was removed).
- Caching: consistent key prefixes and SCAN-based wildcard invalidation instead of `KEYS`.
- Uploads are authenticated and protected against path traversal; S3 storage moved
  to `file-upload/src/s3-storage.service.ts`, selected via `STORAGE_DRIVER=s3`.
- Prisma 7 driver adapter (`@prisma/adapter-pg`) wired up in `src/core/db/prisma.ts`.
- Prisma CLI/dev tooling moved to `devDependencies`; `aws-sdk` v2, `bull`, `redis`,
  `axios`, `morgan`, `uuid` and `pg` removed.
- Jest teardown drains lingering sockets/redis/prisma handles so test workers exit
  cleanly.
- Package bumped to `2.0.0` with repository/bugs/homepage metadata and `engines.node >= 20`.

### Removed

- Orphan `src/modules/ai` and `src/modules/files` modules (superseded by
  `ai-helpers` and `file-upload`).
- `src/shared/utils/config.ts` implementation (kept as a deprecated re-export of
  `src/core/config`).
- Stale `IMPLEMENTATION_SUMMARY.md`.

## [1.0.0] - earlier

Initial modular monolith with auth, rate limiting, caching, jobs, file uploads,
logging, monitoring and AI helper modules.
