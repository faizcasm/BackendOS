/**
 * Full Featured Example
 * 
 * Demonstrates all BackendOS modules working together
 */

import { backendOS } from '../src/core/app';
import { authModule, authenticate } from '../src/modules/auth';
import { cachingModule } from '../src/modules/caching';
import { jobsModule } from '../src/modules/jobs';
import { fileUploadModule } from '../src/modules/file-upload';
import { aiHelpersModule } from '../src/modules/ai-helpers';
import { loggingModule } from '../src/modules/logging';

// Example: Using the caching module
async function cacheExample() {
  console.log('\n=== Caching Example ===');
  
  // Set a value
  await cachingModule.service.set('user:123', {
    id: '123',
    name: 'John Doe',
    email: 'john@example.com',
  }, { ttl: 300 });
  
  // Get the value
  const user = await cachingModule.service.get('user:123');
  console.log('Cached user:', user);
}

// Example: Using the jobs module
async function jobsExample() {
  console.log('\n=== Jobs Example ===');
  
  // Define a job processor
  jobsModule.service.processJobs('email', async (job) => {
    console.log('Processing email job:', job.data);
    // Simulate sending email
    await new Promise(resolve => setTimeout(resolve, 1000));
    return { sent: true };
  });
  
  // Add jobs
  await jobsModule.service.addJob('email', {
    to: 'user@example.com',
    subject: 'Welcome to BackendOS!',
    body: 'Thank you for trying our platform.',
  });
  
  console.log('Email job added to queue');
}

// Example: Using AI helpers (requires API keys)
async function aiExample() {
  console.log('\n=== AI Helpers Example ===');
  
  try {
    // Using a prompt template
    const prompt = aiHelpersModule.service.getPrompt('code-review', {
      code: 'function add(a, b) { return a + b; }',
    });
    
    console.log('Generated prompt:', prompt);
    
    // List available templates
    const templates = aiHelpersModule.service.listPromptTemplates();
    console.log('Available templates:', templates);
  } catch (error: any) {
    console.log('AI example (requires API key):', error.message);
  }
}

// Example: Using file upload
function fileUploadExample() {
  console.log('\n=== File Upload Example ===');
  
  const app = backendOS.getApp();
  
  // Add a custom upload route
  app.post('/custom-upload', 
    fileUploadModule.middleware.single('file'),
    (req: any, res) => {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }
      
      loggingModule.service.info('File uploaded', {
        filename: req.file.filename,
        size: req.file.size,
      });
      
      res.json({
        message: 'File uploaded successfully',
        file: {
          filename: req.file.filename,
          size: req.file.size,
        },
      });
    }
  );
  
  console.log('Custom upload route added');
}

// Example: Using authentication with caching
function authWithCacheExample() {
  console.log('\n=== Auth + Cache Example ===');
  
  const app = backendOS.getApp();
  
  // Cached user profile endpoint
  app.get('/profile',
    authenticate,
    cachingModule.middleware(60), // Cache for 60 seconds
    async (req: any, res) => {
      const user = authModule.service.getUserById(req.user.userId);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      res.json({
        id: user.id,
        email: user.email,
        createdAt: user.createdAt,
      });
    }
  );
  
  console.log('Cached profile endpoint added');
}

// Main function
async function main() {
  console.log('🚀 Starting Full Featured BackendOS Example\n');
  
  // Start the main application
  await backendOS.start();
  
  // Wait a bit for initialization
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Run examples
  await cacheExample();
  await jobsExample();
  await aiExample();
  fileUploadExample();
  authWithCacheExample();
  
  console.log(`
✅ All examples loaded!

API Endpoints:
- GET  /                     - API info
- POST /auth/register        - Register user
- POST /auth/login           - Login user
- GET  /auth/me              - Get current user (protected)
- POST /custom-upload        - Upload file
- GET  /profile              - User profile (cached)
- GET  /health               - Health check
- GET  /health/metrics       - System metrics
- POST /api/upload/single    - Single file upload
- POST /api/upload/multiple  - Multiple file upload
- POST /api/ai/complete      - AI completion
- GET  /api/ai/templates     - List AI templates

Try these commands:
# Register a user
curl -X POST http://localhost:3000/api/auth/register \\
  -H "Content-Type: application/json" \\
  -d '{"email":"test@example.com","password":"password123"}'

# Login
curl -X POST http://localhost:3000/api/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"email":"test@example.com","password":"password123"}'

# Health check
curl http://localhost:3000/api/health

# System metrics
curl http://localhost:3000/api/health/metrics
  `);
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('\nShutting down...');
  await backendOS.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await backendOS.shutdown();
  process.exit(0);
});

main().catch(console.error);
