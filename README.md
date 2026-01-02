# BackendOS

> A modular monolith backend platform providing ready-to-use infrastructure features for any SaaS application.

## 🚀 Features

BackendOS is a production-ready backend platform that includes all essential infrastructure features out of the box:

- **🔐 Authentication** - JWT-based auth with access and refresh tokens, password hashing, OAuth2-ready
- **⚡ Rate Limiting** - Configurable rate limiters with multiple strategies (IP-based, user-based)
- **💾 Caching** - Redis-based caching with automatic in-memory fallback
- **⏰ Background Jobs** - Job queuing and scheduling with Bull and Redis
- **📁 File Uploads** - Secure file upload handling with validation and storage abstraction
- **📝 Logging** - Structured logging with Winston, multiple transports and log levels
- **🏥 Monitoring** - Health checks, system metrics, and uptime tracking
- **🤖 AI Helpers** - Integration with OpenAI and Anthropic (Claude) with prompt templates

## 🏗️ Architecture

BackendOS follows a **modular monolith** architecture where each feature is:

- Self-contained in its own module
- Independently maintainable
- Easily extractable into a microservice if needed
- Communicates through well-defined interfaces

### Module Structure

```
src/
├── modules/           # Feature modules
│   ├── auth/         # Authentication module
│   ├── rate-limiting/ # Rate limiting module
│   ├── caching/      # Caching module
│   ├── jobs/         # Background jobs module
│   ├── file-upload/  # File upload module
│   ├── logging/      # Logging module
│   ├── monitoring/   # Monitoring module
│   └── ai-helpers/   # AI integration module
├── shared/           # Shared utilities and types
│   ├── types/       # TypeScript type definitions
│   ├── utils/       # Shared utilities
│   └── middleware/  # Shared middleware
└── core/            # Core application
    └── app.ts       # Main application orchestrator
```

## 🛠️ Installation

```bash
# Clone the repository
git clone https://github.com/faizcasm/BackendOS.git
cd BackendOS

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Edit .env with your configuration
nano .env
```

## ⚙️ Configuration

Edit `.env` file to configure the platform:

```env
# Server
PORT=3000
NODE_ENV=development

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key
JWT_REFRESH_SECRET=your-refresh-secret-key

# Redis (for caching and jobs)
REDIS_HOST=localhost
REDIS_PORT=6379

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# File Upload
MAX_FILE_SIZE=10485760
UPLOAD_DIR=./uploads

# AI Services (Optional)
OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=your-anthropic-key
```

## 🚀 Quick Start

### Development Mode

```bash
npm run dev
```

### Production Mode

```bash
# Build the project
npm run build

# Start the server
npm start
```

## 📚 API Documentation

### Authentication Module

#### Register User
```bash
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

#### Login
```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

#### Get Current User
```bash
GET /api/auth/me
Authorization: Bearer <access_token>
```

### File Upload Module

#### Upload Single File
```bash
POST /api/upload/single
Content-Type: multipart/form-data
file: <file>
```

#### Upload Multiple Files
```bash
POST /api/upload/multiple
Content-Type: multipart/form-data
files: <file1>, <file2>, ...
```

### Monitoring Module

#### Health Check
```bash
GET /api/health
```

#### System Metrics
```bash
GET /api/health/metrics
```

### AI Helpers Module

#### Generate Completion
```bash
POST /api/ai/complete
Content-Type: application/json

{
  "prompt": "Write a hello world function in Python",
  "provider": "openai",
  "model": "gpt-4",
  "temperature": 0.7
}
```

#### List Prompt Templates
```bash
GET /api/ai/templates
```

## 🔧 Using Modules in Your Code

BackendOS modules can be easily integrated into your application:

```typescript
import { backendOS } from './core/app';

// Start the server
await backendOS.start();

// Access modules
const authModule = backendOS.getModule('auth');
const cachingModule = backendOS.getModule('caching');

// Use services
await cachingModule.service.set('key', 'value', { ttl: 300 });
const value = await cachingModule.service.get('key');

// Add background jobs
const jobsModule = backendOS.getModule('jobs');
await jobsModule.service.addJob('email', { to: 'user@example.com' });
```

## 🎯 Module-Specific Documentation

Each module has its own README with detailed documentation:

- [Authentication Module](./src/modules/auth/README.md)
- [Rate Limiting Module](./src/modules/rate-limiting/README.md)
- [Caching Module](./src/modules/caching/README.md)
- [Jobs Module](./src/modules/jobs/README.md)
- [File Upload Module](./src/modules/file-upload/README.md)
- [Logging Module](./src/modules/logging/README.md)
- [Monitoring Module](./src/modules/monitoring/README.md)
- [AI Helpers Module](./src/modules/ai-helpers/README.md)

## 🔐 Security Features

- **Helmet.js** - Security headers
- **CORS** - Cross-Origin Resource Sharing
- **Rate Limiting** - DDoS protection
- **JWT Authentication** - Secure token-based auth
- **Password Hashing** - bcrypt with salt
- **File Upload Validation** - Type and size checks

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch
```

## 📦 Building for Production

```bash
# Build TypeScript
npm run build

# The compiled code will be in the dist/ folder
```

## 🐳 Docker Deployment (Coming Soon)

```bash
# Build image
docker build -t backendos .

# Run container
docker run -p 3000:3000 backendos
```

## 🤝 Contributing

Contributions are welcome! This is a modular monolith, so:

1. Each feature should be in its own module
2. Modules should be self-contained
3. Follow the existing module structure
4. Add tests for new features
5. Update documentation

## 📝 License

MIT License - feel free to use this in your projects!

## 🌟 Roadmap

- [ ] Database abstraction layer (PostgreSQL, MySQL, MongoDB)
- [ ] WebSocket support
- [ ] Email service integration
- [ ] Payment gateway integration
- [ ] Multi-tenancy support
- [ ] API documentation with Swagger
- [ ] Docker and Kubernetes deployment
- [ ] GraphQL support
- [ ] Real-time analytics
- [ ] Admin dashboard

## 💡 Use Cases

Perfect for:
- SaaS applications
- API backends
- Mobile app backends
- Microservices gateway
- Prototype backends
- Production-ready MVPs

## 📧 Support

For issues and questions, please open an issue on GitHub.

---

**Built with ❤️ using TypeScript, Express, and modern best practices.**
