import { Router, Request, Response } from 'express';
import { MonitoringService } from './monitoring.service';

export const createMonitoringRoutes = (monitoringService: MonitoringService): Router => {
  const router = Router();

  // Health check endpoint
  router.get('/', async (req: Request, res: Response) => {
    try {
      const health = await monitoringService.getHealthStatus();
      const statusCode = health.status === 'healthy' ? 200 : 503;
      res.status(statusCode).json(health);
    } catch (error: any) {
      res.status(500).json({
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date(),
      });
    }
  });

  // Readiness check (for Kubernetes)
  router.get('/ready', async (req: Request, res: Response) => {
    try {
      const health = await monitoringService.getHealthStatus();
      if (health.status === 'healthy') {
        res.status(200).json({ ready: true });
      } else {
        res.status(503).json({ ready: false, services: health.services });
      }
    } catch (error: any) {
      res.status(503).json({ ready: false, error: error.message });
    }
  });

  // Liveness check (for Kubernetes)
  router.get('/live', (req: Request, res: Response) => {
    res.status(200).json({ alive: true });
  });

  // System metrics endpoint
  router.get('/metrics', (req: Request, res: Response) => {
    try {
      const metrics = monitoringService.getSystemMetrics();
      res.json(metrics);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
