import { Request, Response } from 'express';
import { authService } from '../services/auth.js';
import { authMiddleware } from '../middleware/auth.js';

export class AuthController {
  // Register new user
  async register(req: Request, res: Response): Promise<void> {
    try {
      const { email, password, name, preferences } = req.body;

      if (!email || !password || !name) {
        res.status(400).json({
          error: 'Email, password, and name are required',
          code: 'MISSING_FIELDS'
        });
        return;
      }

      const result = await authService.register({
        email,
        password,
        name,
        preferences
      });

      res.status(201).json({
        message: 'User registered successfully',
        ...result
      });
    } catch (error) {
      console.error('Registration error:', error);
      
      if (error instanceof Error) {
        if (error.message.includes('Email already registered')) {
          res.status(409).json({
            error: 'Email already registered',
            code: 'EMAIL_EXISTS'
          });
          return;
        }
        
        if (error.message.includes('Validation failed')) {
          res.status(400).json({
            error: error.message,
            code: 'VALIDATION_ERROR'
          });
          return;
        }
      }

      res.status(500).json({
        error: 'Registration failed',
        code: 'REGISTRATION_ERROR'
      });
    }
  }

  // Login user
  async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({
          error: 'Email and password are required',
          code: 'MISSING_CREDENTIALS'
        });
        return;
      }

      const result = await authService.login({ email, password });

      res.json({
        message: 'Login successful',
        ...result
      });
    } catch (error) {
      console.error('Login error:', error);
      
      if (error instanceof Error) {
        if (error.message.includes('Invalid email or password')) {
          res.status(401).json({
            error: 'Invalid email or password',
            code: 'INVALID_CREDENTIALS'
          });
          return;
        }
        
        if (error.message.includes('Invalid email format')) {
          res.status(400).json({
            error: 'Invalid email format',
            code: 'INVALID_EMAIL'
          });
          return;
        }
      }

      res.status(500).json({
        error: 'Login failed',
        code: 'LOGIN_ERROR'
      });
    }
  }

  // Get current user profile
  async getProfile(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          error: 'Authentication required',
          code: 'NOT_AUTHENTICATED'
        });
        return;
      }

      const user = await authService.getProfile(req.user.id);
      
      if (!user) {
        res.status(404).json({
          error: 'User not found',
          code: 'USER_NOT_FOUND'
        });
        return;
      }

      res.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          preferences: user.preferences,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        }
      });
    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({
        error: 'Failed to get profile',
        code: 'PROFILE_ERROR'
      });
    }
  }

  // Update user profile
  async updateProfile(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          error: 'Authentication required',
          code: 'NOT_AUTHENTICATED'
        });
        return;
      }

      const { name, preferences } = req.body;

      // Check for empty name specifically
      if (name === '') {
        res.status(400).json({
          error: 'Name cannot be empty',
          code: 'VALIDATION_ERROR'
        });
        return;
      }

      if (!name && !preferences) {
        res.status(400).json({
          error: 'At least one field (name or preferences) is required',
          code: 'NO_UPDATE_DATA'
        });
        return;
      }

      const updatedUser = await authService.updateProfile(req.user.id, {
        name,
        preferences
      });

      if (!updatedUser) {
        res.status(404).json({
          error: 'User not found',
          code: 'USER_NOT_FOUND'
        });
        return;
      }

      res.json({
        message: 'Profile updated successfully',
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          name: updatedUser.name,
          preferences: updatedUser.preferences,
          updatedAt: updatedUser.updatedAt
        }
      });
    } catch (error) {
      console.error('Update profile error:', error);
      
      if (error instanceof Error) {
        if (error.message.includes('Name cannot be empty') || 
            error.message.includes('Name must be at least')) {
          res.status(400).json({
            error: error.message,
            code: 'VALIDATION_ERROR'
          });
          return;
        }
      }

      res.status(500).json({
        error: 'Failed to update profile',
        code: 'UPDATE_ERROR'
      });
    }
  }

  // Change password
  async changePassword(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          error: 'Authentication required',
          code: 'NOT_AUTHENTICATED'
        });
        return;
      }

      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        res.status(400).json({
          error: 'Current password and new password are required',
          code: 'MISSING_PASSWORDS'
        });
        return;
      }

      await authService.changePassword(req.user.id, currentPassword, newPassword);

      res.json({
        message: 'Password changed successfully'
      });
    } catch (error) {
      console.error('Change password error:', error);
      
      if (error instanceof Error) {
        if (error.message.includes('Current password is incorrect')) {
          res.status(400).json({
            error: 'Current password is incorrect',
            code: 'INVALID_CURRENT_PASSWORD'
          });
          return;
        }
        
        if (error.message.includes('Password validation failed')) {
          res.status(400).json({
            error: error.message,
            code: 'PASSWORD_VALIDATION_ERROR'
          });
          return;
        }
        
        if (error.message.includes('User not found')) {
          res.status(404).json({
            error: 'User not found',
            code: 'USER_NOT_FOUND'
          });
          return;
        }
      }

      res.status(500).json({
        error: 'Failed to change password',
        code: 'PASSWORD_CHANGE_ERROR'
      });
    }
  }

  // Refresh token
  async refreshToken(req: Request, res: Response): Promise<void> {
    await authMiddleware.refreshToken(req, res);
  }

  // Logout (client-side token invalidation)
  async logout(_req: Request, res: Response): Promise<void> {
    // Since we're using stateless JWT tokens, logout is handled client-side
    // by removing the token from storage. This endpoint just confirms logout.
    res.json({
      message: 'Logged out successfully'
    });
  }
}

// Export singleton instance
export const authController = new AuthController();