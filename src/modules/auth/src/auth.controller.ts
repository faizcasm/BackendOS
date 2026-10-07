import { Router, type Request, type Response } from 'express';
import Joi from 'joi';
import { AuditAction } from '@prisma/client';
import { asyncHandler, NotFoundError, ValidationError } from '../../../core/errors';
import { config } from '../../../core/config';
import { authService, type AuthContext } from './auth.service';
import { authenticate, requireRole } from './auth.middleware';
import { createAuditLog } from '../../../core/middlewares/audit';
import type { AuthRequest } from '../../../shared/types';

const router = Router();

const passwordSchema = Joi.string()
  .min(config.security.passwordMinLength)
  .max(128)
  .pattern(/[A-Za-z]/, 'at least one letter')
  .pattern(/\d/, 'at least one digit')
  .messages({
    'string.min': `Password must be at least ${config.security.passwordMinLength} characters long`,
    'string.pattern.name': 'Password must contain {{#name}}',
  });

const registerSchema = Joi.object({
  email: Joi.string().email().max(254).required().messages({
    'string.email': 'A valid email address is required',
  }),
  password: passwordSchema.required(),
}).options({ abortEarly: false });

const loginSchema = Joi.object({
  email: Joi.string().email().max(254).required(),
  password: Joi.string().max(128).required(),
}).options({ abortEarly: false });

const refreshSchema = Joi.object({
  refreshToken: Joi.string().min(10).required(),
});

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().max(128).required(),
  newPassword: passwordSchema.required(),
}).options({ abortEarly: false });

const listUsersSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

const contextOf = (req: Request): AuthContext => ({
  ip: req.ip,
  userAgent: req.get('user-agent'),
});

const validate = <T extends object>(schema: Joi.ObjectSchema<T>, body: unknown): T => {
  const { error, value } = schema.validate(body);
  if (error) {
    throw new ValidationError(
      'Request validation failed',
      error.details.map((d) => ({
        message: d.message,
        path: d.path.join('.'),
        type: d.type,
      }))
    );
  }
  return value as T;
};

const audit = async (
  action: AuditAction,
  req: Request,
  success: boolean,
  errorMessage?: string,
  metadata?: Record<string, unknown>
): Promise<void> => {
  if (!config.modules.audit) return;
  await createAuditLog(action, req, success, errorMessage, metadata);
};

/**
 * @route POST /api/auth/register
 * @body   { email, password }
 */
router.post(
  '/register',
  asyncHandler(async (req: Request, res: Response) => {
    const body = validate<{ email: string; password: string }>(registerSchema, req.body);

    try {
      const user = await authService.register(body.email, body.password, contextOf(req));
      await audit(AuditAction.USER_REGISTER, req, true, undefined, { userId: user.id });
      res.status(201).json({ message: 'User registered successfully', user });
    } catch (error) {
      await audit(
        AuditAction.USER_REGISTER,
        req,
        false,
        error instanceof Error ? error.message : 'registration failed'
      );
      throw error;
    }
  })
);

/**
 * @route POST /api/auth/login
 * @body   { email, password }
 */
router.post(
  '/login',
  asyncHandler(async (req: Request, res: Response) => {
    const body = validate<{ email: string; password: string }>(loginSchema, req.body);

    try {
      const tokens = await authService.login(body.email, body.password, contextOf(req));
      await audit(AuditAction.USER_LOGIN, req, true, undefined, { email: body.email });
      res.json({ message: 'Login successful', ...tokens });
    } catch (error) {
      await audit(
        AuditAction.USER_LOGIN,
        req,
        false,
        error instanceof Error ? error.message : 'login failed',
        { email: body.email }
      );
      throw error;
    }
  })
);

/**
 * @route POST /api/auth/refresh
 * @body   { refreshToken } — rotates the refresh token
 */
router.post(
  '/refresh',
  asyncHandler(async (req: Request, res: Response) => {
    const body = validate<{ refreshToken: string }>(refreshSchema, req.body);

    try {
      const tokens = await authService.refreshAccessToken(body.refreshToken, contextOf(req));
      await audit(AuditAction.TOKEN_REFRESH, req, true);
      res.json({ message: 'Token refreshed', ...tokens });
    } catch (error) {
      await audit(
        AuditAction.TOKEN_REFRESH,
        req,
        false,
        error instanceof Error ? error.message : 'refresh failed'
      );
      throw error;
    }
  })
);

/**
 * @route POST /api/auth/logout
 * @body   { refreshToken }
 */
router.post(
  '/logout',
  asyncHandler(async (req: Request, res: Response) => {
    const body = validate<{ refreshToken: string }>(refreshSchema, req.body);
    await authService.logout(body.refreshToken);
    await audit(AuditAction.USER_LOGOUT, req, true);
    res.json({ message: 'Logged out successfully' });
  })
);

/**
 * @route POST /api/auth/logout-all — revokes every session for the caller
 */
router.post(
  '/logout-all',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const revoked = await authService.revokeAllForUser(req.user!.userId);
    await audit(AuditAction.USER_LOGOUT, req, true, undefined, { revoked });
    res.json({ message: 'All sessions revoked', revoked });
  })
);

/**
 * @route GET /api/auth/me
 */
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const user = await authService.getUserById(req.user!.userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    res.json({ user });
  })
);

/**
 * @route POST /api/auth/change-password
 * @body   { currentPassword, newPassword }
 */
router.post(
  '/change-password',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const body = validate<{ currentPassword: string; newPassword: string }>(
      changePasswordSchema,
      req.body
    );

    try {
      await authService.changePassword(req.user!.userId, body.currentPassword, body.newPassword);
      await audit(AuditAction.PASSWORD_CHANGE, req, true);
      res.json({ message: 'Password updated, all sessions have been revoked' });
    } catch (error) {
      await audit(
        AuditAction.PASSWORD_CHANGE,
        req,
        false,
        error instanceof Error ? error.message : 'password change failed'
      );
      throw error;
    }
  })
);

/**
 * @route GET /api/auth/users — admin only
 * @query  page, limit
 */
router.get(
  '/users',
  authenticate,
  requireRole('ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const query = validate<{ page: number; limit: number }>(listUsersSchema, req.query);
    const result = await authService.listUsers(query.page, query.limit);
    res.json(result);
  })
);

/** @route DELETE /api/auth/me — self-service account deletion */
router.delete(
  '/me',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    await authService.deleteAccount(req.user!.userId);
    await audit(AuditAction.USER_DELETE, req, true, undefined, { userId: req.user!.userId });
    res.json({ message: 'Account deleted' });
  })
);

export default router;
