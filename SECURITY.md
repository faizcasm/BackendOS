# Security Policy

## Supported Versions

| Version | Supported |
| --- | --- |
| 2.x | ✅ |
| < 2.0 | ❌ (please upgrade) |

## Reporting a Vulnerability

Please report security vulnerabilities **privately** through
[GitHub Security Advisories](https://github.com/faizcasm/BackendOS/security/advisories/new).

**Please do not open public issues for security vulnerabilities.**

We aim to acknowledge reports within 48 hours and to publish a fix (or an
explanation) within 1 week, depending on severity.

## Security Best Practices

When using BackendOS in production:

### 1. Environment Variables

- **Never** commit `.env` files to version control
- Use strong, unique secrets for JWT tokens
- Rotate secrets regularly
- Use different secrets for development and production

```bash
# Generate secure random secrets
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 2. Authentication

- Use HTTPS in production
- Implement rate limiting on auth endpoints
- Consider adding 2FA for sensitive operations
- Set appropriate JWT expiration times
- Rotate refresh tokens regularly

### 3. File Uploads

- Validate file types server-side
- Scan uploaded files for malware
- Store files outside webroot
- Use signed URLs for file access
- Implement size limits

### 4. Rate Limiting

- Enable rate limiting on all public endpoints
- Use stricter limits for auth endpoints
- Consider IP-based and user-based limits
- Monitor for suspicious patterns

### 5. Database Security

- Use parameterized queries
- Implement proper access controls
- Encrypt sensitive data at rest
- Regular backups
- Monitor for SQL injection attempts

### 6. API Security

- Use CORS appropriately
- Implement API versioning
- Validate all inputs
- Sanitize outputs
- Use security headers (Helmet)

### 7. Logging

- Don't log sensitive information
- Implement log rotation
- Monitor logs for security events
- Use structured logging
- Set appropriate log levels

### 8. Dependencies

- Keep dependencies updated
- Use `npm audit` regularly
- Review dependency licenses
- Pin dependency versions
- Use lock files

### 9. Redis Security

- Use password authentication
- Bind to localhost only
- Use TLS for connections
- Implement key expiration
- Monitor Redis access

### 10. Monitoring

- Enable health checks
- Monitor system resources
- Set up alerts for anomalies
- Track API usage
- Monitor error rates

## Known Security Considerations

### Storage of credentials and tokens

- Passwords are hashed with bcrypt (cost factor from `BCRYPT_ROUNDS`).
- Access tokens are short-lived JWTs; refresh tokens are opaque random values
  stored **only as SHA-256 hashes** in PostgreSQL, with rotation on every use and
  reuse detection that revokes the whole token family.
- Even so, protect `JWT_SECRET`/`JWT_REFRESH_SECRET` — anyone who obtains them can
  mint tokens.

### Metrics endpoint

`/metrics` is unauthenticated by default. Set `METRICS_TOKEN` to require a bearer
token, or disable metrics with `METRICS_ENABLED=false`, when the endpoint is
reachable from untrusted networks.

### Session management

- `POST /api/auth/logout` revokes one refresh token, `logout-all` revokes all.
- Changing a password revokes every existing session.
- If you add device/session tracking, keep revocation server-side — never trust a
  client-provided session list.

### File storage

- Uploads are authenticated; filenames are sanitized and downloads are resolved
  inside the upload directory to prevent path traversal.
- Run malware scanning (e.g. ClamAV) and store files outside the webroot or on S3
  (`STORAGE_DRIVER=s3`) for anything user-facing.

### AI API keys

- Store `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` in the environment only, rotate them
  regularly, and disable the AI module (`MODULE_AI_HELPERS=false`) if unused.

### Secrets in this repository

- `.env` is git-ignored; only `.env.example` (with placeholders) is committed.
- Compose secrets are read from your shell/`.env` and the API refuses to boot in
  production with placeholder secrets.

## Security Checklist for Production

- [ ] All secrets in environment variables
- [ ] HTTPS enabled
- [ ] Rate limiting configured
- [ ] Database with proper credentials
- [ ] File upload validation enabled
- [ ] Security headers configured
- [ ] CORS properly configured
- [ ] Logging configured (without sensitive data)
- [ ] Dependencies updated
- [ ] Monitoring enabled
- [ ] Backups configured
- [ ] Error handling implemented
- [ ] Input validation on all endpoints
- [ ] Output sanitization enabled

## Recommended Tools

- **npm audit** / **Trivy** / **CodeQL** — all run in CI on every pull request
- **OWASP ZAP** — endpoint security testing
- **Helmet** and **express-rate-limit** — included and enabled by default

## Disclosure Policy

- Report received: acknowledged within 48 hours
- Initial assessment: within 1 week
- Fix developed: as fast as severity allows
- Release: coordinated disclosure — a public advisory is published with the fix

## Contact

Report vulnerabilities through
[GitHub Security Advisories](https://github.com/faizcasm/BackendOS/security/advisories/new).
For everything else, open a regular issue.

Thank you for helping keep BackendOS secure!
