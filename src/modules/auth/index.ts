import { Router } from 'express';
import authController from './src/auth.controller';
import { AuthService } from './src/auth.service';
import { authenticate } from './src/auth.middleware';
import { ModuleMetadata } from '../../shared/types';

export class AuthModule {
  public readonly metadata: ModuleMetadata = {
    name: 'auth',
    version: '1.0.0',
    description: 'Authentication and authorization module',
    enabled: true,
  };

  public readonly router: Router;
  public readonly service: AuthService;
  public readonly middleware = { authenticate };

  constructor() {
    this.service = new AuthService();
    this.router = authController;
  }

  async initialize(): Promise<void> {
    console.log(`[${this.metadata.name}] Module initialized`);
  }

  async shutdown(): Promise<void> {
    console.log(`[${this.metadata.name}] Module shutdown`);
  }
}

export const authModule = new AuthModule();
export { authenticate } from './src/auth.middleware';
