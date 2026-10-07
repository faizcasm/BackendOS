import type { Router } from 'express';
import { FileUploadService, fileUploadService } from './src/upload.service';
import { createUploadRoutes } from './src/upload.controller';
import type { ModuleMetadata } from '../../shared/types';

export * from './src/upload.service';
export * from './src/upload.controller';
export * from './src/s3-storage.service';

export class FileUploadModule {
  public readonly metadata: ModuleMetadata = {
    name: 'file-upload',
    version: '2.0.0',
    description: 'Authenticated file uploads with validation and ownership tracking',
    enabled: true,
  };

  public readonly service: FileUploadService;
  public readonly router: Router;
  public readonly middleware: FileUploadService['middleware'];

  constructor() {
    this.service = fileUploadService;
    this.router = createUploadRoutes(this.service);
    this.middleware = this.service.middleware;
  }

  async initialize(): Promise<void> {
    // Storage is initialised lazily by the service constructor (upload dir).
  }

  async shutdown(): Promise<void> {
    // Disk storage needs no teardown.
  }
}

export const fileUploadModule = new FileUploadModule();
