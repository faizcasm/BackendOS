# Auth module

Prisma-backed authentication and authorization: JWT access tokens, rotating opaque refresh tokens, and role-based route guards.

## Features

- Registration and login with Joi-validated credentials (minimum length, at least one letter and one digit)
- bcrypt hashing with configurable rounds, plus a constant-work dummy compare so unknown emails cannot be enumerated by timing
- Short-lived JWT access tokens signed with `JWT_SECRET`
- Opaque refresh tokens (48 random bytes) stored only as SHA-256 hashes in the `RefreshToken` table
- Refresh-token rotation with reuse detection: presenting a revoked token revokes every session for that user
- Logout, logout-all, password change (revokes all sessions), and self-service account deletion
- Middleware exports: `authenticate`, `optionalAuth`, `requireRole` / `authorize`
- Audit trail entries for register/login/refresh/logout/password change when `MODULE_AUDIT` is enabled

## Usage

```typescript
import { authModule, authenticate, optionalAuth, requireRole } from '../../modules/auth';

// Mounted by the core app at /api/auth, behind the auth rate limiter
app.use('/api/auth', authModule.router);

// Protect your own routes
router.get('/admin', authenticate, requireRole('ADMIN'), handler);
router.get('/public-but-personalized', optionalAuth, handler);
```

### HTTP routes

| Method | Path                | Auth required      |
| ------ | ------------------- | ------------------ |
| POST   | `/api/auth/register` | —                 |
| POST   | `/api/auth/login`    | —                 |
| POST   | `/api/auth/refresh`  | — (body: `refreshToken`) |
| POST   | `/api/auth/logout`   | — (body: `refreshToken`) |
| POST   | `/api/auth/logout-all` | bearer           |
| GET    | `/api/auth/me`       | bearer             |
| DELETE | `/api/auth/me`       | bearer             |
| POST   | `/api/auth/change-password` | bearer      |
| GET    | `/api/auth/users`    | bearer + `ADMIN`   |

## Configuration

| Variable            | Purpose                                   | Default                        |
| ------------------- | ----------------------------------------- | ------------------------------ |
| `JWT_SECRET`        | Signing key for access tokens             | `default-secret-change-in-production` |
| `JWT_REFRESH_SECRET`| Required, must differ from `JWT_SECRET` in production (not used to sign refresh tokens) | `default-refresh-secret` |
| `JWT_EXPIRES_IN`    | Access token lifetime                     | `15m`                          |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token lifetime               | `7d`                           |
| `BCRYPT_ROUNDS`     | Password hashing cost (4–31)              | `12`                           |
| `PASSWORD_MIN_LENGTH` | Minimum password length on register/change | `8`                          |
| `MODULE_AUTH`       | Mount the module                          | `true`                         |
| `MODULE_AUDIT`      | Write audit-log entries for auth events   | `true`                         |

## Notes

- Backed by the Prisma `User` and `RefreshToken` models (plus `AuditLog` when auditing is on).
- Access tokens are verified synchronously without a database hit; revocation is enforced at refresh time and on password change.
- On startup the module purges expired and long-revoked refresh tokens.
- Production boot fails fast if either JWT secret is missing, a placeholder, or shared between access and refresh.
