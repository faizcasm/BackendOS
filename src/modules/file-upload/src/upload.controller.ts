import { Router, type Request, type Response } from 'express';
import fs from 'fs';
import { asyncHandler, NotFoundError, ValidationError } from '../../../core/errors';
import { config } from '../../../core/config';
import { authenticate } from '../../auth/src/auth.middleware';
import type { AuthRequest } from '../../../shared/types';
import { FileUploadService, fileUploadService } from './upload.service';

export const createUploadRoutes = (
  uploadService: FileUploadService = fileUploadService
): Router => {
  const router = Router();
  const uploader = uploadService.middleware;

  // Every upload route is authenticated: files are owned by a user id.
  router.use(authenticate);

  const requester = (req: AuthRequest): { userId: string; isAdmin: boolean } => ({
    userId: req.user!.userId,
    isAdmin: req.user!.role === 'ADMIN',
  });

  /**
   * @route POST /api/upload/single
   * @field  file — multipart/form-data
   */
  router.post(
    '/single',
    uploader.single('file'),
    asyncHandler(async (req: AuthRequest, res: Response) => {
      if (!req.file) {
        throw new ValidationError('No file uploaded (expected form field "file")');
      }
      const file = await uploadService.registerUploadedFile(req.file, requester(req).userId);
      res.status(201).json({ message: 'File uploaded successfully', file });
    })
  );

  /**
   * @route POST /api/upload/multiple
   * @field  files — multipart/form-data (max 10)
   */
  router.post(
    '/multiple',
    uploader.array('files', 10),
    asyncHandler(async (req: AuthRequest, res: Response) => {
      const files = req.files;
      if (!Array.isArray(files) || files.length === 0) {
        throw new ValidationError('No files uploaded (expected form field "files")');
      }
      const uploaded = await Promise.all(
        files.map((file) => uploadService.registerUploadedFile(file, requester(req).userId))
      );
      res.status(201).json({ message: 'Files uploaded successfully', files: uploaded });
    })
  );

  /** @route GET /api/upload — list the caller's files */
  router.get(
    '/',
    asyncHandler(async (req: AuthRequest, res: Response) => {
      const { userId, isAdmin } = requester(req);
      const files = await uploadService.listFiles(userId, isAdmin);
      res.json({ files, count: files.length });
    })
  );

  /** @route GET /api/upload/:filename/download — stream or redirect to a signed URL */
  router.get(
    '/:filename/download',
    asyncHandler(async (req: AuthRequest, res: Response) => {
      const { userId, isAdmin } = requester(req);
      const target = await uploadService.getDownloadTarget(
        String(req.params.filename),
        userId,
        isAdmin
      );

      if (target.kind === 'redirect') {
        res.redirect(302, target.url);
        return;
      }

      const stats = fs.statSync(target.path);
      res.setHeader('Content-Length', String(stats.size));
      res.setHeader('X-Content-Type-Options', 'nosniff');
      fs.createReadStream(target.path).pipe(res);
    })
  );

  /** @route GET /api/upload/:filename — file metadata */
  router.get(
    '/:filename',
    asyncHandler(async (req: AuthRequest, res: Response) => {
      const { userId, isAdmin } = requester(req);
      const file = await uploadService.getFile(String(req.params.filename), userId, isAdmin);
      res.json({ file });
    })
  );

  /** @route DELETE /api/upload/:filename */
  router.delete(
    '/:filename',
    asyncHandler(async (req: AuthRequest, res: Response) => {
      const { userId, isAdmin } = requester(req);
      const deleted = await uploadService.deleteFile(String(req.params.filename), userId, isAdmin);
      if (!deleted) {
        throw new NotFoundError('File not found');
      }
      res.json({ message: 'File deleted successfully' });
    })
  );

  /** @route GET /api/upload/config — upload limits for clients */
  router.get('/meta/limits', (_req: Request, res: Response) => {
    res.json({
      maxFileSize: config.upload.maxFileSize,
      allowedTypes: config.upload.allowedTypes,
      storageDriver: config.upload.storageDriver,
    });
  });

  return router;
};
