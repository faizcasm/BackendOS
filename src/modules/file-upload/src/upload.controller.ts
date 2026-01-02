import { Router, Request, Response } from 'express';
import { FileUploadService } from './upload.service';

export const createUploadRoutes = (uploadService: FileUploadService): Router => {
  const router = Router();
  const uploader = uploadService.createUploader();

  // Single file upload
  router.post('/single', uploader.single('file'), (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      res.json({
        message: 'File uploaded successfully',
        file: {
          filename: req.file.filename,
          originalName: req.file.originalname,
          size: req.file.size,
          mimetype: req.file.mimetype,
          path: req.file.path,
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Multiple files upload
  router.post('/multiple', uploader.array('files', 10), (req: Request, res: Response) => {
    try {
      if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
      }

      const files = req.files.map(file => ({
        filename: file.filename,
        originalName: file.originalname,
        size: file.size,
        mimetype: file.mimetype,
        path: file.path,
      }));

      res.json({
        message: 'Files uploaded successfully',
        files,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Delete file
  router.delete('/:filename', async (req: Request, res: Response) => {
    try {
      const { filename } = req.params;
      const deleted = await uploadService.deleteFile(filename);

      if (deleted) {
        res.json({ message: 'File deleted successfully' });
      } else {
        res.status(404).json({ error: 'File not found' });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // List files
  router.get('/', (req: Request, res: Response) => {
    try {
      const files = uploadService.listFiles();
      res.json({ files });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get file info
  router.get('/:filename', (req: Request, res: Response) => {
    try {
      const { filename } = req.params;
      const fileInfo = uploadService.getFileInfo(filename);

      if (fileInfo) {
        res.json(fileInfo);
      } else {
        res.status(404).json({ error: 'File not found' });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
