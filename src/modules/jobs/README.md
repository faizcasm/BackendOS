# Jobs module

Background job processing on BullMQ: named queues, workers with configurable concurrency, and retry/backoff policies.

## Features

- Lazy per-queue `Queue`, `Worker`, and `QueueEvents` instances (created on first use)
- `addJob` and `addBulkJobs` with priority, delay, attempts, and exponential backoff
- `processJobs(queue, processor, concurrency)` workers; duplicate registration for the same queue is a logged no-op
- Queue administration: `getJob`, `getJobCounts`, `pauseQueue`, `resumeQueue`, `drainQueue`, `listQueues`, `closeQueue`
- Defaults: 3 attempts, 5 s exponential backoff, completed jobs kept 24 h (max 1000), failed jobs kept 7 days
- Prometheus counter `backendos_jobs_processed_total{queue,status}` fed by queue events
- Fails fast with `503` when enqueuing while Redis is down instead of hanging
- `closeAllQueues()` runs during module shutdown

## Usage

```typescript
import { jobsModule, bullMQService, BullMQService } from '../../modules/jobs';

// Enqueue (job name = queue name)
await jobsModule.service.addJob('email', { to: 'user@example.com' }, {
  priority: 1,
  delay: 5000,
  attempts: 3,
});

// Process
jobsModule.service.processJobs('email', async (job) => {
  await sendWelcomeEmail(job.data);
}, 5 /* concurrency */);

const counts = await jobsModule.service.getJobCounts('email');
await jobsModule.service.pauseQueue('email');
```

This module exposes no HTTP routes.

## Configuration

| Variable          | Purpose                                       | Default |
| ----------------- | --------------------------------------------- | ------- |
| `REDIS_URL`       | Full Redis URL (overrides host/port)          | unset   |
| `REDIS_HOST`      | Redis host when no URL is set                 | `localhost` |
| `REDIS_PORT`      | Redis port                                     | `6379`  |
| `REDIS_PASSWORD`  | Redis password                                 | unset   |
| `REDIS_DB`        | Redis database index                           | `0`     |
| `REDIS_REQUIRED`  | Fail startup when Redis is unreachable         | `false` |
| `MODULE_JOBS`     | Mount the module                               | `true`  |

## Notes

- BullMQ only — there is no legacy Bull/`job.service` code path.
- Queue names are chosen by the caller at enqueue time; job name always equals the queue name.
- No repeatable/cron scheduler is wired up — use `delay` for deferred work or schedule externally.
- BullMQ receives plain connection options rather than the shared ioredis instance, because it needs its own blocking connections.
