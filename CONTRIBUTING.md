# Contributing to BackendOS

Thank you for your interest in contributing to BackendOS! This guide will help you get started.

Please note that this project is released with a [Code of Conduct](./CODE_OF_CONDUCT.md);
by participating you agree to abide by its terms.

## Prerequisites

- Node.js **≥ 20** (CI runs on 20 and 22)
- npm ≥ 10 (ships with Node 20+)
- PostgreSQL 14+ — only needed for running migrations/seed or exercising auth against a real DB
- Redis — optional (`REDIS_REQUIRED=false` by default in `.env.example`)

## Development Setup

1. **Fork and clone**
   ```bash
   git clone https://github.com/YOUR_USERNAME/BackendOS.git
   cd BackendOS
   ```

2. **Install dependencies**
   ```bash
   npm install
   npx prisma generate   # generate the Prisma client (needed before typecheck/build)
   ```

3. **Configure your environment**
   ```bash
   cp .env.example .env
   # set DATABASE_URL (and strong JWT secrets) in .env
   ```

4. **Prepare the database** (optional — the test suite does not need it)
   ```bash
   npx prisma migrate dev
   npm run prisma:seed
   ```

5. **Verify everything before you start hacking**
   ```bash
   npm run lint && npm run format:check && npm run typecheck && npm test && npm run build
   ```

## Project Structure

```
BackendOS/
├── src/
│   ├── core/             # app bootstrap, config, db, redis, logger, middlewares, docs
│   ├── modules/          # feature modules (auth, caching, jobs, file-upload, …)
│   │   └── <module>/
│   │       ├── README.md # module documentation
│   │       ├── index.ts  # public API
│   │       └── src/      # implementation
│   ├── shared/           # shared types and utilities
│   ├── index.ts          # library barrel (side-effect free)
│   └── server.ts         # executable entrypoint
├── prisma/               # schema, migrations, seed
├── tests/                # Jest suites (hermetic — no DB/Redis required)
├── examples/             # runnable usage examples
└── monitoring/           # Prometheus + Grafana provisioning
```

## Module Development Guidelines

### Creating a New Module

1. **Create Module Directory**
   ```bash
   mkdir -p src/modules/my-module/src
   ```

2. **Module Structure**
   ```
   my-module/
   ├── README.md           # Module documentation
   ├── index.ts           # Public API exports
   └── src/
       ├── service.ts     # Business logic
       ├── controller.ts  # HTTP handlers (if needed)
       └── middleware.ts  # Middleware (if needed)
   ```

3. **Module Template**
   ```typescript
   // index.ts
   import { ModuleMetadata } from '../../shared/types';
   
   export class MyModule {
     public readonly metadata: ModuleMetadata = {
       name: 'my-module',
       version: '1.0.0',
       description: 'Description of my module',
       enabled: true,
     };
     
     public readonly service: MyService;
     
     constructor() {
       this.service = new MyService();
     }
     
     async initialize(): Promise<void> {
       console.log(`[${this.metadata.name}] Module initialized`);
     }
     
     async shutdown(): Promise<void> {
       console.log(`[${this.metadata.name}] Module shutdown`);
     }
   }
   
   export const myModule = new MyModule();
   ```

4. **Add to Core App**
   - Import module in `src/core/app.ts`
   - Add to modules array
   - Register routes if applicable

### Module Best Practices

- ✅ **Single Responsibility**: One clear purpose per module
- ✅ **Loose Coupling**: Depend on interfaces, not implementations
- ✅ **High Cohesion**: Related functionality together
- ✅ **Clear API**: Well-defined public interface
- ✅ **Self-Contained**: Minimal external dependencies
- ❌ **No Circular Dependencies**: Keep dependency graph acyclic
- ❌ **No Internal Access**: Don't reach into other modules' internals

## Code Style

We use ESLint and Prettier for code formatting:

```bash
# Check linting
npm run lint

# Format code
npm run format
```

### Style Guidelines

- Use TypeScript for all code
- Use async/await over callbacks
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Keep functions small and focused
- Write tests for new features

## Testing

We use Jest for testing:

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

### Writing Tests

```typescript
// my-module.test.ts
import { MyModule } from './my-module';

describe('MyModule', () => {
  let module: MyModule;
  
  beforeEach(() => {
    module = new MyModule();
  });
  
  it('should initialize correctly', async () => {
    await module.initialize();
    expect(module.metadata.enabled).toBe(true);
  });
  
  it('should perform expected operation', async () => {
    const result = await module.service.doSomething();
    expect(result).toBeDefined();
  });
});
```

## Pull Request Process

1. **Create a Branch**
   ```bash
   git checkout -b feature/my-feature
   ```

2. **Make Changes**
   - Write code
   - Add tests
   - Update documentation

3. **Commit Changes**
   ```bash
   git add .
   git commit -m "feat: add my feature"
   ```
   
   Use conventional commits:
   - `feat:` - New feature
   - `fix:` - Bug fix
   - `docs:` - Documentation changes
   - `test:` - Test changes
   - `refactor:` - Code refactoring
   - `chore:` - Build/tooling changes

4. **Push and Create PR**
   ```bash
   git push origin feature/my-feature
   ```
   
   Then create a Pull Request on GitHub

5. **Code Review**
   - Address review comments
   - Ensure CI passes
   - Get approval from maintainers

## Before submitting a pull request

CI must be green for the PR to be merged. Locally, run the same checks:

```bash
npm run lint           # 0 errors (warnings are tolerated)
npm run format:check   # Prettier
npm run typecheck      # tsc for src/ and tests/
npm test               # Jest — 8 suites, hermetic
npm run build          # prisma generate + tsc
```

Also:

- Add or update tests for behaviour changes
- Update `.env.example` and documentation for new configuration
- Keep PRs focused; open separate PRs for unrelated changes
- Update `CHANGELOG.md` for user-facing changes

## Reporting Issues

When reporting issues, please include:

- BackendOS version
- Node.js version
- Operating system
- Steps to reproduce
- Expected behavior
- Actual behavior
- Error messages/logs

## Feature Requests

For feature requests, please:

1. Check if it already exists in issues
2. Describe the problem you're solving
3. Provide use cases
4. Suggest implementation if possible

## Dependency updates

Dependabot opens weekly PRs for **minor and patch** updates (npm, GitHub
Actions, Docker). Major upgrades are handled manually — they can break the
toolchain or runtime APIs (TypeScript, ESLint, BullMQ and ioredis majors have
all required coordinated changes here). To take a major bump:

1. Update `package.json` and run `npm install`
2. Run the full local verification below
3. Fix any type/lint/test fallout in the same PR

## Documentation

- Update README.md for user-facing changes
- Update ARCHITECTURE.md for structural changes
- Add module-specific documentation in module README
- Include code examples

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Questions?

- Open an issue for questions
- Check existing documentation
- Look at example code

Thank you for contributing to BackendOS!
