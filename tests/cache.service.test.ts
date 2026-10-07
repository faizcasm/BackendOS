import { CacheService } from '../src/modules/caching/src/cache.service';

/**
 * Redis is deliberately unreachable in tests (see tests/setup.ts), so these
 * cases exercise the in-memory fallback that keeps the app alive in dev.
 */
describe('CacheService (memory backend)', () => {
  let cache: CacheService;

  beforeEach(() => {
    cache = new CacheService();
  });

  afterEach(async () => {
    await cache.disconnect();
  });

  it('reports the active backend', () => {
    expect(cache.stats()).toMatchObject({ backend: 'memory', hits: 0, misses: 0 });
    expect(cache.isRedisAvailable).toBe(false);
  });

  it('stores and retrieves values', async () => {
    await cache.set('greeting', { hello: 'world' }, { ttl: 60 });

    expect(await cache.get('greeting')).toEqual({ hello: 'world' });
    expect(cache.stats().hits).toBe(1);
  });

  it('returns null and counts a miss for unknown keys', async () => {
    expect(await cache.get('nope')).toBeNull();
    expect(cache.stats().misses).toBe(1);
  });

  it('honours prefixes so equal keys do not collide', async () => {
    await cache.set('id', 'user-value', { prefix: 'user' });
    await cache.set('id', 'order-value', { prefix: 'order' });

    expect(await cache.get('id', { prefix: 'user' })).toBe('user-value');
    expect(await cache.get('id', { prefix: 'order' })).toBe('order-value');
    expect(await cache.get('id')).toBeNull();
  });

  it('expires entries once the ttl elapses', async () => {
    await cache.set('temp', 'value', { ttl: 60 });
    expect(await cache.ttl('temp')).toBeGreaterThan(0);

    // Manipulate the private expiry to avoid sleeping in CI.
    const store = (cache as unknown as { memory: Map<string, { expiry: number }> }).memory;
    const entry = store.get('cache:temp')!;
    entry.expiry = Date.now() - 1;

    expect(await cache.get('temp')).toBeNull();
  });

  it('supports cache-aside reads via wrap()', async () => {
    const factory = jest.fn().mockResolvedValue('computed');

    expect(await cache.wrap(' expensive', factory, { ttl: 60 })).toBe('computed');
    expect(await cache.wrap(' expensive', factory, { ttl: 60 })).toBe('computed');
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('deletes single keys and pattern groups', async () => {
    await cache.set('user:1', 'a');
    await cache.set('user:2', 'b');
    await cache.set('order:1', 'c');

    expect(await cache.delete('user:1')).toBe(true);

    expect(await cache.clear('user:*')).toBe(true);
    expect(await cache.get('user:2')).toBeNull();
    expect(await cache.get('order:1')).toBe('c');

    expect(await cache.clear()).toBe(true);
    expect(await cache.get('order:1')).toBeNull();
  });

  it('counts increments with an expiry', async () => {
    expect(await cache.incr('attempts', 60)).toBe(1);
    expect(await cache.incr('attempts', 60)).toBe(2);
    expect(await cache.get('attempts')).toBe(2);
  });
});
