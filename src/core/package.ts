import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Runtime access to package metadata (version, name).
 * Read from disk so the published build always reports the real version
 * without forcing `resolveJsonModule` imports outside of `rootDir`.
 */
const readPackage = (): { name: string; version: string } => {
  try {
    const raw = readFileSync(join(__dirname, '../../package.json'), 'utf8');
    const parsed = JSON.parse(raw) as { name?: string; version?: string };
    return { name: parsed.name ?? 'backendos', version: parsed.version ?? '0.0.0' };
  } catch {
    return { name: 'backendos', version: '0.0.0' };
  }
};

export const packageJson = readPackage();
