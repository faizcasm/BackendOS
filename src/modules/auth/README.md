# Auth Module

Provides authentication and authorization functionality for BackendOS.

## Features
- User registration and login
- JWT-based authentication
- Access and refresh tokens
- Password hashing with bcrypt
- Token verification middleware

## API Endpoints
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login user
- `POST /auth/refresh` - Refresh access token
- `POST /auth/logout` - Logout user
- `GET /auth/me` - Get current user (requires authentication)

## Usage

```typescript
import { authModule } from './modules/auth';
app.use('/auth', authModule.router);
```
