import type { Request, Response, NextFunction } from 'express';
import { AppError, InternalServerError, type ErrorCode } from '../errors';
import { config } from '../config';
import { logger } from '../logger';

interface NormalisedError {
  statusCode: number;
  code: ErrorCode;
  message: string;
  details?: unknown;
  /** Whether the message is safe to show to the caller. */
  expose: boolean;
  /** True when the failure is an expected/operational condition. */
  operational: boolean;
}

interface JoiLikeError {
  name: string;
  isJoi?: boolean;
  details?: Array<{ message: string; path: Array<string | number>; type?: string }>;
}

const isJoiError = (error: unknown): error is JoiLikeError =>
  typeof error === 'object' &&
  error !== null &&
  ((error as JoiLikeError).isJoi === true || (error as JoiLikeError).name === 'ValidationError') &&
  Array.isArray((error as JoiLikeError).details);

const prismaCode = (error: unknown): string | undefined => {
  if (typeof error !== 'object' || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && /^P\d{4}$/.test(code) ? code : undefined;
};

const fromPrisma = (error: { code: string; meta?: unknown; message?: string }): NormalisedError => {
  const target = (error.meta as { target?: unknown } | undefined)?.target;
  const details = target !== undefined ? { target } : undefined;

  switch (error.code) {
    case 'P2002':
      return {
        statusCode: 409,
        code: 'CONFLICT',
        message: 'A record with the same unique value already exists',
        details,
        expose: true,
        operational: true,
      };
    case 'P2025':
      return {
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Resource not found',
        expose: true,
        operational: true,
      };
    case 'P2003':
      return {
        statusCode: 409,
        code: 'CONFLICT',
        message: 'Operation blocked by a related record',
        details,
        expose: true,
        operational: true,
      };
    case 'P2023':
      return {
        statusCode: 400,
        code: 'BAD_REQUEST',
        message: 'Malformed identifier supplied',
        expose: true,
        operational: true,
      };
    case 'P2021':
    case 'P2022':
      return {
        statusCode: 503,
        code: 'SERVICE_UNAVAILABLE',
        message: 'Database schema is out of date, run `npm run prisma:migrate:deploy`',
        expose: true,
        operational: true,
      };
    default:
      // P1xxx = connection/pool problems
      return {
        statusCode: 503,
        code: 'SERVICE_UNAVAILABLE',
        message: 'Database is unavailable',
        expose: true,
        operational: true,
      };
  }
};

const fromMulter = (error: { code?: string; field?: string }): NormalisedError => {
  switch (error.code) {
    case 'LIMIT_FILE_SIZE':
      return {
        statusCode: 413,
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Uploaded file exceeds the configured size limit',
        expose: true,
        operational: true,
      };
    case 'LIMIT_FILE_COUNT':
      return {
        statusCode: 400,
        code: 'BAD_REQUEST',
        message: 'Too many files uploaded',
        expose: true,
        operational: true,
      };
    case 'LIMIT_UNEXPECTED_FILE':
      return {
        statusCode: 400,
        code: 'BAD_REQUEST',
        message: `Unexpected file field${error.field ? ` "${error.field}"` : ''}`,
        expose: true,
        operational: true,
      };
    default:
      return {
        statusCode: 400,
        code: 'BAD_REQUEST',
        message: 'File upload failed',
        expose: true,
        operational: true,
      };
  }
};

export const normaliseError = (error: unknown): NormalisedError => {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
      details: error.details,
      expose: error.isOperational,
      operational: error.isOperational,
    };
  }

  if (isJoiError(error)) {
    return {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: error.details?.map((detail) => ({
        message: detail.message,
        path: detail.path.join('.'),
        type: detail.type,
      })),
      expose: true,
      operational: true,
    };
  }

  const code = prismaCode(error);
  if (code) {
    return fromPrisma({ code, meta: (error as { meta?: unknown }).meta });
  }

  const err = error as { name?: string; type?: string; code?: string; message?: string };

  if (err?.name === 'MulterError') {
    return fromMulter(err as { code?: string; field?: string });
  }

  if (
    err?.name === 'PrismaClientInitializationError' ||
    err?.name === 'PrismaClientUnknownRequestError'
  ) {
    return {
      statusCode: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'Database is unavailable',
      expose: true,
      operational: true,
    };
  }

  // body-parser / express.json failures
  if (err?.type === 'entity.parse.failed') {
    return {
      statusCode: 400,
      code: 'BAD_REQUEST',
      message: 'Malformed JSON body',
      expose: true,
      operational: true,
    };
  }
  if (err?.type === 'entity.too.large') {
    return {
      statusCode: 413,
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Request body exceeds the configured size limit',
      expose: true,
      operational: true,
    };
  }
  if (err?.type === 'encoding.unsupported' || err?.type === 'charset.unsupported') {
    return {
      statusCode: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE',
      message: 'Unsupported content encoding',
      expose: true,
      operational: true,
    };
  }

  const fallback = new InternalServerError();
  return {
    statusCode: fallback.statusCode,
    code: fallback.code,
    message: fallback.message,
    expose: false,
    operational: false,
  };
};

/**
 * Global error handler. Must be registered last (after the 404 handler).
 *
 * Response envelope (stable contract, documented in README):
 *   { error: string, code: string, requestId?: string, details?: [], stack?: string }
 */
export const errorHandler = (
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const normalised = normaliseError(error);
  const requestId = req.requestId;
  const log = req.log ?? logger;
  const logMeta = {
    requestId,
    statusCode: normalised.statusCode,
    code: normalised.code,
    method: req.method,
    path: req.path,
    userId: req.user?.userId,
    err: error instanceof Error ? error : new Error(String(error)),
  };

  if (normalised.statusCode >= 500) {
    log.error(`request failed: ${normalised.message}`, logMeta);
  } else {
    log.warn(`request rejected: ${normalised.message}`, logMeta);
  }

  const body: Record<string, unknown> = {
    error: normalised.expose ? normalised.message : 'An unexpected error occurred',
    code: normalised.code,
  };

  if (requestId) body.requestId = requestId;
  if (normalised.details !== undefined) body.details = normalised.details;
  if (config.isDev && !normalised.operational && error instanceof Error) {
    body.stack = error.stack;
  }

  res.status(normalised.statusCode).json(body);
};
