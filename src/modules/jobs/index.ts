import { JobService } from './src/job.service';
import { ModuleMetadata } from '../../shared/types';

export class JobsModule {
  public readonly metadata: ModuleMetadata = {
    name: 'jobs',
    version: '1.0.0',
    description: 'Background job processing and task scheduling module',
    enabled: true,
  };

  public readonly service: JobService;

  constructor() {
    this.service = new JobService();
  }

  async initialize(): Promise<void> {
    console.log(`[${this.metadata.name}] Module initialized`);
  }

  async shutdown(): Promise<void> {
    await this.service.closeAllQueues();
    console.log(`[${this.metadata.name}] Module shutdown`);
  }
}

export const jobsModule = new JobsModule();
