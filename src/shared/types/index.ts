import { Request } from 'express';

// Shared types across all modules
export interface User {
  id: string;
  email: string;
  password: string;
  createdAt: Date;
  updatedAt: Date;
}

/** User shape returned by the API (never includes the password hash). */
export interface PublicUser {
  id: string;
  email: string;
  role: 'USER' | 'ADMIN' | 'MODERATOR' | string;
  isActive: boolean;
  lastLoginAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** File metadata returned by the upload module. */
export interface UploadedFile {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  storageKey: string;
  isPublic?: boolean;
  uploadedBy: string;
  createdAt?: Date;
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
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  uptime?: number;
  environment?: string;
  version?: string;
  services: {
    [key: string]: {
      status: 'up' | 'down';
      latency?: number;
      detail?: string;
      optional?: boolean;
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
