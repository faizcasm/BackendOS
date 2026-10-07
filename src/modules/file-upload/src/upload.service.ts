import multer, { type StorageEngine, type Multer } from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import type { Request } from 'express';
import { config } from '../../../core/config';
import { logger } from '../../../core/logger';
import { prisma } from '../../../core/db';
import { NotFoundError, ValidationError } from '../../../core/errors';
import { fileUploads } from '../../../core/middlewares/metrics';
import { s3FileService, S3FileService } from './s3-storage.service';
import type { FileUploadConfig, UploadedFile } from '../../../shared/types';

/** Characters allowed in a client supplied file name. */
const SAFE_FILENAME = /^[A-Za-z0-9._-]+$/;

/**
 * Reduces any client supplied name to a safe single path segment.
 * Strips directories, null bytes, unicode look-alikes and over-long names.
 */
export const sanitizeFilename = (input: string): string => {
  const withoutNulls = String(input ?? '').replace(/\0/g, '');
  const base = path.basename(withoutNulls).replace(/^\.+/, '');
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, '_');
  return cleaned.slice(0, 200);
};

const toPublicFile = (record: any): UploadedFile => ({
  id: record.id,
  filename: record.filename,
  originalName: record.originalName,
  mimeType: record.mimeType,
  size: Number(record.size),
  storageKey: record.storageKey,
  isPublic: record.isPublic,
  uploadedBy: record.uploadedBy,
  createdAt: record.createdAt,
});

export class FileUploadService {
  private readonly uploadConfig: FileUploadConfig;
  private readonly storage: StorageEngine;
  private readonly uploader: Multer;
  private readonly s3: S3FileService = s3FileService;

  constructor() {
    this.uploadConfig = {
      maxSize: config.upload.maxFileSize,
      allowedTypes: config.upload.allowedTypes,
      destination: config.upload.uploadDir,
    };

    if (this.driver === 'local' && !fs.existsSync(this.uploadConfig.destination)) {
      fs.mkdirSync(this.uploadConfig.destination, { recursive: true, mode: 0o750 });
    }

    this.storage =
      this.driver === 's3'
        ? multer.memoryStorage()
        : multer.diskStorage({
            destination: (_req, _file, cb) => cb(null, this.uploadConfig.destination),
            filename: (_req, file, cb) => {
              const ext = path.extname(sanitizeFilename(file.originalname)).slice(0, 16);
              cb(null, `${randomUUID()}${ext}`);
            },
          });

    this.uploader = this.createUploader();
  }

  /** `local` writes to disk, `s3` buffers in memory and pushes to the bucket. */
  get driver(): 'local' | 's3' {
    return config.upload.storageDriver;
  }

  get config(): FileUploadConfig {
    return this.uploadConfig;
  }

  createUploader(options?: Partial<FileUploadConfig>): Multer {
    const uploadConfig: FileUploadConfig = { ...this.uploadConfig, ...options };

    return multer({
      storage: this.storage,
      limits: { fileSize: uploadConfig.maxSize, files: 10, fields: 20 },
      fileFilter: (_req, file, cb) => {
        if (uploadConfig.allowedTypes.includes(file.mimetype)) {
          cb(null, true);
          return;
        }
        cb(
          new ValidationError(
            `Unsupported file type "${file.mimetype}". Allowed: ${uploadConfig.allowedTypes.join(', ')}`
          )
        );
      },
    });
  }

  /** The multer instance mounted by the module's routes. */
  get middleware(): Multer {
    return this.uploader;
  }

  /**
   * Maps a client supplied file name onto an absolute path inside the upload
   * directory. Returns `null` for anything attempting traversal.
   */
  resolveSafePath(filename: string): string | null {
    const safe = sanitizeFilename(filename);
    if (!safe || !SAFE_FILENAME.test(safe)) return null;

    const root = path.resolve(this.uploadConfig.destination);
    const resolved = path.resolve(root, safe);
    return resolved.startsWith(root + path.sep) ? resolved : null;
  }

  /** Persists metadata (and bytes) after multer has accepted the file. */
  async registerUploadedFile(file: Express.Multer.File, userId: string): Promise<UploadedFile> {
    if (this.driver === 's3') {
      return this.s3.uploadFile(file, userId);
    }

    try {
      const record = await prisma.fileMetadata.create({
        data: {
          filename: file.filename,
          originalName: path.basename(file.originalname).slice(0, 255),
          mimeType: file.mimetype,
          size: BigInt(file.size),
          storageKey: file.filename,
          uploadedBy: userId,
        },
      });
      fileUploads.inc({ success: 'true' });
      logger.info('file uploaded', { filename: file.filename, userId, size: file.size });
      return toPublicFile(record);
    } catch (error) {
      fileUploads.inc({ success: 'false' });
      // Don't leave orphaned bytes on disk when bookkeeping fails.
      this.unlinkQuietly(file.path);
      throw error;
    }
  }

  async listFiles(userId: string, isAdmin = false): Promise<UploadedFile[]> {
    const records = await prisma.fileMetadata.findMany({
      where: isAdmin ? {} : { uploadedBy: userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return records.map(toPublicFile);
  }

  async getFile(filename: string, userId: string, isAdmin = false): Promise<UploadedFile> {
    const record = await prisma.fileMetadata.findUnique({ where: { filename } });
    if (!record) throw new NotFoundError('File not found');
    if (!isAdmin && record.uploadedBy !== userId) {
      throw new NotFoundError('File not found');
    }
    return toPublicFile(record);
  }

  /** Absolute path (local driver) or a signed URL (s3 driver) for downloads. */
  async getDownloadTarget(
    filename: string,
    userId: string,
    isAdmin = false
  ): Promise<{ kind: 'local'; path: string } | { kind: 'redirect'; url: string }> {
    const record = await this.getFile(filename, userId, isAdmin);

    if (this.driver === 's3') {
      return { kind: 'redirect', url: await this.s3.getSignedDownloadUrl(record.storageKey) };
    }

    const safePath = this.resolveSafePath(filename);
    if (!safePath || !fs.existsSync(safePath)) {
      throw new NotFoundError('File not found');
    }
    return { kind: 'local', path: safePath };
  }

  async deleteFile(filename: string, userId: string, isAdmin = false): Promise<boolean> {
    const record = await prisma.fileMetadata.findUnique({ where: { filename } });
    if (!record) return false;
    if (!isAdmin && record.uploadedBy !== userId) {
      throw new NotFoundError('File not found');
    }

    if (this.driver === 's3') {
      await this.s3.deleteObject(record.storageKey);
    } else {
      const safePath = this.resolveSafePath(filename);
      if (safePath) this.unlinkQuietly(safePath);
    }

    await prisma.fileMetadata.delete({ where: { id: record.id } });
    logger.info('file deleted', { filename, userId });
    return true;
  }

  private unlinkQuietly(target: string): void {
    try {
      if (fs.existsSync(target)) fs.unlinkSync(target);
    } catch (error) {
      logger.warn('failed to delete file', { target, message: (error as Error).message });
    }
  }
}

export const fileUploadService = new FileUploadService();

export const isUploadRequest = (req: Request): boolean => Boolean(req.file || req.files);
