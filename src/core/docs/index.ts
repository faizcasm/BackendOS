import { Router, type Request, type Response } from 'express';
import swaggerUi from 'swagger-ui-express';
import { config } from '../config';
import { packageJson } from '../package';

/**
 * OpenAPI 3.0 document served at `DOCS_PATH` (default `/api/docs`).
 * Kept in code so it always matches the running build and can be imported by
 * client generators (`openapi.yaml` can be exported from `/api/docs.json`).
 */
export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'BackendOS API',
    version: packageJson.version,
    description:
      'Modular monolith backend platform: authentication, uploads, health checks and AI helpers.',
    license: { name: 'MIT', url: 'https://opensource.org/licenses/MIT' },
  },
  servers: [{ url: '/', description: 'Current host' }],
  tags: [
    { name: 'Meta', description: 'Service information' },
    { name: 'Auth', description: 'Registration, login and session management' },
    { name: 'Uploads', description: 'Authenticated file uploads' },
    { name: 'Health', description: 'Health checks and metrics' },
    { name: 'AI', description: 'LLM completions and prompt templates' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Access token returned by `/api/auth/login`',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        required: ['error', 'code'],
        properties: {
          error: { type: 'string', description: 'Human readable message' },
          code: { type: 'string', example: 'VALIDATION_ERROR' },
          requestId: { type: 'string', format: 'uuid' },
          details: { type: 'array', items: { type: 'object' } },
        },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email' },
          role: { type: 'string', enum: ['USER', 'ADMIN', 'MODERATOR'] },
          isActive: { type: 'boolean' },
          lastLoginAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Tokens: {
        type: 'object',
        properties: {
          accessToken: { type: 'string' },
          refreshToken: { type: 'string', description: 'Rotates on every refresh' },
        },
      },
      File: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          filename: { type: 'string' },
          originalName: { type: 'string' },
          mimeType: { type: 'string' },
          size: { type: 'integer', format: 'int64' },
          uploadedBy: { type: 'string', format: 'uuid' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Health: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
          timestamp: { type: 'string', format: 'date-time' },
          uptime: { type: 'integer' },
          environment: { type: 'string' },
          services: { type: 'object', additionalProperties: true },
        },
      },
    },
    responses: {
      BadRequest: {
        description: 'Validation failed',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      Unauthorized: {
        description: 'Missing or invalid credentials',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      NotFound: {
        description: 'Resource not found',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      RateLimited: {
        description: 'Too many requests',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      ServerError: {
        description: 'Unexpected server error',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
    },
  },
  security: [],
  paths: {
    '/': {
      get: {
        tags: ['Meta'],
        summary: 'Service metadata and enabled modules',
        responses: {
          '200': {
            description: 'Service info',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    version: { type: 'string' },
                    modules: { type: 'array', items: { type: 'object' } },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Create an account',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: {
                    type: 'string',
                    minLength: 8,
                    description: 'At least 8 characters including a letter and a digit',
                  },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Account created',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string' },
                    user: { $ref: '#/components/schemas/User' },
                  },
                },
              },
            },
          },
          '409': { $ref: '#/components/responses/BadRequest' },
          '429': { $ref: '#/components/responses/RateLimited' },
        },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Exchange credentials for tokens',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Token pair',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string' },
                    accessToken: { type: 'string' },
                    refreshToken: { type: 'string' },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '429': { $ref: '#/components/responses/RateLimited' },
        },
      },
    },
    '/api/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Rotate the refresh token and get a new access token',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['refreshToken'],
                properties: { refreshToken: { type: 'string' } },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Rotated token pair',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Tokens' } } },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/api/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Revoke a refresh token',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['refreshToken'],
                properties: { refreshToken: { type: 'string' } },
              },
            },
          },
        },
        responses: { '200': { description: 'Session revoked' } },
      },
    },
    '/api/auth/logout-all': {
      post: {
        tags: ['Auth'],
        summary: 'Revoke every session for the current user',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'All sessions revoked' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/api/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Current user profile',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Profile',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { user: { $ref: '#/components/schemas/User' } },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/api/auth/change-password': {
      post: {
        tags: ['Auth'],
        summary: 'Change password (revokes all sessions)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['currentPassword', 'newPassword'],
                properties: {
                  currentPassword: { type: 'string' },
                  newPassword: { type: 'string', minLength: 8 },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Password updated' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/api/auth/users': {
      get: {
        tags: ['Auth'],
        summary: 'List users (ADMIN only)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 } },
        ],
        responses: {
          '200': { description: 'Paginated users' },
          '403': { description: 'Forbidden' },
        },
      },
    },
    '/api/upload/single': {
      post: {
        tags: ['Uploads'],
        summary: 'Upload a single file',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file'],
                properties: { file: { type: 'string', format: 'binary' } },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Uploaded',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { file: { $ref: '#/components/schemas/File' } },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '413': { description: 'File too large' },
        },
      },
    },
    '/api/upload/multiple': {
      post: {
        tags: ['Uploads'],
        summary: 'Upload up to 10 files',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['files'],
                properties: {
                  files: { type: 'array', items: { type: 'string', format: 'binary' } },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Uploaded' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/api/upload': {
      get: {
        tags: ['Uploads'],
        summary: 'List the caller’s files',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'File list' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/api/upload/{filename}': {
      get: {
        tags: ['Uploads'],
        summary: 'File metadata',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'filename', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Metadata' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      delete: {
        tags: ['Uploads'],
        summary: 'Delete a file you own',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'filename', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Deleted' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/health': {
      get: {
        tags: ['Health'],
        summary: 'Dependency health report',
        responses: {
          '200': {
            description: 'Healthy or degraded',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Health' } } },
          },
          '503': { description: 'Unhealthy' },
        },
      },
    },
    '/api/health/ready': {
      get: {
        tags: ['Health'],
        summary: 'Kubernetes readiness probe',
        responses: { '200': { description: 'Ready' }, '503': { description: 'Not ready' } },
      },
    },
    '/api/health/live': {
      get: {
        tags: ['Health'],
        summary: 'Kubernetes liveness probe',
        responses: { '200': { description: 'Alive' } },
      },
    },
    '/api/health/metrics': {
      get: {
        tags: ['Health'],
        summary: 'JSON process metrics',
        responses: { '200': { description: 'Metrics' } },
      },
    },
    '/metrics': {
      get: {
        tags: ['Health'],
        summary: 'Prometheus metrics (text/plain)',
        responses: { '200': { description: 'Metrics exposition' } },
      },
    },
    '/api/ai/complete': {
      post: {
        tags: ['AI'],
        summary: 'Generate a completion',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['prompt'],
                properties: {
                  prompt: { type: 'string' },
                  provider: { type: 'string', enum: ['openai', 'anthropic'], default: 'openai' },
                  model: { type: 'string' },
                  temperature: { type: 'number', minimum: 0, maximum: 2 },
                  maxTokens: { type: 'integer', minimum: 1, maximum: 8000 },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Completion',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { completion: { type: 'string' } } },
              },
            },
          },
          '503': { description: 'Provider not configured' },
        },
      },
    },
    '/api/ai/templates': {
      get: {
        tags: ['AI'],
        summary: 'List prompt templates',
        responses: { '200': { description: 'Template names' } },
      },
    },
  },
};

/** Swagger UI + machine-readable spec endpoints. */
export const createDocsRouter = (): Router => {
  const router = Router();

  router.get('/openapi.json', (_req: Request, res: Response) => {
    res.json(openApiDocument);
  });

  router.use(
    '/',
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, {
      customSiteTitle: 'BackendOS API Docs',
      docExpansion: 'list',
      deepLinking: true,
      swaggerOptions: { persistAuthorization: true },
    } as swaggerUi.SwaggerUiOptions)
  );

  return router;
};

export const docsPath = (): string => config.docs.path;
