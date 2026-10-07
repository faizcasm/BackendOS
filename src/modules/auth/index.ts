import { Router } from 'express';
import authController from './src/auth.controller';
import { AuthService, authService } from './src/auth.service';
import { authenticate, optionalAuth, requireRole, authorize } from './src/auth.middleware';
import type { ModuleMetadata } from '../../shared/types';

export * from './src/auth.service';
export * from './src/auth.middleware';

export class AuthModule {
  public readonly metadata: ModuleMetadata = {
    name: 'auth',
    version: '2.0.0',
    description: 'Authentication, authorization and session management module',
    enabled: true,
  };

  public readonly router: Router;
  public readonly service: AuthService;
  public readonly middleware = { authenticate, optionalAuth, requireRole, authorize };

  constructor() {
    this.service = authService;
    this.router = authController;
  }

  async initialize(): Promise<void> {
    // Opportunistically purge revoked/expired refresh tokens.
    await this.service.purgeExpiredTokens().catch(() => 0);
  }

  async shutdown(): Promise<void> {
    // Nothing to tear down: connections are owned by the core layer.
  }
}

export const authModule = new AuthModule();
