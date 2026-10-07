import { BullMQService, bullMQService } from './src/bullmq.service';
import type { ModuleMetadata } from '../../shared/types';

export * from './src/bullmq.service';

export class JobsModule {
  public readonly metadata: ModuleMetadata = {
    name: 'jobs',
    version: '2.0.0',
    description: 'Background job processing and scheduling with BullMQ',
    enabled: true,
  };

  public readonly service: BullMQService;

  constructor() {
    this.service = bullMQService;
  }

  async initialize(): Promise<void> {
    // Queues are created lazily on first use; Redis availability is checked
    // there so a missing broker degrades to a 503 instead of a hang.
  }

  async shutdown(): Promise<void> {
    await this.service.closeAllQueues();
  }
}

export const jobsModule = new JobsModule();
