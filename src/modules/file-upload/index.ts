import { Router } from 'express';
import { FileUploadService } from './src/upload.service';
import { createUploadRoutes } from './src/upload.controller';
import { ModuleMetadata } from '../../shared/types';

export class FileUploadModule {
  public readonly metadata: ModuleMetadata = {
    name: 'file-upload',
    version: '1.0.0',
    description: 'File upload and management module',
    enabled: true,
  };

  public readonly service: FileUploadService;
  public readonly router: Router;
  public readonly middleware: ReturnType<FileUploadService['createUploader']>;

  constructor() {
    this.service = new FileUploadService();
    this.router = createUploadRoutes(this.service);
    this.middleware = this.service.createUploader();
  }

  async initialize(): Promise<void> {
    console.log(`[${this.metadata.name}] Module initialized`);
  }

  async shutdown(): Promise<void> {
    console.log(`[${this.metadata.name}] Module shutdown`);
  }
}

export const fileUploadModule = new FileUploadModule();
