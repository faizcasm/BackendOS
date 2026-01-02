import { HealthCheck } from '../../../shared/types';

export class MonitoringService {
  private startTime: Date;
  private healthChecks: Map<string, () => Promise<{ status: 'up' | 'down'; latency?: number }>> = new Map();

  constructor() {
    this.startTime = new Date();
  }

  addHealthCheck(
    name: string,
    check: () => Promise<{ status: 'up' | 'down'; latency?: number }>
  ): void {
    this.healthChecks.set(name, check);
  }

  removeHealthCheck(name: string): void {
    this.healthChecks.delete(name);
  }

  async getHealthStatus(): Promise<HealthCheck> {
    const services: HealthCheck['services'] = {};
    let overallStatus: 'healthy' | 'unhealthy' = 'healthy';

    for (const [name, check] of this.healthChecks) {
      try {
        const result = await check();
        services[name] = result;
        
        if (result.status === 'down') {
          overallStatus = 'unhealthy';
        }
      } catch (error) {
        services[name] = { status: 'down' };
        overallStatus = 'unhealthy';
      }
    }

    return {
      status: overallStatus,
      timestamp: new Date(),
      services,
    };
  }

  getUptime(): number {
    return Date.now() - this.startTime.getTime();
  }

  getUptimeFormatted(): string {
    const uptimeMs = this.getUptime();
    const seconds = Math.floor(uptimeMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    return `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`;
  }

  getSystemMetrics() {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    return {
      uptime: this.getUptime(),
      uptimeFormatted: this.getUptimeFormatted(),
      memory: {
        rss: memoryUsage.rss,
        heapTotal: memoryUsage.heapTotal,
        heapUsed: memoryUsage.heapUsed,
        external: memoryUsage.external,
        arrayBuffers: memoryUsage.arrayBuffers,
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system,
      },
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
    };
  }
}
