import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from '../config';
import { logger } from '../logger';

/**
 * Prisma 7 uses the Rust-free "client" engine, which requires a driver
 * adapter. `@prisma/adapter-pg` gives us a normal `pg` connection pool.
 */
const createClient = (): PrismaClient => {
  const adapter = new PrismaPg(config.db.url ? { connectionString: config.db.url } : {});

  const client = new PrismaClient({ adapter });

  if (config.isDev) {
    // Query events are engine-dependent; attach defensively.
    const attach = (
      client as unknown as {
        $on?: (event: string, callback: (event: unknown) => void) => void;
      }
    ).$on;

    attach?.call(client, 'query', (event: unknown) => {
      const { query, duration } = event as { query?: string; duration?: number };
      logger.debug('database query', { query, durationMs: duration });
    });
  }

  return client;
};

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

/**
 * App-wide singleton. Reusing the instance (also across hot reloads in
 * development) prevents connection pool exhaustion.
 */
export const prisma: PrismaClient = globalThis.prismaGlobal ?? createClient();
globalThis.prismaGlobal = prisma;

/** Verifies connectivity and warms the pool; throws when unreachable. */
export const initializeDatabase = async (): Promise<void> => {
  await prisma.$queryRaw`SELECT 1`;
  logger.info('database connected', { url: redact(config.db.url) });
};

export const closeDatabase = async (): Promise<void> => {
  try {
    await prisma.$disconnect();
    logger.info('database disconnected');
  } catch (error) {
    logger.warn('error while closing database', { message: (error as Error).message });
  }
};

const redact = (url: string): string => {
  if (!url) return 'unset';
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.username}:***@${parsed.host}${parsed.pathname}`;
  } catch {
    return 'invalid-url';
  }
};
