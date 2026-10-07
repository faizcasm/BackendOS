import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { createHash, randomBytes } from 'crypto';
import type { StringValue } from 'ms';
import { prisma } from '../../../core/db';
import { config } from '../../../core/config';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../../core/errors';
import { authAttempts } from '../../../core/middlewares/metrics';
import type { AuthTokens, JWTPayload, PublicUser } from '../../../shared/types';

/**
 * Minimal Prisma surface used by the service. Declaring it explicitly keeps
 * the service unit-testable without a database.
 */
export interface AuthStore {
  user: {
    findUnique(args: any): Promise<any>;
    create(args: any): Promise<any>;
    update(args: any): Promise<any>;
    delete(args: any): Promise<any>;
    findMany(args: any): Promise<any[]>;
    count(args?: any): Promise<number>;
  };
  refreshToken: {
    findUnique(args: any): Promise<any>;
    findMany(args: any): Promise<any[]>;
    create(args: any): Promise<any>;
    update(args: any): Promise<any>;
    updateMany(args: any): Promise<any>;
    deleteMany(args: any): Promise<any>;
  };
}

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

const generateOpaqueToken = (): string => randomBytes(48).toString('base64url');

/** milliseconds implied by a jwt/ms duration string such as "7d" */
const toMs = (duration: string): number => {
  const match = /^(\d+)([smhd])$/.exec(duration.trim());
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const value = Number(match[1]);
  const unit = match[2];
  const factor =
    unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
  return value * factor;
};

const toPublicUser = (user: any): PublicUser => ({
  id: user.id,
  email: user.email,
  role: user.role,
  isActive: user.isActive,
  lastLoginAt: user.lastLoginAt,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

export interface AuthContext {
  ip?: string;
  userAgent?: string;
}

export class AuthService {
  constructor(private readonly store: AuthStore = prisma as unknown as AuthStore) {}

  // ---------------------------------------------------------------- passwords

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, config.security.bcryptRounds);
  }

  async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Constant-work comparison used when a user does not exist, so that
   * response timing cannot be used to enumerate registered accounts.
   */
  private async dummyCompare(password: string): Promise<void> {
    await bcrypt.compare(password, '$2b$12$invalidsaltinvalidsaltinvalidsaltinvalidsaltinva');
  }

  // ------------------------------------------------------------------- tokens

  generateAccessToken(payload: JWTPayload): string {
    const options: SignOptions = { expiresIn: config.jwt.expiresIn as StringValue };
    return jwt.sign(payload, config.jwt.secret, options);
  }

  verifyAccessToken(token: string): JWTPayload {
    return jwt.verify(token, config.jwt.secret) as JWTPayload;
  }

  /** Issues an opaque refresh token and persists only its SHA-256 hash. */
  private async issueRefreshToken(userId: string, context: AuthContext = {}): Promise<string> {
    const token = generateOpaqueToken();
    await this.store.refreshToken.create({
      data: {
        tokenHash: hashToken(token),
        userId,
        userAgent: context.userAgent?.slice(0, 255),
        ipAddress: context.ip,
        expiresAt: new Date(Date.now() + toMs(config.jwt.refreshExpiresIn)),
      },
    });
    return token;
  }

  private buildPayload(user: any): JWTPayload {
    return { userId: user.id, email: user.email, role: user.role };
  }

  private async issueTokenPair(user: any, context: AuthContext = {}): Promise<AuthTokens> {
    return {
      accessToken: this.generateAccessToken(this.buildPayload(user)),
      refreshToken: await this.issueRefreshToken(user.id, context),
    };
  }

  // ------------------------------------------------------------- registration

  async register(email: string, password: string, _context: AuthContext = {}): Promise<PublicUser> {
    const existing = await this.store.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      authAttempts.inc({ type: 'register', success: 'false' });
      throw new ConflictError('An account with this email already exists');
    }

    try {
      const user = await this.store.user.create({
        data: {
          email: email.toLowerCase(),
          password: await this.hashPassword(password),
          role: 'USER',
          isActive: true,
        },
      });
      authAttempts.inc({ type: 'register', success: 'true' });
      return toPublicUser(user);
    } catch (error: any) {
      if (error?.code === 'P2002') {
        authAttempts.inc({ type: 'register', success: 'false' });
        throw new ConflictError('An account with this email already exists');
      }
      throw error;
    }
  }

  // -------------------------------------------------------------------- login

  async login(email: string, password: string, context: AuthContext = {}): Promise<AuthTokens> {
    const user = await this.store.user.findUnique({ where: { email: email.toLowerCase() } });

    if (!user) {
      await this.dummyCompare(password);
      authAttempts.inc({ type: 'login', success: 'false' });
      throw new UnauthorizedError('Invalid email or password');
    }

    if (user.isActive === false) {
      authAttempts.inc({ type: 'login', success: 'false' });
      throw new UnauthorizedError('This account has been deactivated');
    }

    const valid = await this.comparePassword(password, user.password);
    if (!valid) {
      authAttempts.inc({ type: 'login', success: 'false' });
      throw new UnauthorizedError('Invalid email or password');
    }

    await this.store.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), lastLoginIp: context.ip },
    });

    authAttempts.inc({ type: 'login', success: 'true' });
    return this.issueTokenPair(user, context);
  }

  // ------------------------------------------------------------------ refresh

  /**
   * Rotating refresh: every call revokes the presented token and issues a
   * fresh pair. Presenting an already-revoked token is treated as theft and
   * revokes every session for that user.
   */
  async refreshAccessToken(refreshToken: string, context: AuthContext = {}): Promise<AuthTokens> {
    const stored = await this.store.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      include: { user: true },
    });

    if (!stored || !stored.user) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    if (stored.revokedAt) {
      // Reuse of a rotated token => assume compromise, kill all sessions.
      await this.revokeAllForUser(stored.userId);
      throw new UnauthorizedError('Refresh token reuse detected, all sessions were revoked');
    }

    if (new Date(stored.expiresAt).getTime() <= Date.now()) {
      throw new UnauthorizedError('Refresh token expired');
    }

    if (stored.user.isActive === false) {
      throw new ForbiddenError('This account has been deactivated');
    }

    const nextToken = await this.issueRefreshToken(stored.userId, context);
    await this.store.refreshToken.update({
      where: { id: stored.id },
      data: {
        revokedAt: new Date(),
        replacedByTokenHash: hashToken(nextToken),
      },
    });

    return {
      accessToken: this.generateAccessToken(this.buildPayload(stored.user)),
      refreshToken: nextToken,
    };
  }

  // ------------------------------------------------------------------- logout

  async logout(refreshToken: string): Promise<void> {
    await this.store.refreshToken.updateMany({
      where: { tokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<number> {
    const result = await this.store.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result?.count ?? 0;
  }

  /** Housekeeping: drop tokens that are revoked or expired. */
  async purgeExpiredTokens(): Promise<number> {
    const result = await this.store.refreshToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { revokedAt: { not: null, lt: new Date(Date.now() - 86_400_000) } },
        ],
      },
    });
    return result?.count ?? 0;
  }

  // -------------------------------------------------------------------- users

  async getUserById(userId: string): Promise<PublicUser | null> {
    const user = await this.store.user.findUnique({ where: { id: userId } });
    return user ? toPublicUser(user) : null;
  }

  async getUserByEmail(email: string): Promise<PublicUser | null> {
    const user = await this.store.user.findUnique({ where: { email: email.toLowerCase() } });
    return user ? toPublicUser(user) : null;
  }

  async listUsers(
    page = 1,
    limit = 20
  ): Promise<{
    users: PublicUser[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const safePage = Math.max(page, 1);
    const [users, total] = await Promise.all([
      this.store.user.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
      this.store.user.count(),
    ]);

    return {
      users: users.map(toPublicUser),
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    const user = await this.store.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const valid = await this.comparePassword(currentPassword, user.password);
    if (!valid) {
      authAttempts.inc({ type: 'password_change', success: 'false' });
      throw new UnauthorizedError('Current password is incorrect');
    }

    if (currentPassword === newPassword) {
      throw new ValidationError('New password must be different from the current password');
    }

    await this.store.user.update({
      where: { id: userId },
      data: { password: await this.hashPassword(newPassword) },
    });

    // A password change invalidates every existing session.
    await this.revokeAllForUser(userId);
    authAttempts.inc({ type: 'password_change', success: 'true' });
  }

  async deleteAccount(userId: string): Promise<void> {
    await this.revokeAllForUser(userId);
    await this.store.user.delete({ where: { id: userId } });
  }
}

export const authService = new AuthService();
