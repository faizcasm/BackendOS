import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../../../core/errors';
import type { MonitoringService } from './monitoring.service';

export const createMonitoringRoutes = (monitoringService: MonitoringService): Router => {
  const router = Router();

  /**
   * @route GET /api/health
   * Full dependency report. 503 only when a *critical* dependency is down.
   */
  router.get(
    '/',
    asyncHandler(async (_req: Request, res: Response) => {
      const health = await monitoringService.getHealthStatus();
      res.status(health.status === 'unhealthy' ? 503 : 200).json(health);
    })
  );

  /**
   * @route GET /api/health/ready — Kubernetes readiness probe
   */
  router.get(
    '/ready',
    asyncHandler(async (_req: Request, res: Response) => {
      const health = await monitoringService.getHealthStatus();
      const ready = health.status !== 'unhealthy';
      res
        .status(ready ? 200 : 503)
        .json({ ready, status: health.status, services: health.services });
    })
  );

  /**
   * @route GET /api/health/live — Kubernetes liveness probe (process only)
   */
  router.get('/live', (_req: Request, res: Response) => {
    res.status(200).json({
      alive: true,
      uptime: monitoringService.getUptime(),
      uptimeFormatted: monitoringService.getUptimeFormatted(),
    });
  });

  /**
   * @route GET /api/health/metrics — JSON process/system metrics
   * (Prometheus text exposition lives at `METRICS_PATH`, default `/metrics`)
   */
  router.get('/metrics', (_req: Request, res: Response) => {
    res.json(monitoringService.getSystemMetrics());
  });

  return router;
};
