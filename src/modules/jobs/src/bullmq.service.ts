import { Queue, Worker, QueueEvents, type Job, type JobsOptions } from 'bullmq';
import { redisClient } from '../../../core/redis';
import { logger } from '../../../core/logger';
import { ServiceUnavailableError } from '../../../core/errors';
import { jobsProcessed } from '../../../core/middlewares/metrics';
import type { JobOptions } from '../../../shared/types';

const DEFAULT_BACKOFF_MS = 5000;

/**
 * BullMQ backed job queues.
 *
 * Connection notes:
 * - BullMQ receives plain connection *options* (never a shared ioredis
 *   instance) because it opens duplicate connections for blocking commands.
 * - Enqueuing while Redis is down fails fast with a 503 instead of hanging.
 */
export class BullMQService {
  private queues: Map<string, Queue> = new Map();
  private workers: Map<string, Worker> = new Map();
  private queueEvents: Map<string, QueueEvents> = new Map();

  private ensureRedis(): void {
    if (!redisClient.isReady()) {
      throw new ServiceUnavailableError('Job queues are unavailable: Redis is not connected');
    }
  }

  private getQueue(queueName: string): Queue {
    const existing = this.queues.get(queueName);
    if (existing) return existing;

    const queue = new Queue(queueName, { connection: redisClient.getBullMQOptions() });
    queue.on('error', (error: Error) => {
      logger.error('queue error', { queue: queueName, message: error.message });
    });
    this.queues.set(queueName, queue);

    const queueEvents = new QueueEvents(queueName, {
      connection: redisClient.getBullMQOptions(),
    });
    queueEvents.on('completed', () => {
      jobsProcessed.inc({ queue: queueName, status: 'completed' });
    });
    queueEvents.on('failed', () => {
      jobsProcessed.inc({ queue: queueName, status: 'failed' });
    });
    queueEvents.on('error', (error: Error) => {
      logger.error('queue events error', { queue: queueName, message: error.message });
    });
    this.queueEvents.set(queueName, queueEvents);

    return queue;
  }

  async addJob(
    queueName: string,
    data: Record<string, unknown>,
    options?: JobOptions
  ): Promise<Job> {
    this.ensureRedis();
    const queue = this.getQueue(queueName);
    return queue.add(queueName, data, this.toJobsOptions(options));
  }

  async addBulkJobs(
    queueName: string,
    jobs: Array<{ data: Record<string, unknown>; options?: JobOptions }>
  ): Promise<Job[]> {
    this.ensureRedis();
    const queue = this.getQueue(queueName);
    return queue.addBulk(
      jobs.map((job) => ({
        name: queueName,
        data: job.data,
        opts: this.toJobsOptions(job.options),
      }))
    );
  }

  private toJobsOptions(options?: JobOptions): JobsOptions {
    return {
      priority: options?.priority,
      delay: options?.delay,
      attempts: options?.attempts ?? 3,
      backoff: {
        type: 'exponential',
        delay: options?.backoff ?? DEFAULT_BACKOFF_MS,
      },
      removeOnComplete: { age: 24 * 3600, count: 1000 },
      removeOnFail: { age: 7 * 24 * 3600 },
    };
  }

  /**
   * Registers a processor for a queue. Safe to call more than once for the
   * same queue (the second call is a no-op instead of crashing BullMQ).
   */
  processJobs(queueName: string, processor: (job: Job) => Promise<unknown>, concurrency = 1): void {
    if (this.workers.has(queueName)) {
      logger.warn('worker already registered for queue', { queue: queueName });
      return;
    }

    this.ensureRedis();

    const worker = new Worker(
      queueName,
      async (job: Job) => {
        logger.debug('processing job', { queue: queueName, jobId: job.id });
        return processor(job);
      },
      { connection: redisClient.getBullMQOptions(), concurrency }
    );

    worker.on('completed', ({ id }: Job) => {
      logger.info('job completed', { queue: queueName, jobId: id });
    });

    worker.on('failed', (job: Job | undefined, error: Error) => {
      logger.error('job failed', {
        queue: queueName,
        jobId: job?.id,
        message: error.message,
      });
      jobsProcessed.inc({ queue: queueName, status: 'failed' });
    });

    worker.on('error', (error: Error) => {
      logger.error('worker error', { queue: queueName, message: error.message });
    });

    this.workers.set(queueName, worker);
  }

  async getJob(queueName: string, jobId: string): Promise<Job | undefined> {
    return this.getQueue(queueName).getJob(jobId);
  }

  async getJobCounts(queueName: string) {
    return this.getQueue(queueName).getJobCounts();
  }

  async pauseQueue(queueName: string): Promise<void> {
    await this.getQueue(queueName).pause();
    logger.info('queue paused', { queue: queueName });
  }

  async resumeQueue(queueName: string): Promise<void> {
    await this.getQueue(queueName).resume();
    logger.info('queue resumed', { queue: queueName });
  }

  async drainQueue(queueName: string): Promise<void> {
    await this.getQueue(queueName).drain();
    logger.info('queue drained', { queue: queueName });
  }

  /** @deprecated use `drainQueue` */
  async emptyQueue(queueName: string): Promise<void> {
    return this.drainQueue(queueName);
  }

  listQueues(): string[] {
    return Array.from(this.queues.keys());
  }

  async closeQueue(queueName: string): Promise<void> {
    const worker = this.workers.get(queueName);
    if (worker) {
      await worker.close();
      this.workers.delete(queueName);
    }

    const queueEvents = this.queueEvents.get(queueName);
    if (queueEvents) {
      await queueEvents.close();
      this.queueEvents.delete(queueName);
    }

    const queue = this.queues.get(queueName);
    if (queue) {
      await queue.close();
      this.queues.delete(queueName);
    }

    logger.info('queue closed', { queue: queueName });
  }

  async closeAllQueues(): Promise<void> {
    await Promise.all(Array.from(this.queues.keys()).map((name) => this.closeQueue(name)));
    this.workers.clear();
    logger.info('all job queues closed');
  }
}

export const bullMQService = new BullMQService();
