import { Request, Response, NextFunction } from 'express';
import { AuditAction } from '@prisma/client';
import { prisma } from '../db';
import { logger } from '../logger';

export { AuditAction } from '@prisma/client';

export const createAuditLog = async (
  action: AuditAction,
  req: Request,
  success: boolean = true,
  errorMessage?: string,
  metadata?: Record<string, any>
): Promise<void> => {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        userId: (req as any).user?.userId,
        ipAddress: req.ip || 'unknown',
        userAgent: req.get('user-agent'),
        success,
        errorMessage,
        metadata: metadata || undefined,
      },
    });
  } catch (error) {
    logger.error('Failed to create audit log', { action, error });
  }
};

// Middleware to auto-audit sensitive actions
export const auditMiddleware = (action: AuditAction) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);
    
    res.json = function (data: any) {
      const success = res.statusCode >= 200 && res.statusCode < 400;
      const errorMessage = !success && data?.error ? data.error : undefined;
      
      // Create audit log asynchronously (don't block response)
      createAuditLog(action, req, success, errorMessage, {
        statusCode: res.statusCode,
      }).catch((err) => {
        logger.error('Audit middleware error', { error: err });
      });
      
      return originalJson(data);
    };
    
    next();
  };
};
