import multer, { StorageEngine } from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../../../shared/utils/config';
import { FileUploadConfig } from '../../../shared/types';

export class FileUploadService {
  private storage: StorageEngine;
  private uploadConfig: FileUploadConfig;

  constructor() {
    this.uploadConfig = {
      maxSize: config.upload.maxFileSize,
      allowedTypes: [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'application/pdf',
        'text/plain',
        'application/json',
      ],
      destination: config.upload.uploadDir,
    };

    // Ensure upload directory exists
    if (!fs.existsSync(this.uploadConfig.destination)) {
      fs.mkdirSync(this.uploadConfig.destination, { recursive: true });
    }

    this.storage = multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, this.uploadConfig.destination);
      },
      filename: (req, file, cb) => {
        const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
      },
    });
  }

  createUploader(options?: Partial<FileUploadConfig>) {
    const config: FileUploadConfig = {
      ...this.uploadConfig,
      ...options,
    };

    return multer({
      storage: this.storage,
      limits: {
        fileSize: config.maxSize,
      },
      fileFilter: (req, file, cb) => {
        if (config.allowedTypes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error(`Invalid file type. Allowed types: ${config.allowedTypes.join(', ')}`));
        }
      },
    });
  }

  async deleteFile(filename: string): Promise<boolean> {
    try {
      const filePath = path.join(this.uploadConfig.destination, filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error deleting file:', error);
      return false;
    }
  }

  getFileInfo(filename: string) {
    const filePath = path.join(this.uploadConfig.destination, filename);
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      return {
        filename,
        path: filePath,
        size: stats.size,
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime,
      };
    }
    return null;
  }

  listFiles() {
    if (fs.existsSync(this.uploadConfig.destination)) {
      return fs.readdirSync(this.uploadConfig.destination)
        .map(filename => this.getFileInfo(filename))
        .filter(info => info !== null);
    }
    return [];
  }
}
