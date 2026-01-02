import { Router } from 'express';
import { MonitoringService } from './src/monitoring.service';
import { createMonitoringRoutes } from './src/monitoring.controller';
import { ModuleMetadata } from '../../shared/types';

export class MonitoringModule {
  public readonly metadata: ModuleMetadata = {
    name: 'monitoring',
    version: '1.0.0',
    description: 'Health checks and system monitoring module',
    enabled: true,
  };

  public readonly service: MonitoringService;
  public readonly router: Router;

  constructor() {
    this.service = new MonitoringService();
    this.router = createMonitoringRoutes(this.service);
  }

  async initialize(): Promise<void> {
    console.log(`[${this.metadata.name}] Module initialized`);
  }

  async shutdown(): Promise<void> {
    console.log(`[${this.metadata.name}] Module shutdown`);
  }
}

export const monitoringModule = new MonitoringModule();
