import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import type { StringValue } from 'ms';
import { prisma } from '../../../core/db';
import { UserRole } from '@prisma/client';
import { config } from '../../../core/config';
import { AuthTokens, JWTPayload } from '../../../shared/types';
import { authAttempts } from '../../../core/middlewares/metrics';

export class AuthService {
  async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(12);
    return bcrypt.hash(password, salt);
  }

  async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  generateAccessToken(payload: JWTPayload): string {
    const options: SignOptions = {
      expiresIn: config.jwt.expiresIn as StringValue,
    };
    return jwt.sign(payload, config.jwt.secret, options);
  }

  generateRefreshToken(payload: JWTPayload): string {
    const options: SignOptions = {
      expiresIn: config.jwt.refreshExpiresIn as StringValue,
    };
    return jwt.sign(payload, config.jwt.refreshSecret, options);
  }

  verifyAccessToken(token: string): JWTPayload {
    return jwt.verify(token, config.jwt.secret) as JWTPayload;
  }

  verifyRefreshToken(token: string): JWTPayload {
    return jwt.verify(token, config.jwt.refreshSecret) as JWTPayload;
  }

  async register(email: string, password: string, role: UserRole = UserRole.USER) {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    
    if (existingUser) {
      authAttempts.inc({ type: 'register', success: 'false' });
      throw new Error('User already exists');
    }

    const hashedPassword = await this.hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        role,
        isActive: true,
      },
    });

    authAttempts.inc({ type: 'register', success: 'true' });
    
    return user;
  }

  async login(email: string, password: string, ip?: string): Promise<AuthTokens> {
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !user.isActive) {
      authAttempts.inc({ type: 'login', success: 'false' });
      throw new Error('Invalid credentials');
    }

    const isValidPassword = await this.comparePassword(password, user.password);
    if (!isValidPassword) {
      authAttempts.inc({ type: 'login', success: 'false' });
      throw new Error('Invalid credentials');
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        lastLoginIp: ip,
      },
    });

    const payload: JWTPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    authAttempts.inc({ type: 'login', success: 'true' });

    return {
      accessToken: this.generateAccessToken(payload),
      refreshToken: this.generateRefreshToken(payload),
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<string> {
    const payload = this.verifyRefreshToken(refreshToken);
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });

    if (!user || !user.isActive) {
      throw new Error('User not found or inactive');
    }

    return this.generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });
  }

  async getUserById(userId: string) {
    return prisma.user.findUnique({ where: { id: userId } });
  }

  async updateUser(userId: string, updates: any) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    
    if (!user) {
      throw new Error('User not found');
    }

    return prisma.user.update({
      where: { id: userId },
      data: updates,
    });
  }

  async deleteUser(userId: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    
    if (!user) {
      throw new Error('User not found');
    }

    await prisma.user.delete({ where: { id: userId } });
  }
}

export const authService = new AuthService();
