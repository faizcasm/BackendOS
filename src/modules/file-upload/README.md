# File Upload Module

Provides secure file upload functionality with validation and storage abstraction.

## Features
- Multipart form data handling
- File size validation
- File type validation
- Secure file naming
- Storage abstraction (local/cloud-ready)
- Multiple file upload support
- File metadata tracking

## Supported Storage
- Local file system (default)
- Extensible for S3, GCS, Azure Blob Storage

## Usage

```typescript
import { fileUploadModule } from './modules/file-upload';

// Single file upload
app.post('/upload', 
  fileUploadModule.middleware.single('file'),
  handler
);

// Multiple files
app.post('/upload-multiple',
  fileUploadModule.middleware.array('files', 10),
  handler
);
```
