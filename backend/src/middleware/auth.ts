import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { UserRepository } from '../models/UserRepository.js';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name: string;
      };
    }
  }
}

export interface JWTPayload {
  userId: string;
  email: string;
  name: string;
  iat?: number;
  exp?: number;
}

export class AuthMiddleware {
  private userRepository: UserRepository;

  constructor() {
    this.userRepository = new UserRepository();
  }

  // Generate JWT token
  generateToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
    return jwt.sign(payload, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn,
    } as jwt.SignOptions);
  }

  // Verify JWT token
  verifyToken(token: string): JWTPayload {
    return jwt.verify(token, config.jwtSecret) as JWTPayload;
  }

  // Middleware to authenticate requests
  authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ 
          error: 'Authentication required',
          code: 'MISSING_TOKEN' 
        });
        return;
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix
      
      try {
        const decoded = this.verifyToken(token);
        
        // Verify user still exists in database
        const user = await this.userRepository.findById(decoded.userId);
        if (!user) {
          res.status(401).json({ 
            error: 'User not found',
            code: 'USER_NOT_FOUND' 
          });
          return;
        }

        // Add user info to request
        req.user = {
          id: decoded.userId,
          email: decoded.email,
          name: decoded.name,
        };

        next();
      } catch (jwtError) {
        if (jwtError instanceof jwt.TokenExpiredError) {
          res.status(401).json({ 
            error: 'Token expired',
            code: 'TOKEN_EXPIRED' 
          });
          return;
        }
        
        if (jwtError instanceof jwt.JsonWebTokenError) {
          res.status(401).json({ 
            error: 'Invalid token',
            code: 'INVALID_TOKEN' 
          });
          return;
        }
        
        throw jwtError;
      }
    } catch (error) {
      console.error('Authentication error:', error);
      res.status(500).json({ 
        error: 'Authentication failed',
        code: 'AUTH_ERROR' 
      });
    }
  };

  // Optional authentication - doesn't fail if no token provided
  optionalAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      next();
      return;
    }

    // If token is provided, validate it
    await this.authenticate(req, res, next);
  };

  // Refresh token endpoint helper
  refreshToken = async (req: Request, res: Response): Promise<void> => {
    try {
      const { refreshToken } = req.body;
      
      if (!refreshToken) {
        res.status(400).json({ 
          error: 'Refresh token required',
          code: 'MISSING_REFRESH_TOKEN' 
        });
        return;
      }

      try {
        const decoded = this.verifyToken(refreshToken);
        
        // Verify user still exists
        const user = await this.userRepository.findById(decoded.userId);
        if (!user) {
          res.status(401).json({ 
            error: 'User not found',
            code: 'USER_NOT_FOUND' 
          });
          return;
        }

        // Generate new token
        const newToken = this.generateToken({
          userId: user.id,
          email: user.email,
          name: user.name,
        });

        res.json({
          token: newToken,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            preferences: user.preferences,
          },
        });
      } catch (jwtError) {
        res.status(401).json({ 
          error: 'Invalid refresh token',
          code: 'INVALID_REFRESH_TOKEN' 
        });
      }
    } catch (error) {
      console.error('Token refresh error:', error);
      res.status(500).json({ 
        error: 'Token refresh failed',
        code: 'REFRESH_ERROR' 
      });
    }
  };
}

// Export singleton instance
export const authMiddleware = new AuthMiddleware();

// Export the authenticate method as a standalone function for convenience
export const authenticateToken = authMiddleware.authenticate;