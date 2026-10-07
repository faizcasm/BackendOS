import type { Request, Response, NextFunction } from 'express';
import { NotFoundError } from '../errors';

/**
 * Terminal 404 handler. Mounted after all routes so unmatched requests get
 * the standard error envelope instead of Express' default HTML page.
 */
export const notFoundHandler = (req: Request, _res: Response, next: NextFunction): void => {
  next(new NotFoundError(`Route ${req.method} ${req.path} not found`));
};
