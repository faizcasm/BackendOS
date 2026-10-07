import type { Router } from 'express';
import { MonitoringService } from './src/monitoring.service';
import { createMonitoringRoutes } from './src/monitoring.controller';
import type { ModuleMetadata } from '../../shared/types';

export * from './src/monitoring.service';
export * from './src/monitoring.controller';

export class MonitoringModule {
  public readonly metadata: ModuleMetadata = {
    name: 'monitoring',
    version: '2.0.0',
    description: 'Health checks, readiness probes and system metrics',
    enabled: true,
  };

  public readonly service: MonitoringService;
  public readonly router: Router;

  constructor() {
    this.service = new MonitoringService();
    this.router = createMonitoringRoutes(this.service);
  }

  async initialize(): Promise<void> {
    this.service.registerDefaultChecks();
  }

  async shutdown(): Promise<void> {
    // Health checks are stateless.
  }
}

export const monitoringModule = new MonitoringModule();
