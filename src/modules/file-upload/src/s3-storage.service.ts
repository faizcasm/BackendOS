import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import path from 'path';
import { config } from '../../../core/config';
import { logger } from '../../../core/logger';
import { prisma } from '../../../core/db';
import { ForbiddenError, NotFoundError, ServiceUnavailableError } from '../../../core/errors';
import { fileUploads } from '../../../core/middlewares/metrics';
import type { UploadedFile } from '../../../shared/types';

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

/**
 * S3-compatible storage driver (AWS S3, MinIO, R2, ...).
 *
 * Files are expected to arrive via `multer.memoryStorage()` — set
 * `STORAGE_DRIVER=s3` and the upload module switches automatically.
 */
export class S3FileService {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    this.bucket = config.s3.bucket;
    this.client = new S3Client({
      region: config.s3.region,
      endpoint: config.s3.endpoint,
      forcePathStyle: Boolean(config.s3.endpoint && !config.s3.endpoint.includes('amazonaws')),
      credentials: {
        accessKeyId: config.s3.accessKeyId,
        secretAccessKey: config.s3.secretAccessKey,
      },
      requestHandler: { requestTimeout: config.ai.timeoutMs } as never,
    });
  }

  get enabled(): boolean {
    return Boolean(config.s3.accessKeyId && config.s3.secretAccessKey);
  }

  /** Uploads a buffered file and records its metadata. */
  async uploadFile(
    file: Express.Multer.File,
    userId: string,
    isPublic = false
  ): Promise<UploadedFile> {
    if (!this.enabled) {
      throw new ServiceUnavailableError(
        'S3 storage is not configured (S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY)'
      );
    }

    const safeName = path
      .basename(file.originalname)
      .replace(/[^\w.-]/g, '_')
      .slice(0, 120);
    const storageKey = `${userId}/${randomUUID()}-${safeName}`;

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: storageKey,
          Body: file.buffer,
          ContentType: file.mimetype,
          Metadata: { originalName: safeName, uploadedBy: userId },
        })
      );

      const record = await prisma.fileMetadata.create({
        data: {
          filename: storageKey.split('/').pop()!,
          originalName: path.basename(file.originalname).slice(0, 255),
          mimeType: file.mimetype,
          size: BigInt(file.size),
          storageKey,
          bucket: this.bucket,
          uploadedBy: userId,
          isPublic,
        },
      });

      fileUploads.inc({ success: 'true' });
      logger.info('file uploaded to s3', { storageKey, userId, size: file.size });
      return toPublicFile(record);
    } catch (error) {
      fileUploads.inc({ success: 'false' });
      logger.error('s3 upload failed', {
        message: (error as Error).message,
        userId,
      });
      throw error;
    }
  }

  /** Time-boxed signed URL for downloads. */
  async getSignedDownloadUrl(storageKey: string, expiresIn = 3600): Promise<string> {
    if (!this.enabled) {
      throw new ServiceUnavailableError('S3 storage is not configured');
    }

    const command = new GetObjectCommand({ Bucket: this.bucket, Key: storageKey });
    return getSignedUrl(this.client, command, { expiresIn });
  }

  async deleteObject(storageKey: string): Promise<void> {
    if (!this.enabled) {
      throw new ServiceUnavailableError('S3 storage is not configured');
    }
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }));
    logger.info('file deleted from s3', { storageKey });
  }

  /** Looks up metadata the requester is allowed to see. */
  async getFileMetadata(fileId: string, userId: string, isAdmin = false): Promise<any> {
    const file = await prisma.fileMetadata.findUnique({ where: { id: fileId } });
    if (!file) throw new NotFoundError('File not found');
    if (!file.isPublic && !isAdmin && file.uploadedBy !== userId) {
      throw new ForbiddenError('You do not own this file');
    }
    return file;
  }

  async listUserFiles(userId: string, page = 1, limit = 20) {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const safePage = Math.max(page, 1);
    const skip = (safePage - 1) * safeLimit;

    const [files, total] = await Promise.all([
      prisma.fileMetadata.findMany({
        where: { uploadedBy: userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
      }),
      prisma.fileMetadata.count({ where: { uploadedBy: userId } }),
    ]);

    return {
      files: files.map(toPublicFile),
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }
}

export const s3FileService = new S3FileService();
