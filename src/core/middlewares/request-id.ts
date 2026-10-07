import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { createRequestLogger } from '../logger';

export const REQUEST_ID_HEADER = 'x-request-id';

const isSafeRequestId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 128 && /^[\w.:-]+$/.test(value);

/**
 * Assigns a correlation id to every request.
 *
 * - Honours an inbound `X-Request-Id` (set by an API gateway / load balancer).
 * - Echoes it back on the response for support tickets and log grepping.
 * - Attaches `req.requestId` and a child logger `req.log`.
 */
export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const inbound = req.get(REQUEST_ID_HEADER);
  const requestId = isSafeRequestId(inbound) ? inbound : randomUUID();

  req.requestId = requestId;
  req.log = createRequestLogger(requestId);
  res.setHeader('X-Request-Id', requestId);

  next();
};
