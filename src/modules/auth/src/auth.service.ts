import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import type { StringValue } from 'ms';
import { User, AuthTokens, JWTPayload } from '../../../shared/types';
import { config } from '../../../shared/utils/config';

// In-memory storage (replace with database in production)
const users: Map<string, User> = new Map();
const refreshTokens: Set<string> = new Set();

export class AuthService {
  async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(10);
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
    const token = jwt.sign(payload, config.jwt.refreshSecret, options);
    refreshTokens.add(token);
    return token;
  }

  verifyAccessToken(token: string): JWTPayload {
    return jwt.verify(token, config.jwt.secret) as JWTPayload;
  }

  verifyRefreshToken(token: string): JWTPayload {
    if (!refreshTokens.has(token)) {
      throw new Error('Invalid refresh token');
    }
    return jwt.verify(token, config.jwt.refreshSecret) as JWTPayload;
  }

  revokeRefreshToken(token: string): void {
    refreshTokens.delete(token);
  }

  async register(email: string, password: string): Promise<User> {
    for (const user of users.values()) {
      if (user.email === email) {
        throw new Error('User already exists');
      }
    }

    const hashedPassword = await this.hashPassword(password);
    const user: User = {
      id: uuidv4(),
      email,
      password: hashedPassword,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    users.set(user.id, user);
    return user;
  }

  async login(email: string, password: string): Promise<AuthTokens> {
    let foundUser: User | undefined;
    for (const user of users.values()) {
      if (user.email === email) {
        foundUser = user;
        break;
      }
    }

    if (!foundUser) {
      throw new Error('Invalid credentials');
    }

    const isValidPassword = await this.comparePassword(password, foundUser.password);
    if (!isValidPassword) {
      throw new Error('Invalid credentials');
    }

    const payload: JWTPayload = {
      userId: foundUser.id,
      email: foundUser.email,
    };

    return {
      accessToken: this.generateAccessToken(payload),
      refreshToken: this.generateRefreshToken(payload),
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<string> {
    const payload = this.verifyRefreshToken(refreshToken);
    return this.generateAccessToken({
      userId: payload.userId,
      email: payload.email,
    });
  }

  getUserById(userId: string): User | undefined {
    return users.get(userId);
  }

  logout(refreshToken: string): void {
    this.revokeRefreshToken(refreshToken);
  }
}
