import {
  AppError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  PayloadTooLargeError,
  RateLimitedError,
  UnauthorizedError,
  ValidationError,
  asyncHandler,
  isAppError,
} from '../src/core/errors';
import { errorHandler, normaliseError } from '../src/core/middlewares/error-handler';

const makeRes = () => {
  const res: any = {
    statusCode: 200,
    headersSent: false,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
  };
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.setHeader = (key: string, value: string) => {
    res.headers[key] = value;
    return res;
  };
  res.json = (payload: unknown) => {
    res.body = payload;
    return res;
  };
  return res;
};

const makeReq = (overrides: Record<string, unknown> = {}) =>
  ({ method: 'GET', path: '/test', requestId: 'req-123', ...overrides }) as any;

describe('error taxonomy', () => {
  it('maps every error to a status code and machine readable code', () => {
    expect(new BadRequestError().statusCode).toBe(400);
    expect(new ValidationError().code).toBe('VALIDATION_ERROR');
    expect(new UnauthorizedError().statusCode).toBe(401);
    expect(new ForbiddenError().statusCode).toBe(403);
    expect(new NotFoundError().statusCode).toBe(404);
    expect(new ConflictError().statusCode).toBe(409);
    expect(new PayloadTooLargeError().statusCode).toBe(413);
    expect(new RateLimitedError().statusCode).toBe(429);
    expect(isAppError(new NotFoundError())).toBe(true);
    expect(isAppError(new Error('plain'))).toBe(false);
  });

  it('keeps operational errors distinguishable from bugs', () => {
    expect(new NotFoundError().isOperational).toBe(true);
    expect(
      new AppError('boom', 500, 'INTERNAL_ERROR', { isOperational: false }).isOperational
    ).toBe(false);
  });

  it('forwards rejected promises to the error handler', async () => {
    const next = jest.fn();
    const failing = asyncHandler(async () => {
      throw new NotFoundError('nope');
    });

    await failing(makeReq(), makeRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
    expect((next.mock.calls[0][0] as NotFoundError).statusCode).toBe(404);
  });
});

describe('normaliseError', () => {
  it('passes through AppError', () => {
    const result = normaliseError(new ConflictError('taken'));
    expect(result).toMatchObject({ statusCode: 409, code: 'CONFLICT', expose: true });
  });

  it('converts Joi validation errors', () => {
    const joiError = {
      name: 'ValidationError',
      isJoi: true,
      details: [{ message: 'email is required', path: ['email'], type: 'any.required' }],
    };

    expect(normaliseError(joiError)).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      details: [{ message: 'email is required', path: 'email', type: 'any.required' }],
    });
  });

  it.each([
    ['P2002', 409, 'CONFLICT'],
    ['P2025', 404, 'NOT_FOUND'],
    ['P2023', 400, 'BAD_REQUEST'],
    ['P1001', 503, 'SERVICE_UNAVAILABLE'],
    ['P2021', 503, 'SERVICE_UNAVAILABLE'],
  ])('maps prisma error %s', (code, statusCode, errorCode) => {
    const result = normaliseError({ code, message: 'db error', meta: { target: ['email'] } });
    expect(result.statusCode).toBe(statusCode);
    expect(result.code).toBe(errorCode);
  });

  it('maps multer limits', () => {
    expect(normaliseError({ name: 'MulterError', code: 'LIMIT_FILE_SIZE' })).toMatchObject({
      statusCode: 413,
      code: 'PAYLOAD_TOO_LARGE',
    });
    expect(
      normaliseError({ name: 'MulterError', code: 'LIMIT_UNEXPECTED_FILE', field: 'avatar' })
    ).toMatchObject({ statusCode: 400 });
  });

  it('maps body-parser failures', () => {
    expect(normaliseError({ type: 'entity.parse.failed' })).toMatchObject({
      statusCode: 400,
      code: 'BAD_REQUEST',
    });
    expect(normaliseError({ type: 'entity.too.large' })).toMatchObject({ statusCode: 413 });
  });

  it('masks unknown errors as an opaque 500', () => {
    const result = normaliseError(new Error('secret internal detail'));
    expect(result).toMatchObject({ statusCode: 500, code: 'INTERNAL_ERROR', expose: false });
  });
});

describe('errorHandler middleware', () => {
  it('renders the documented envelope with the request id', () => {
    const res = makeRes();
    errorHandler(new NotFoundError('gone'), makeReq(), res, jest.fn());

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({
      error: 'gone',
      code: 'NOT_FOUND',
      requestId: 'req-123',
    });
  });

  it('hides messages from non-operational errors', () => {
    const res = makeRes();
    errorHandler(new Error('db password is xyz'), makeReq(), res, jest.fn());

    expect(res.statusCode).toBe(500);
    expect((res.body as { error: string }).error).toBe('An unexpected error occurred');
    expect(res.body).not.toHaveProperty('stack');
  });

  it('passes through when headers were already sent', () => {
    const next = jest.fn();
    const res = makeRes();
    res.headersSent = true;

    errorHandler(new Error('late'), makeReq(), res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
