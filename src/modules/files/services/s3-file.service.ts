import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../../../core/config';
import { logger } from '../../../core/logger';
import { prisma } from '../../../core/db';
import { fileUploads } from '../../../core/middlewares/metrics';

export class S3FileService {
  private s3Client: S3Client;
  private bucket: string;

  constructor() {
    this.s3Client = new S3Client({
      region: config.s3.region,
      endpoint: config.s3.endpoint,
      credentials: {
        accessKeyId: config.s3.accessKeyId,
        secretAccessKey: config.s3.secretAccessKey,
      },
    });
    this.bucket = config.s3.bucket;
  }

  async uploadFile(
    file: Express.Multer.File,
    userId: string,
    isPublic: boolean = false
  ): Promise<any> {
    try {
      const storageKey = `${userId}/${uuidv4()}-${file.originalname}`;

      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        Body: file.buffer,
        ContentType: file.mimetype,
        Metadata: {
          originalName: file.originalname,
          uploadedBy: userId,
        },
      });

      await this.s3Client.send(command);

      // Save metadata to database
      const fileMetadata = await prisma.fileMetadata.create({
        data: {
          filename: file.filename || file.originalname,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: BigInt(file.size),
          storageKey,
          bucket: this.bucket,
          uploadedBy: userId,
          isPublic,
        },
      });

      fileUploads.inc({ success: 'true' });
      logger.info('File uploaded to S3', { storageKey, userId });

      return fileMetadata;
    } catch (error: any) {
      fileUploads.inc({ success: 'false' });
      logger.error('S3 upload failed', { error: error.message, userId });
      throw new Error('File upload failed');
    }
  }

  async getSignedDownloadUrl(fileId: string, userId: string, expiresIn: number = 3600): Promise<string> {
    try {
      const file = await prisma.fileMetadata.findUnique({
        where: { id: fileId },
      });

      if (!file) {
        throw new Error('File not found');
      }

      // Check permissions
      if (!file.isPublic && file.uploadedBy !== userId) {
        throw new Error('Access denied');
      }

      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: file.storageKey,
      });

      const url = await getSignedUrl(this.s3Client, command, { expiresIn });

      logger.info('Generated signed URL', { fileId, userId });
      return url;
    } catch (error: any) {
      logger.error('Failed to generate signed URL', { error: error.message, fileId });
      throw error;
    }
  }

  async deleteFile(fileId: string, userId: string): Promise<void> {
    try {
      const file = await prisma.fileMetadata.findUnique({
        where: { id: fileId },
      });

      if (!file) {
        throw new Error('File not found');
      }

      // Check permissions
      if (file.uploadedBy !== userId) {
        throw new Error('Access denied');
      }

      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: file.storageKey,
      });

      await this.s3Client.send(command);

      // Delete metadata from database
      await prisma.fileMetadata.delete({
        where: { id: fileId },
      });

      logger.info('File deleted from S3', { fileId, userId });
    } catch (error: any) {
      logger.error('S3 delete failed', { error: error.message, fileId });
      throw new Error('File deletion failed');
    }
  }

  async getFileMetadata(fileId: string, userId: string) {
    const file = await prisma.fileMetadata.findUnique({
      where: { id: fileId },
      include: {
        uploader: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    if (!file) {
      throw new Error('File not found');
    }

    // Check permissions
    if (!file.isPublic && file.uploadedBy !== userId) {
      throw new Error('Access denied');
    }

    return file;
  }

  async listUserFiles(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [files, total] = await Promise.all([
      prisma.fileMetadata.findMany({
        where: { uploadedBy: userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.fileMetadata.count({
        where: { uploadedBy: userId },
      }),
    ]);

    return {
      files,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

export const s3FileService = new S3FileService();
