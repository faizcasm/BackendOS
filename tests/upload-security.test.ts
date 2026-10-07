import path from 'path';
import { FileUploadService, sanitizeFilename } from '../src/modules/file-upload/src/upload.service';

const ROOT = path.resolve(process.env.UPLOAD_DIR ?? './uploads');

describe('filename sanitisation', () => {
  it('keeps only a single safe path segment', () => {
    expect(sanitizeFilename('report.pdf')).toBe('report.pdf');
    expect(sanitizeFilename('my file (1).png')).toBe('my_file__1_.png');
  });

  it('strips directory components', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('/etc/shadow')).toBe('shadow');
    expect(sanitizeFilename('..\\..\\windows\\system32\\cmd.exe')).not.toContain('/');
  });

  it('removes null bytes and collapses dot-only names', () => {
    expect(sanitizeFilename('evil\u0000.txt')).toBe('evil.txt');
    expect(sanitizeFilename('..')).toBe('');
    expect(sanitizeFilename('...')).toBe('');
  });

  it('caps the length so huge names cannot exhaust the filesystem', () => {
    expect(sanitizeFilename(`${'a'.repeat(500)}.txt`).length).toBeLessThanOrEqual(200);
  });
});

describe('FileUploadService path resolution', () => {
  const service = new FileUploadService();

  it('never resolves outside of the upload directory', () => {
    const attacks = [
      '../secret.txt',
      '../../../../etc/passwd',
      '/etc/passwd',
      'sub/../../escape.txt',
      '..%2F..%2Fetc%2Fpasswd',
      '....//....//etc/passwd',
      'con.txt',
      '.hidden',
    ];

    for (const attack of attacks) {
      const resolved = service.resolveSafePath(attack);
      if (resolved !== null) {
        expect(resolved.startsWith(`${ROOT}${path.sep}`)).toBe(true);
      }
    }
  });

  it('rejects empty and dot-only names', () => {
    expect(service.resolveSafePath('')).toBeNull();
    expect(service.resolveSafePath('..')).toBeNull();
    expect(service.resolveSafePath('...')).toBeNull();
    expect(service.resolveSafePath('\u0000')).toBeNull();
  });

  it('accepts ordinary filenames', () => {
    const resolved = service.resolveSafePath('photo.png');
    expect(resolved).toBe(path.join(ROOT, 'photo.png'));
  });

  it('exposes configured upload limits', () => {
    expect(service.config.maxSize).toBeGreaterThan(0);
    expect(service.config.allowedTypes.length).toBeGreaterThan(0);
  });
});
