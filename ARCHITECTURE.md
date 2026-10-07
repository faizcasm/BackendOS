# Architecture Guide

## Big Picture

BackendOS is a single Node.js/TypeScript service organized in three layers:

```
src/
├── core/                    # Application kernel — shared by every module
│   ├── app.ts               # Express bootstrap, middleware order, route mounting
│   ├── config/              # Joi-validated environment config (fail-fast in production)
│   ├── db/                  # Prisma client (driver adapter) + lifecycle helpers
│   ├── redis/               # ioredis client, options, reconnect/disconnect handling
│   ├── logger/              # Winston structured logger + request loggers
│   ├── errors/              # Typed application errors + HTTP mapping
│   ├── middlewares/         # security, cors, request-id, logging, metrics,
│   │                        # rate limit, audit, error/not-found handlers
│   ├── docs/                # OpenAPI spec + Swagger UI router
│   └── package.ts           # package.json reader (name/version) for metadata
├── modules/                 # Feature modules — the product surface
│   ├── auth/  caching/  jobs/  file-upload/
│   ├── rate-limiting/  logging/  monitoring/  ai-helpers/
├── shared/                  # Cross-cutting types and thin utilities
├── index.ts                 # Library barrel (side-effect free)
└── server.ts                # Executable entrypoint (reads config, starts server)
```

### Request pipeline

Middleware is applied in a fixed order in `src/core/app.ts`:

1. `securityHeaders` (Helmet) → `corsMiddleware` → `compression`
2. `requestIdMiddleware` — assigns/propagates `x-request-id`
3. Body parsing (JSON/urlencoded with configured `bodyLimit`)
4. `loggingModule.middleware` and `metricsMiddleware` (when enabled)
5. Per-route rate limiters and auth chains
6. Module routers (`/api/health`, `/api/auth`, `/api/upload`, `/api/ai`)
7. `notFoundHandler` → `errorHandler` (typed errors → JSON responses)

Health probes (`/api/health/*`) and the Prometheus endpoint (`/metrics`) bypass
logging/metrics middleware to keep noise out of the signal.

### Data layer

- **PostgreSQL via Prisma** is the source of truth (users, refresh tokens, audit
  trail, module-owned records). Migrations live in `prisma/migrations`; CI/CD
  applies them with `prisma migrate deploy`.
- **Redis** is used for caching, shared rate-limit counters and BullMQ. It is
  optional: with `REDIS_REQUIRED=false` the app boots without it and degrades
  (in-process fallbacks / disabled queues) instead of crashing.

## Modular Monolith Principles

BackendOS is built as a modular monolith, which combines the benefits of both monolithic and microservices architectures.

### What is a Modular Monolith?

A modular monolith is a software architecture where:
- All code runs in a single application (monolith)
- Code is organized into independent, loosely-coupled modules
- Each module has clear boundaries and interfaces
- Modules can be easily extracted into microservices later

### Benefits

1. **Simplified Development**: Single codebase, easier debugging
2. **Lower Operational Complexity**: One application to deploy and monitor
3. **Better Performance**: No network overhead between modules
4. **Flexible Evolution**: Easy to extract modules into microservices when needed
5. **Easier Testing**: Can test entire application or individual modules

## Module Structure

Each module in BackendOS follows this structure:

```
module-name/
├── README.md           # Module documentation
├── index.ts           # Module entry point (exports public API)
└── src/
    ├── service.ts     # Business logic
    ├── controller.ts  # HTTP handlers (if applicable)
    └── middleware.ts  # Module-specific middleware (if applicable)
```

### Module Interface

Each module exports:

```typescript
export class ModuleName {
  public readonly metadata: ModuleMetadata;  // Module info
  public readonly service: Service;          // Core service
  public readonly router?: Router;           // HTTP routes (optional)
  public readonly middleware?: Middleware;   // Middleware (optional)
  
  async initialize(): Promise<void>;         // Startup logic
  async shutdown(): Promise<void>;           // Cleanup logic
}
```

## Communication Between Modules

Modules communicate through:

1. **Direct Service Calls**: Import and use another module's service
2. **Shared Types**: Use types from `src/shared/types`
3. **Events**: (Future) Event-driven communication

Example:
```typescript
import { cachingModule } from '../caching';
import { loggingModule } from '../logging';

// Use caching service
await cachingModule.service.set('key', 'value');

// Use logging service
loggingModule.service.info('Operation completed');
```

## Adding a New Module

1. Create module directory: `src/modules/my-module/`
2. Create README.md with module documentation
3. Create `src/` subdirectory with service, controller, etc.
4. Create `index.ts` that exports the module class
5. Add module to `src/core/app.ts` (mount its router, if any)
6. Add any configuration to `src/core/config/index.ts` and document it in `.env.example`

Example module:

```typescript
// src/modules/my-module/index.ts
export class MyModule {
  public readonly metadata: ModuleMetadata = {
    name: 'my-module',
    version: '1.0.0',
    description: 'My custom module',
    enabled: true,
  };

  public readonly service: MyService;
  public readonly router: Router;

  constructor() {
    this.service = new MyService();
    this.router = createRoutes(this.service);
  }

  async initialize(): Promise<void> {
    console.log(`[${this.metadata.name}] Module initialized`);
  }

  async shutdown(): Promise<void> {
    console.log(`[${this.metadata.name}] Module shutdown`);
  }
}
```

## Extracting to Microservices

When a module needs to become a microservice:

1. The module already has clear boundaries
2. Copy the module directory to a new repository
3. Add HTTP/gRPC client in the original app
4. Replace direct service calls with API calls
5. No changes needed to the module's internal code

## Best Practices

1. **Single Responsibility**: Each module should have one clear purpose
2. **Loose Coupling**: Modules should depend on interfaces, not implementations
3. **High Cohesion**: Related functionality should be in the same module
4. **Clear Interfaces**: Public API should be well-defined and documented
5. **Independent Testing**: Each module should be testable in isolation
6. **No Circular Dependencies**: Modules should not depend on each other cyclically

## Module Dependencies

Allowed dependencies:
- ✅ Modules can depend on `shared/` utilities and types
- ✅ Modules can depend on external npm packages
- ✅ Modules can import and use other module services
- ❌ Modules should not have circular dependencies
- ❌ Modules should not reach into other modules' internals

## Testing Strategy

1. **Unit Tests**: Test individual functions and classes
2. **Integration Tests**: Test module services with dependencies
3. **API Tests**: Test HTTP endpoints end-to-end
4. **Module Tests**: Test entire module in isolation

Example:
```typescript
// auth.service.test.ts
describe('AuthService', () => {
  it('should register a new user', async () => {
    const service = new AuthService();
    const user = await service.register('test@example.com', 'password123');
    expect(user.email).toBe('test@example.com');
  });
});
```

## Configuration Management

Each module's configuration:
- Lives in `src/core/config/index.ts` (single Joi schema; `src/shared/utils/config.ts`
  is a deprecated re-export of the same object)
- Can be toggled on/off via environment variables (`MODULE_*`)
- Has sensible defaults and is validated once at boot
- Is documented in `.env.example`

## Error Handling

Modules should:
- Throw typed errors with clear messages
- Log errors using the logging module
- Not catch and swallow errors silently
- Return appropriate HTTP status codes in controllers

## Performance Considerations

- Use caching module for expensive operations
- Use job queue for long-running tasks
- Implement pagination for large data sets
- Use database indexes appropriately
- Monitor performance with monitoring module
