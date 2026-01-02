import { PrismaClient } from '@prisma/client';
import { logger } from '../logger';

const prismaClientSingleton = () => {
  return new PrismaClient({
    log: [
      {
        emit: 'event',
        level: 'query',
      },
      {
        emit: 'event',
        level: 'error',
      },
      {
        emit: 'event',
        level: 'warn',
      },
    ],
  });
};

declare global {
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>;
}

export const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();

if (process.env.NODE_ENV !== 'production') {
  globalThis.prismaGlobal = prisma;
}

// Log database queries in development
if (process.env.NODE_ENV === 'development') {
  prisma.$on('query' as never, (e: any) => {
    logger.debug('Database Query', {
      query: e.query,
      duration: `${e.duration}ms`,
    });
  });
}

// Log database errors
prisma.$on('error' as never, (e: any) => {
  logger.error('Database Error', { error: e.message });
});

// Log database warnings
prisma.$on('warn' as never, (e: any) => {
  logger.warn('Database Warning', { message: e.message });
});

export const initializeDatabase = async (): Promise<void> => {
  try {
    await prisma.$connect();
    logger.info('✓ Database connected successfully');
  } catch (error) {
    logger.error('✗ Database connection failed', { error });
    throw error;
  }
};

export const closeDatabase = async (): Promise<void> => {
  try {
    await prisma.$disconnect();
    logger.info('✓ Database connection closed');
  } catch (error) {
    logger.error('✗ Error closing database', { error });
  }
};
