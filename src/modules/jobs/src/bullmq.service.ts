import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import { redisClient } from '../../../core/redis';
import { logger } from '../../../core/logger';
import { jobsProcessed } from '../../../core/middlewares/metrics';
import { JobOptions } from '../../../shared/types';

export class BullMQService {
  private queues: Map<string, Queue> = new Map();
  private workers: Map<string, Worker> = new Map();
  private queueEvents: Map<string, QueueEvents> = new Map();

  private getQueue(queueName: string): Queue {
    if (!this.queues.has(queueName)) {
      const queue = new Queue(queueName, {
        connection: redisClient.getClient(),
      });

      queue.on('error', (error) => {
        logger.error(`Queue ${queueName} error`, { error: error.message });
      });

      this.queues.set(queueName, queue);

      // Set up queue events
      const queueEvents = new QueueEvents(queueName, {
        connection: redisClient.getClient(),
      });

      queueEvents.on('completed', ({ jobId }) => {
        logger.info(`Job completed`, { queue: queueName, jobId });
        jobsProcessed.inc({ queue: queueName, status: 'completed' });
      });

      queueEvents.on('failed', ({ jobId, failedReason }) => {
        logger.error(`Job failed`, { queue: queueName, jobId, reason: failedReason });
        jobsProcessed.inc({ queue: queueName, status: 'failed' });
      });

      this.queueEvents.set(queueName, queueEvents);
    }

    return this.queues.get(queueName)!;
  }

  async addJob(
    queueName: string,
    data: any,
    options?: JobOptions
  ): Promise<Job> {
    const queue = this.getQueue(queueName);

    return queue.add(queueName, data, {
      priority: options?.priority,
      delay: options?.delay,
      attempts: options?.attempts || 3,
      backoff: {
        type: 'exponential',
        delay: options?.backoff || 5000,
      },
    });
  }

  async addBulkJobs(
    queueName: string,
    jobs: Array<{ data: any; options?: JobOptions }>
  ): Promise<Job[]> {
    const queue = this.getQueue(queueName);

    const bullMQJobs = jobs.map(job => ({
      name: queueName,
      data: job.data,
      opts: {
        priority: job.options?.priority,
        delay: job.options?.delay,
        attempts: job.options?.attempts || 3,
        backoff: {
          type: 'exponential',
          delay: job.options?.backoff || 5000,
        },
      },
    }));

    return queue.addBulk(bullMQJobs);
  }

  processJobs(
    queueName: string,
    processor: (job: Job) => Promise<any>,
    concurrency: number = 1
  ): void {
    if (this.workers.has(queueName)) {
      logger.warn(`Worker for queue ${queueName} already exists`);
      return;
    }

    const worker = new Worker(
      queueName,
      async (job: Job) => {
        try {
          logger.info(`Processing job`, { queue: queueName, jobId: job.id });
          const result = await processor(job);
          logger.info(`Job completed successfully`, { queue: queueName, jobId: job.id });
          return result;
        } catch (error: any) {
          logger.error(`Job processing failed`, {
            queue: queueName,
            jobId: job.id,
            error: error.message,
          });
          throw error;
        }
      },
      {
        connection: redisClient.getClient(),
        concurrency,
      }
    );

    worker.on('error', (error) => {
      logger.error(`Worker error for queue ${queueName}`, { error: error.message });
    });

    this.workers.set(queueName, worker);
  }

  async getJob(queueName: string, jobId: string): Promise<Job | undefined> {
    const queue = this.getQueue(queueName);
    return queue.getJob(jobId);
  }

  async getJobCounts(queueName: string) {
    const queue = this.getQueue(queueName);
    return queue.getJobCounts();
  }

  async pauseQueue(queueName: string): Promise<void> {
    const queue = this.getQueue(queueName);
    await queue.pause();
    logger.info(`Queue paused`, { queue: queueName });
  }

  async resumeQueue(queueName: string): Promise<void> {
    const queue = this.getQueue(queueName);
    await queue.resume();
    logger.info(`Queue resumed`, { queue: queueName });
  }

  async emptyQueue(queueName: string): Promise<void> {
    const queue = this.getQueue(queueName);
    await queue.drain();
    logger.info(`Queue emptied`, { queue: queueName });
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

    logger.info(`Queue closed`, { queue: queueName });
  }

  async closeAllQueues(): Promise<void> {
    const closePromises = Array.from(this.queues.keys()).map(queueName =>
      this.closeQueue(queueName)
    );
    await Promise.all(closePromises);
    logger.info('All queues closed');
  }
}

export const bullMQService = new BullMQService();
