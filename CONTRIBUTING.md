# Contributing to BackendOS

Thank you for your interest in contributing to BackendOS! This guide will help you get started.

## Development Setup

1. **Fork and Clone**
   ```bash
   git clone https://github.com/YOUR_USERNAME/BackendOS.git
   cd BackendOS
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Copy Environment Variables**
   ```bash
   cp .env.example .env
   ```

4. **Build the Project**
   ```bash
   npm run build
   ```

5. **Run Tests**
   ```bash
   npm test
   ```

## Project Structure

```
BackendOS/
├── src/
│   ├── modules/          # Feature modules (modular monolith)
│   │   ├── auth/        # Authentication module
│   │   ├── caching/     # Caching module
│   │   └── ...          # Other modules
│   ├── shared/          # Shared utilities and types
│   │   ├── types/      # TypeScript type definitions
│   │   └── utils/      # Shared utilities
│   └── core/           # Core application
├── examples/           # Usage examples
├── tests/             # Test files
└── docs/              # Documentation
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

Thank you for contributing to BackendOS! 🚀
