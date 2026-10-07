# File upload module

Authenticated multipart uploads with MIME/size validation, ownership tracking, and pluggable local or S3-compatible storage.

## Features

- Single (`file`) and multi-file (`files`, up to 10) uploads via multer
- MIME-type allowlist and file-size limit enforced before any bytes are written
- Filename sanitisation plus path-traversal checks (`sanitizeFilename` / `resolveSafePath`) for local files
- Ownership recorded on every file; non-admins only see, download, and delete their own
- Storage driver switch: `local` disk or `s3` (AWS S3, MinIO, R2, ...) via `STORAGE_DRIVER`
- Metadata persisted in the Prisma `FileMetadata` table; orphaned disk files are removed if bookkeeping fails
- Downloads stream from disk locally, or redirect to a time-boxed signed URL for S3
- Prometheus counter `backendos_file_uploads_total{success}`

## Usage

```typescript
import { fileUploadModule, fileUploadService, s3FileService } from '../../modules/file-upload';

// Mounted by the core app at /api/upload — every route requires a bearer token
app.use('/api/upload', fileUploadModule.router);

// Or mount the multer middleware on your own route
router.post('/avatar', authenticate, fileUploadModule.middleware.single('file'), async (req, res) => {
  const file = await fileUploadService.registerUploadedFile(req.file!, req.user!.userId);
  res.status(201).json({ file });
});
```

### HTTP routes (all require `Authorization: Bearer <accessToken>`)

| Method | Path                                  | Notes                              |
| ------ | ------------------------------------- | ---------------------------------- |
| POST   | `/api/upload/single`                  | multipart field `file`             |
| POST   | `/api/upload/multiple`                | multipart field `files`, max 10    |
| GET    | `/api/upload`                         | caller's files; admins see all     |
| GET    | `/api/upload/:filename`               | file metadata                      |
| GET    | `/api/upload/:filename/download`      | stream (local) or 302 signed URL (S3) |
| DELETE | `/api/upload/:filename`               | delete object + metadata           |
| GET    | `/api/upload/meta/limits`             | size limit, allowed types, driver  |

## Configuration

| Variable             | Purpose                                    | Default |
| -------------------- | ------------------------------------------ | ------- |
| `MAX_FILE_SIZE`      | Per-file size limit in bytes               | `10485760` (10 MiB) |
| `UPLOAD_DIR`         | Local storage directory                    | `./uploads` |
| `ALLOWED_FILE_TYPES` | Comma-separated MIME allowlist             | `image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain,application/json` |
| `STORAGE_DRIVER`     | `local` or `s3`                            | `local` |
| `S3_ENDPOINT`        | S3-compatible endpoint                     | `https://s3.amazonaws.com` |
| `S3_ACCESS_KEY_ID`   | S3 credentials (both required for the S3 driver) | empty |
| `S3_SECRET_ACCESS_KEY` | S3 credentials                           | empty |
| `S3_BUCKET`          | Target bucket                              | `backendos-files` |
| `S3_REGION`          | Bucket region                              | `us-east-1` |
| `MODULE_FILE_UPLOAD` | Mount the module                           | `true`  |

## Notes

- With `STORAGE_DRIVER=s3`, uploads are buffered in memory by `multer.memoryStorage()` and pushed to the bucket; missing credentials return `503`.
- The type check matches the declared MIME type only — no magic-byte sniffing.
- S3 signed download URLs expire after 1 hour (3600 s).
- Multer limits: 10 files and 20 fields per request, in addition to `MAX_FILE_SIZE`.
