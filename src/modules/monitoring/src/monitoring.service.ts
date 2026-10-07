import os from 'os';
import { config } from '../../../core/config';
import { prisma } from '../../../core/db';
import { redisClient } from '../../../core/redis';
import type { HealthCheck } from '../../../shared/types';
import { cachingModule } from '../../caching';

export type CheckResult = { status: 'up' | 'down'; latency?: number; detail?: string };

type RegisteredCheck = {
  run: () => Promise<CheckResult>;
  /** Optional checks are reported but never flip the overall status. */
  optional: boolean;
};

export class MonitoringService {
  private readonly startTime = new Date();
  private readonly healthChecks = new Map<string, RegisteredCheck>();

  addHealthCheck(
    name: string,
    check: () => Promise<CheckResult>,
    options: { optional?: boolean } = {}
  ): void {
    this.healthChecks.set(name, { run: check, optional: options.optional ?? false });
  }

  removeHealthCheck(name: string): void {
    this.healthChecks.delete(name);
  }

  /** Wires the default dependency checks (database, Redis, cache, memory). */
  registerDefaultChecks(): void {
    this.addHealthCheck(
      'database',
      async () => {
        const start = Date.now();
        await prisma.$queryRaw`SELECT 1`;
        return { status: 'up', latency: Date.now() - start };
      },
      { optional: !config.db.url }
    );

    this.addHealthCheck(
      'redis',
      async () => {
        if (!redisClient.isReady()) {
          return { status: 'down', detail: 'not connected' };
        }
        const start = Date.now();
        await redisClient.getClient().ping();
        return { status: 'up', latency: Date.now() - start };
      },
      { optional: !config.redis.required }
    );

    this.addHealthCheck(
      'cache',
      async () => {
        const stats = cachingModule.service.stats();
        return { status: 'up', detail: `${stats.backend} (${stats.entries} entries)` };
      },
      { optional: true }
    );

    this.addHealthCheck('memory', async () => {
      const { heapUsed, heapTotal } = process.memoryUsage();
      const ratio = heapTotal === 0 ? 0 : heapUsed / heapTotal;
      return {
        status: ratio > 0.95 ? 'down' : 'up',
        detail: `${Math.round(ratio * 100)}% heap in use`,
      };
    });
  }

  async getHealthStatus(): Promise<HealthCheck> {
    const services: HealthCheck['services'] = {};
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    for (const [name, { run, optional }] of this.healthChecks) {
      try {
        const start = Date.now();
        const result = await run();
        services[name] = {
          status: result.status,
          latency: result.latency ?? Date.now() - start,
          ...(result.detail ? { detail: result.detail } : {}),
          ...(optional ? { optional: true } : {}),
        };

        if (result.status === 'down') {
          status = optional ? (status === 'unhealthy' ? 'unhealthy' : 'degraded') : 'unhealthy';
        }
      } catch (error) {
        services[name] = {
          status: 'down',
          detail: (error as Error).message.slice(0, 200),
          ...(optional ? { optional: true } : {}),
        };
        if (!optional) status = 'unhealthy';
        else if (status === 'healthy') status = 'degraded';
      }
    }

    return {
      status,
      timestamp: new Date(),
      services,
      uptime: this.getUptime(),
      environment: config.nodeEnv,
      version: process.env.npm_package_version ?? '2.0.0',
    } as HealthCheck;
  }

  /** Kubernetes readiness: only critical dependencies may fail. */
  async isReady(): Promise<boolean> {
    const health = await this.getHealthStatus();
    return health.status !== 'unhealthy';
  }

  getUptime(): number {
    return Date.now() - this.startTime.getTime();
  }

  getUptimeFormatted(): string {
    const totalSeconds = Math.floor(this.getUptime() / 1000);
    const seconds = totalSeconds % 60;
    const minutes = Math.floor(totalSeconds / 60) % 60;
    const hours = Math.floor(totalSeconds / 3600) % 24;
    const days = Math.floor(totalSeconds / 86400);
    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
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
      cpu: { user: cpuUsage.user, system: cpuUsage.system },
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
      loadAverage: os.loadavg(),
    };
  }
}
