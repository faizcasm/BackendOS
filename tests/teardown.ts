/**
 * Runs after every test file.
 *
 * Jest force-kills workers that are still busy 500ms after the run ends
 * (`FORCE_EXIT_DELAY`), which prints a scary "failed to exit gracefully"
 * warning. Two things keep workers busy here:
 *
 *  1. supertest's throwaway server + client sockets, which close asynchronously
 *     after the last assertion, and
 *  2. ioredis's *ref'd* disconnect timer (up to `disconnectTimeout` ms) plus
 *     Prisma's pool teardown, scheduled by the module's own `shutdown()`.
 *
 * So: drain (1), release the shared connections (2), then give those short
 * timers a beat to fire before the hook resolves. The final settle is what
 * makes workers exit on their own instead of being killed.
 */
import { redisClient } from '../src/core/redis';
import { closeDatabase } from '../src/core/db';

/** Resources that mean a test HTTP connection is still tearing down. */
const PENDING_HTTP = new Set(['TCPServerWrap', 'TCPSocketWrap']);

const pendingHttpResources = (): string[] =>
  (process.getActiveResourcesInfo?.() ?? []).filter((name) => PENDING_HTTP.has(name));

const drainHttpSockets = async (timeoutMs = 3000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (pendingHttpResources().length > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
};

/** Sleep without keeping the event loop alive by itself. */
const settle = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref();
  });

afterAll(async () => {
  await drainHttpSockets();
  await Promise.allSettled([redisClient.disconnect(), closeDatabase()]);
  // Longer than ioredis's `disconnectTimeout` (500ms) so the ref'd timer has
  // fired by the time Jest asks this worker to exit.
  await settle(600);
});
