# Jobs Module

Provides background job processing and task scheduling using Bull queue.

## Features
- Background job processing
- Job scheduling with delays
- Priority queues
- Job retry mechanism with backoff
- Job status tracking
- Event-based job monitoring

## Job Types
- Immediate jobs
- Delayed jobs
- Recurring jobs (cron-like)
- Priority-based jobs

## Usage

```typescript
import { jobsModule } from './modules/jobs';

// Add a job
await jobsModule.service.addJob('email', {
  to: 'user@example.com',
  subject: 'Welcome'
}, {
  priority: 1,
  delay: 5000,
  attempts: 3
});

// Process jobs
jobsModule.service.processJobs('email', async (job) => {
  // Process job logic
  console.log('Processing:', job.data);
});
```
