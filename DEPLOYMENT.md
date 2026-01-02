# Deployment Guide

This guide covers deploying BackendOS to various platforms.

## Prerequisites

- Node.js 18+ installed
- Redis server (for caching and jobs)
- Production environment variables configured

## Environment Configuration

Create a `.env` file with production values:

```bash
# Server
PORT=3000
NODE_ENV=production

# JWT - Use strong, unique secrets
JWT_SECRET=<generate-strong-secret>
JWT_REFRESH_SECRET=<generate-strong-secret>
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Redis
REDIS_HOST=your-redis-host
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# File Upload
MAX_FILE_SIZE=10485760
UPLOAD_DIR=./uploads

# AI Services (Optional)
OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=your-anthropic-key

# Logging
LOG_LEVEL=info
```

## Building for Production

```bash
# Install dependencies
npm ci --production

# Build TypeScript
npm run build

# The dist/ folder contains the compiled code
```

## Deployment Options

### 1. Traditional VPS/Server

#### Using PM2

```bash
# Install PM2 globally
npm install -g pm2

# Start the application
pm2 start dist/index.js --name backendos

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
```

PM2 Configuration (`ecosystem.config.js`):

```javascript
module.exports = {
  apps: [{
    name: 'backendos',
    script: './dist/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production'
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};

// Start with: pm2 start ecosystem.config.js
```

### 2. Docker Deployment

Create `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --production

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Expose port
EXPOSE 3000

# Start application
CMD ["node", "dist/index.js"]
```

Create `.dockerignore`:

```
node_modules
dist
.env
.git
logs
uploads
*.log
```

Build and run:

```bash
# Build image
docker build -t backendos .

# Run container
docker run -d \
  -p 3000:3000 \
  --name backendos \
  --env-file .env \
  backendos
```

### 3. Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - REDIS_HOST=redis
    env_file:
      - .env
    depends_on:
      - redis
    volumes:
      - ./uploads:/app/uploads
      - ./logs:/app/logs
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    restart: unless-stopped
    command: redis-server --appendonly yes

volumes:
  redis-data:
```

Run with:

```bash
docker-compose up -d
```

### 4. Cloud Platforms

#### Heroku

```bash
# Login to Heroku
heroku login

# Create app
heroku create your-app-name

# Add Redis addon
heroku addons:create heroku-redis:mini

# Set environment variables
heroku config:set JWT_SECRET=your-secret
heroku config:set NODE_ENV=production

# Deploy
git push heroku main
```

`Procfile`:

```
web: node dist/index.js
```

#### DigitalOcean App Platform

1. Connect your GitHub repository
2. Configure build command: `npm run build`
3. Configure run command: `node dist/index.js`
4. Add Redis database from marketplace
5. Set environment variables
6. Deploy

#### AWS Elastic Beanstalk

```bash
# Install EB CLI
pip install awsebcli

# Initialize
eb init

# Create environment
eb create backendos-prod

# Deploy
eb deploy
```

#### Google Cloud Run

```bash
# Build container
gcloud builds submit --tag gcr.io/PROJECT_ID/backendos

# Deploy
gcloud run deploy backendos \
  --image gcr.io/PROJECT_ID/backendos \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```

### 5. Kubernetes

Create `k8s/deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backendos
spec:
  replicas: 3
  selector:
    matchLabels:
      app: backendos
  template:
    metadata:
      labels:
        app: backendos
    spec:
      containers:
      - name: backendos
        image: your-registry/backendos:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: REDIS_HOST
          value: "redis-service"
        envFrom:
        - secretRef:
            name: backendos-secrets
        livenessProbe:
          httpGet:
            path: /api/health/live
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /api/health/ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: backendos-service
spec:
  selector:
    app: backendos
  ports:
  - port: 80
    targetPort: 3000
  type: LoadBalancer
```

Deploy:

```bash
kubectl apply -f k8s/
```

## Post-Deployment

### 1. Health Checks

Verify the deployment:

```bash
# Health check
curl https://your-domain.com/api/health

# Metrics
curl https://your-domain.com/api/health/metrics
```

### 2. Monitoring

Set up monitoring:

- Application logs
- Error tracking (e.g., Sentry)
- Uptime monitoring (e.g., UptimeRobot)
- Performance monitoring (e.g., New Relic, DataDog)

### 3. SSL/TLS

Use a reverse proxy (Nginx, Caddy) or platform SSL:

Nginx example:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 4. Backup Strategy

- Regular database backups
- Redis persistence configuration
- Upload files backup
- Configuration backups

### 5. Scaling

Horizontal scaling considerations:

- Use Redis for session storage
- Share upload directory (NFS, S3)
- Load balancer configuration
- Database connection pooling

## Troubleshooting

### Application won't start

```bash
# Check logs
pm2 logs backendos
# or
docker logs backendos

# Check environment variables
pm2 env 0

# Verify Node version
node --version
```

### Redis connection issues

```bash
# Test Redis connection
redis-cli -h your-redis-host -p 6379 -a your-password ping

# Check Redis logs
```

### High memory usage

```bash
# Monitor with PM2
pm2 monit

# Check for memory leaks
node --inspect dist/index.js
```

## Performance Optimization

1. **Enable caching** - Use the caching module
2. **Connection pooling** - Configure for database
3. **Compression** - Enable gzip compression
4. **CDN** - Use CDN for static files
5. **Clustering** - Use PM2 cluster mode

## Security Checklist

- [ ] Environment variables secured
- [ ] HTTPS enabled
- [ ] Rate limiting configured
- [ ] Security headers enabled (Helmet)
- [ ] CORS properly configured
- [ ] Database credentials secured
- [ ] Redis password set
- [ ] File upload restrictions enabled
- [ ] Logs don't contain sensitive data
- [ ] Regular dependency updates

## Support

For deployment issues:
- Check application logs
- Review health check endpoints
- Consult cloud provider documentation
- Open an issue on GitHub

Happy deploying! 🚀
