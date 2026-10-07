import { AuthService, type AuthStore } from '../src/modules/auth/src/auth.service';
import { ConflictError, UnauthorizedError } from '../src/core/errors';

/**
 * In-memory Prisma stand-in implementing exactly the surface the service
 * uses, so auth logic can be verified without a database.
 */
const createFakeStore = () => {
  const users: any[] = [];
  const tokens: any[] = [];
  let userSeq = 0;
  let tokenSeq = 0;

  const matchesTokenWhere = (token: any, where: any): boolean => {
    if (where.tokenHash && token.tokenHash !== where.tokenHash) return false;
    if (where.userId && token.userId !== where.userId) return false;
    if ('revokedAt' in where) {
      if (where.revokedAt === null && token.revokedAt !== null) return false;
      if (where.revokedAt && where.revokedAt.not === null && token.revokedAt === null) return false;
      if (
        where.revokedAt &&
        where.revokedAt.lt &&
        !(token.revokedAt && token.revokedAt < where.revokedAt.lt)
      )
        return false;
    }
    if (where.OR) return where.OR.some((clause: any) => matchesTokenWhere(token, clause));
    return true;
  };

  const store: AuthStore = {
    user: {
      findUnique: async ({ where }: any) =>
        users.find((user) => (where.id ? user.id === where.id : user.email === where.email)) ??
        null,
      create: async ({ data }: any) => {
        if (users.some((user) => user.email === data.email)) {
          const error: any = new Error('Unique constraint failed');
          error.code = 'P2002';
          throw error;
        }
        const now = new Date();
        const user = {
          id: `user-${++userSeq}`,
          role: 'USER',
          isActive: true,
          lastLoginAt: null,
          lastLoginIp: null,
          createdAt: now,
          updatedAt: now,
          ...data,
        };
        users.push(user);
        return user;
      },
      update: async ({ where, data }: any) => {
        const user = users.find((entry) => entry.id === where.id);
        if (!user) throw new Error('not found');
        Object.assign(user, data, { updatedAt: new Date() });
        return user;
      },
      delete: async ({ where }: any) => {
        const index = users.findIndex((entry) => entry.id === where.id);
        return users.splice(index, 1)[0];
      },
      findMany: async ({ skip = 0, take, orderBy }: any = {}) => {
        const sorted = [...users];
        if (orderBy?.createdAt === 'desc') {
          sorted.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        const page = sorted.slice(skip, take === undefined ? undefined : skip + take);
        return page;
      },
      count: async () => users.length,
    },
    refreshToken: {
      findUnique: async ({ where }: any) => {
        const token = tokens.find((entry) => entry.tokenHash === where.tokenHash);
        if (!token) return null;
        return { ...token, user: users.find((user) => user.id === token.userId) ?? null };
      },
      findMany: async ({ where }: any) => tokens.filter((token) => matchesTokenWhere(token, where)),
      create: async ({ data }: any) => {
        const token = {
          id: `token-${++tokenSeq}`,
          revokedAt: null,
          replacedByTokenHash: null,
          createdAt: new Date(),
          ...data,
        };
        tokens.push(token);
        return token;
      },
      update: async ({ where, data }: any) => {
        const token = tokens.find((entry) => entry.id === where.id);
        if (!token) throw new Error('not found');
        Object.assign(token, data);
        return token;
      },
      updateMany: async ({ where, data }: any) => {
        const targets = tokens.filter(
          (token) => matchesTokenWhere(token, where) && token.revokedAt === null
        );
        targets.forEach((token) => Object.assign(token, data));
        return { count: targets.length };
      },
      deleteMany: async () => ({ count: 0 }),
    },
  };

  return { store, users, tokens };
};

describe('AuthService', () => {
  let harness: ReturnType<typeof createFakeStore>;
  let service: AuthService;

  beforeEach(() => {
    harness = createFakeStore();
    service = new AuthService(harness.store);
  });

  it('registers a user with a hashed password and never exposes the hash', async () => {
    const user = await service.register('Alice@Example.com', 'Password123');

    expect(user.email).toBe('alice@example.com');
    expect(user).not.toHaveProperty('password');
    expect(user.role).toBe('USER');

    const stored = harness.users[0];
    expect(stored.password).not.toBe('Password123');
    expect(await service.comparePassword('Password123', stored.password)).toBe(true);
  });

  it('rejects duplicate registrations', async () => {
    await service.register('alice@example.com', 'Password123');
    await expect(service.register('alice@example.com', 'Password123')).rejects.toBeInstanceOf(
      ConflictError
    );
  });

  it('issues tokens on login and stores only a hash of the refresh token', async () => {
    await service.register('alice@example.com', 'Password123');
    const tokens = await service.login('alice@example.com', 'Password123', { ip: '10.0.0.1' });

    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toBeTruthy();

    const stored = harness.tokens[0];
    expect(stored.tokenHash).not.toBe(tokens.refreshToken);
    expect(stored.ipAddress).toBe('10.0.0.1');
    expect(harness.users[0].lastLoginIp).toBe('10.0.0.1');
  });

  it('uses one generic message for unknown users and wrong passwords', async () => {
    await service.register('alice@example.com', 'Password123');

    await expect(service.login('nobody@example.com', 'Password123')).rejects.toThrow(
      'Invalid email or password'
    );
    await expect(service.login('alice@example.com', 'WrongPass99')).rejects.toThrow(
      'Invalid email or password'
    );
  });

  it('refuses to log in deactivated accounts', async () => {
    const user = await service.register('alice@example.com', 'Password123');
    await service.deleteAccount(user.id); // revoke + delete

    await expect(service.login('alice@example.com', 'Password123')).rejects.toBeInstanceOf(
      UnauthorizedError
    );
  });

  it('rotates refresh tokens and detects reuse', async () => {
    await service.register('alice@example.com', 'Password123');
    const first = await service.login('alice@example.com', 'Password123');

    const second = await service.refreshAccessToken(first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(second.accessToken).toBeTruthy();

    // Replaying the retired token must fail and revoke every session.
    await expect(service.refreshAccessToken(first.refreshToken)).rejects.toThrow(/reuse detected/);

    const activeTokens = harness.tokens.filter((token) => token.revokedAt === null);
    expect(activeTokens).toHaveLength(0);

    await expect(service.refreshAccessToken(second.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedError
    );
  });

  it('rejects expired refresh tokens', async () => {
    await service.register('alice@example.com', 'Password123');
    const tokens = await service.login('alice@example.com', 'Password123');

    harness.tokens[0].expiresAt = new Date(Date.now() - 1000);

    await expect(service.refreshAccessToken(tokens.refreshToken)).rejects.toThrow(/expired/);
  });

  it('logout revokes the presented token without affecting others', async () => {
    await service.register('alice@example.com', 'Password123');
    const first = await service.login('alice@example.com', 'Password123');
    const second = await service.refreshAccessToken(first.refreshToken);

    await service.logout(second.refreshToken);

    await expect(service.refreshAccessToken(second.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedError
    );
  });

  it('logoutAll kills every active session for the user', async () => {
    const user = await service.register('alice@example.com', 'Password123');
    await service.login('alice@example.com', 'Password123');
    await service.login('alice@example.com', 'Password123');

    const revoked = await service.revokeAllForUser(user.id);
    expect(revoked).toBe(2);
  });

  it('validates the current password before allowing a change', async () => {
    const user = await service.register('alice@example.com', 'Password123');

    await expect(
      service.changePassword(user.id, 'NotThePassword1', 'NewPassword9')
    ).rejects.toBeInstanceOf(UnauthorizedError);

    await service.changePassword(user.id, 'Password123', 'NewPassword9');
    expect(await service.comparePassword('NewPassword9', harness.users[0].password)).toBe(true);
  });

  it('revokes sessions when the password changes', async () => {
    const user = await service.register('alice@example.com', 'Password123');
    const tokens = await service.login('alice@example.com', 'Password123');

    await service.changePassword(user.id, 'Password123', 'NewPassword9');

    await expect(service.refreshAccessToken(tokens.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedError
    );
  });

  it('returns null for unknown users and paginates listings', async () => {
    expect(await service.getUserById('missing')).toBeNull();

    await service.register('a@example.com', 'Password123');
    await service.register('b@example.com', 'Password123');
    const page = await service.listUsers(1, 1);

    expect(page.users).toHaveLength(1);
    expect(page.pagination).toMatchObject({ page: 1, limit: 1, total: 2, totalPages: 2 });
    expect(page.users[0]).not.toHaveProperty('password');
  });
});
