import Bull, { Queue, Job, JobOptions as BullJobOptions } from 'bull';
import { config } from '../../../shared/utils/config';
import { JobOptions } from '../../../shared/types';

export class JobService {
  private queues: Map<string, Queue> = new Map();

  private getQueue(queueName: string): Queue {
    if (!this.queues.has(queueName)) {
      const queue = new Bull(queueName, {
        redis: {
          host: config.redis.host,
          port: config.redis.port,
          password: config.redis.password,
        },
      });

      queue.on('error', (error) => {
        console.error(`Queue ${queueName} error:`, error);
      });

      this.queues.set(queueName, queue);
    }

    return this.queues.get(queueName)!;
  }

  async addJob(
    queueName: string,
    data: any,
    options?: JobOptions
  ): Promise<Job> {
    const queue = this.getQueue(queueName);
    
    const bullOptions: BullJobOptions = {
      priority: options?.priority,
      delay: options?.delay,
      attempts: options?.attempts || 3,
      backoff: options?.backoff || 5000,
    };

    return queue.add(data, bullOptions);
  }

  async addBulkJobs(
    queueName: string,
    jobs: Array<{ data: any; options?: JobOptions }>
  ): Promise<Job[]> {
    const queue = this.getQueue(queueName);
    
    const bullJobs = jobs.map(job => ({
      data: job.data,
      opts: {
        priority: job.options?.priority,
        delay: job.options?.delay,
        attempts: job.options?.attempts || 3,
        backoff: job.options?.backoff || 5000,
      },
    }));

    return queue.addBulk(bullJobs);
  }

  processJobs(
    queueName: string,
    processor: (job: Job) => Promise<any>,
    concurrency: number = 1
  ): void {
    const queue = this.getQueue(queueName);
    
    queue.process(concurrency, async (job) => {
      try {
        console.log(`Processing job ${job.id} from queue ${queueName}`);
        const result = await processor(job);
        console.log(`Job ${job.id} completed successfully`);
        return result;
      } catch (error) {
        console.error(`Job ${job.id} failed:`, error);
        throw error;
      }
    });

    queue.on('completed', (job) => {
      console.log(`Job ${job.id} has been completed`);
    });

    queue.on('failed', (job, err) => {
      console.log(`Job ${job.id} has failed with error:`, err.message);
    });
  }

  async getJob(queueName: string, jobId: string): Promise<Job | null> {
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
  }

  async resumeQueue(queueName: string): Promise<void> {
    const queue = this.getQueue(queueName);
    await queue.resume();
  }

  async emptyQueue(queueName: string): Promise<void> {
    const queue = this.getQueue(queueName);
    await queue.empty();
  }

  async closeQueue(queueName: string): Promise<void> {
    const queue = this.queues.get(queueName);
    if (queue) {
      await queue.close();
      this.queues.delete(queueName);
    }
  }

  async closeAllQueues(): Promise<void> {
    const closePromises = Array.from(this.queues.keys()).map(queueName =>
      this.closeQueue(queueName)
    );
    await Promise.all(closePromises);
  }
}
