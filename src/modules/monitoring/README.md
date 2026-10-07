# Monitoring module

Health checks, readiness/liveness probes, and process metrics for the running service.

## Features

- Health endpoints under `/api/health` with pluggable, optionally non-critical checks
- Default checks registered on startup: database, Redis, cache backend, memory heap
- Aggregated status `healthy` / `degraded` / `unhealthy`; only a failed critical check yields HTTP 503
- Uptime tracking and JSON system metrics (memory, CPU, load average, Node/platform info)
- Custom checks via `addHealthCheck(name, fn, { optional })` with per-check latency reporting
- Prometheus exposition (handled by core at `METRICS_PATH`) with an optional bearer/token guard

## Usage

```typescript
import { monitoringModule } from '../../modules/monitoring';

// Mounted by the core app at /api/health (probe paths skip the global limiter)
app.use('/api/health', monitoringModule.router);

monitoringModule.service.addHealthCheck(
  'search',
  async () => ({ status: 'up', latency: 3 }),
  { optional: true }
);

const ready = await monitoringModule.service.isReady(); // health.status !== 'unhealthy'
```

### HTTP routes

| Method | Path                     | Notes                                     |
| ------ | ------------------------ | ----------------------------------------- |
| GET    | `/api/health`            | Full dependency report; 503 when unhealthy |
| GET    | `/api/health/ready`      | 200 unless a critical check fails         |
| GET    | `/api/health/live`       | Liveness probe: process uptime only       |
| GET    | `/api/health/metrics`    | JSON process/system metrics               |

## Configuration

| Variable           | Purpose                                        | Default |
| ------------------ | ---------------------------------------------- | ------- |
| `METRICS_ENABLED`  | Serve Prometheus metrics and record request metrics | `true` |
| `METRICS_PATH`     | Metrics endpoint path                          | `/metrics` |
| `METRICS_TOKEN`    | Bearer/`?token=` guard for the metrics endpoint | unset   |
| `MODULE_MONITORING`| Mount the module                               | `true`  |

## Notes

- Check criticality: database is critical only when `DATABASE_URL` is set, Redis only when `REDIS_REQUIRED`, cache is always optional, memory is critical (down above 95% heap usage).
- The global limiter skips exactly `/api/health`, `/api/health/ready`, `/api/health/live`, and `METRICS_PATH`; the access log skips `/metrics`, `/api/health/live`, and `/api/health/ready` on success.
- Metric names: `backendos_http_requests_total`, `backendos_http_request_duration_seconds`, `backendos_http_request_errors_total`, `backendos_auth_attempts_total`, `backendos_file_uploads_total`, `backendos_jobs_processed_total`, plus runtime metrics prefixed `backendos_`.
