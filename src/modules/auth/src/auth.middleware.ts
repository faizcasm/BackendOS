import type { Response, NextFunction, RequestHandler } from 'express';
import type { AuthRequest } from '../../../shared/types';
import { ForbiddenError, UnauthorizedError } from '../../../core/errors';
import { authService } from './auth.service';

/**
 * Requires a valid access token. The token is verified synchronously (no DB
 * hit) — access tokens are short lived, and revocation is enforced at refresh
 * time plus on password change.
 */
export const authenticate: RequestHandler = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing bearer token');
    }

    req.user = authService.verifyAccessToken(authHeader.slice(7));
    next();
  } catch (error) {
    if (error instanceof ForbiddenError) {
      next(error);
      return;
    }
    next(new UnauthorizedError('Invalid or expired access token'));
  }
};

/** Attaches `req.user` when a token is present, never rejects the request. */
export const optionalAuth: RequestHandler = (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      req.user = authService.verifyAccessToken(authHeader.slice(7));
    }
  } catch {
    // ignore: optional auth never fails the request
  }
  next();
};

/**
 * Role guard — must be mounted after `authenticate`.
 *
 *   router.get('/admin', authenticate, requireRole('ADMIN'), handler)
 */
export const requireRole =
  (...roles: Array<string | 'USER' | 'ADMIN' | 'MODERATOR'>): RequestHandler =>
  (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }
    const role = req.user.role;
    if (!role || !roles.includes(role)) {
      next(new ForbiddenError('Insufficient permissions'));
      return;
    }
    next();
  };

/** Alias kept for readability at call sites. */
export const authorize = requireRole;
