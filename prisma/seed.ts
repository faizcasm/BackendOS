/**
 * Idempotent database seed.
 *
 * Usage:
 *   npm run prisma:seed
 *
 * Credentials come from the environment so no secret ever lands in git:
 *   SEED_ADMIN_EMAIL (default admin@backendos.local)
 *   SEED_ADMIN_PASSWORD (required in production, defaults to a dev-only value)
 */
import bcrypt from 'bcryptjs';
import { prisma } from '../src/core/db';

async function main(): Promise<void> {
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@backendos.local').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!';
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd && password === 'Admin123!') {
    throw new Error('Refusing to seed production with the default development password');
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { email },
    update: { role: 'ADMIN', isActive: true },
    create: { email, password: passwordHash, role: 'ADMIN', isActive: true },
  });

  console.log(`✓ Seed complete: admin "${admin.email}" (${admin.role})`);
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
