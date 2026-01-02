import { Request } from 'express';

// Shared types across all modules
export interface User {
  id: string;
  email: string;
  password: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface JWTPayload {
  userId: string;
  email: string;
  role?: string;
  iat?: number;
  exp?: number;
}

export interface AuthRequest extends Request {
  user?: JWTPayload;
}

export interface CacheOptions {
  ttl?: number;
  prefix?: string;
}

export interface RateLimitConfig {
  windowMs: number;
  max: number;
  message?: string;
}

export interface JobOptions {
  priority?: number;
  delay?: number;
  attempts?: number;
  backoff?: number;
}

export interface FileUploadConfig {
  maxSize: number;
  allowedTypes: string[];
  destination: string;
}

export interface LogData {
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  metadata?: Record<string, any>;
  timestamp?: Date;
}

export interface HealthCheck {
  status: 'healthy' | 'unhealthy';
  timestamp: Date;
  services: {
    [key: string]: {
      status: 'up' | 'down';
      latency?: number;
    };
  };
}

export interface AIPromptConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ModuleMetadata {
  name: string;
  version: string;
  description: string;
  enabled: boolean;
}

export interface BackendOSConfig {
  modules: {
    [key: string]: boolean;
  };
  [key: string]: any;
}
