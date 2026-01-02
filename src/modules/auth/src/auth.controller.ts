import { Router, Request, Response } from 'express';
import Joi from 'joi';
import { AuthService } from './auth.service';
import { authenticate } from './auth.middleware';
import { AuthRequest } from '../../../shared/types';

const router = Router();
const authService = new AuthService();

// Validation schemas
const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

// Register endpoint
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { email, password } = value;
    const user = await authService.register(email, password);

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt,
      },
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Login endpoint
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { email, password } = value;
    const tokens = await authService.login(email, password);

    res.json({
      message: 'Login successful',
      ...tokens,
    });
  } catch (error: any) {
    res.status(401).json({ error: error.message });
  }
});

// Refresh token endpoint
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    const accessToken = await authService.refreshAccessToken(refreshToken);
    res.json({ accessToken });
  } catch (error: any) {
    res.status(401).json({ error: error.message });
  }
});

// Logout endpoint
router.post('/logout', (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    authService.logout(refreshToken);
    res.json({ message: 'Logout successful' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Get current user (protected route)
router.get('/me', authenticate, (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const user = authService.getUserById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user.id,
      email: user.email,
      createdAt: user.createdAt,
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
