/**
 * Runs before the test framework loads any module.
 * Keeps tests hermetic: fast bcrypt, unreachable DB, verbose logs off.
 */
process.env.NODE_ENV = 'test';
process.env.BCRYPT_ROUNDS = process.env.BCRYPT_ROUNDS ?? '4';
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'error';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-value-for-unit-tests';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ?? 'test-refresh-secret-value-for-unit-tests';

// Point at a guaranteed-dead port unless the caller supplied a real database
// (CI integration runs export DATABASE_URL explicitly).
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:9/backendos_test';
}

if (!process.env.REDIS_HOST) {
  process.env.REDIS_HOST = '127.0.0.1';
  process.env.REDIS_PORT = '9';
}
