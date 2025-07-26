import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthMiddleware } from '../middleware/auth.js';
import { UserRepository } from '../models/UserRepository.js';
import { config } from '../config/index.js';
import type { User } from 'chicken-scratch-shared/types/models';

// Mock dependencies
vi.mock('../models/UserRepository.js');
vi.mock('jsonwebtoken');
vi.mock('../config/index.js', () => ({
  config: {
    jwtSecret: 'test-secret',
    jwtExpiresIn: '7d'
  }
}));

describe('AuthMiddleware', () => {
  let authMiddleware: AuthMiddleware;
  let mockUserRepository: any;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  const mockUser: User = {
    id: 'user-123',
    email: 'test@example.com',
    name: 'Test User',
    passwordHash: 'hashed-password',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    preferences: {
      defaultClusteringMethod: 'hybrid',
      autoProcessing: true,
      exportFormat: 'pdf',
      theme: 'light'
    }
  };

  const mockJWTPayload = {
    userId: 'user-123',
    email: 'test@example.com',
    name: 'Test User',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock UserRepository
    mockUserRepository = {
      findById: vi.fn()
    };
    (UserRepository as any).mockImplementation(() => mockUserRepository);

    authMiddleware = new AuthMiddleware();

    // Mock Express objects
    mockRequest = {
      headers: {},
      body: {}
    };

    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };

    mockNext = vi.fn();
  });

  describe('generateToken', () => {
    it('should generate JWT token with correct payload', () => {
      const payload = {
        userId: 'user-123',
        email: 'test@example.com',
        name: 'Test User'
      };

      (jwt.sign as any).mockReturnValue('mock-token');

      const token = authMiddleware.generateToken(payload);

      expect(jwt.sign).toHaveBeenCalledWith(payload, config.jwtSecret, {
        expiresIn: config.jwtExpiresIn
      });
      expect(token).toBe('mock-token');
    });
  });

  describe('verifyToken', () => {
    it('should verify JWT token successfully', () => {
      const token = 'valid-token';
      (jwt.verify as any).mockReturnValue(mockJWTPayload);

      const result = authMiddleware.verifyToken(token);

      expect(jwt.verify).toHaveBeenCalledWith(token, config.jwtSecret);
      expect(result).toBe(mockJWTPayload);
    });

    it('should throw error for invalid token', () => {
      const token = 'invalid-token';
      const error = new jwt.JsonWebTokenError('invalid token');
      (jwt.verify as any).mockImplementation(() => {
        throw error;
      });

      expect(() => authMiddleware.verifyToken(token)).toThrow();
    });
  });

  describe('authenticate middleware', () => {
    it('should authenticate valid token successfully', async () => {
      mockRequest.headers = {
        authorization: 'Bearer valid-token'
      };

      (jwt.verify as any).mockReturnValue(mockJWTPayload);
      mockUserRepository.findById.mockResolvedValue(mockUser);

      await authMiddleware.authenticate(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(jwt.verify).toHaveBeenCalledWith('valid-token', config.jwtSecret);
      expect(mockUserRepository.findById).toHaveBeenCalledWith('user-123');
      expect(mockRequest.user).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User'
      });
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should reject request without authorization header', async () => {
      mockRequest.headers = {};

      await authMiddleware.authenticate(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Authentication required',
        code: 'MISSING_TOKEN'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject request with invalid authorization format', async () => {
      mockRequest.headers = {
        authorization: 'Invalid format'
      };

      await authMiddleware.authenticate(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Authentication required',
        code: 'MISSING_TOKEN'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject expired token', async () => {
      mockRequest.headers = {
        authorization: 'Bearer expired-token'
      };

      const expiredError = new jwt.TokenExpiredError('jwt expired', new Date());
      (jwt.verify as any).mockImplementation(() => {
        throw expiredError;
      });

      await authMiddleware.authenticate(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Token expired',
        code: 'TOKEN_EXPIRED'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject invalid token', async () => {
      mockRequest.headers = {
        authorization: 'Bearer invalid-token'
      };

      const invalidError = new jwt.JsonWebTokenError('invalid token');
      (jwt.verify as any).mockImplementation(() => {
        throw invalidError;
      });

      await authMiddleware.authenticate(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject token for non-existent user', async () => {
      mockRequest.headers = {
        authorization: 'Bearer valid-token'
      };

      (jwt.verify as any).mockReturnValue(mockJWTPayload);
      mockUserRepository.findById.mockResolvedValue(null);

      await authMiddleware.authenticate(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      mockRequest.headers = {
        authorization: 'Bearer valid-token'
      };

      (jwt.verify as any).mockReturnValue(mockJWTPayload);
      mockUserRepository.findById.mockRejectedValue(new Error('Database error'));

      await authMiddleware.authenticate(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Authentication failed',
        code: 'AUTH_ERROR'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('optionalAuth middleware', () => {
    it('should proceed without authentication when no token provided', async () => {
      mockRequest.headers = {};

      await authMiddleware.optionalAuth(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should authenticate when valid token is provided', async () => {
      mockRequest.headers = {
        authorization: 'Bearer valid-token'
      };

      (jwt.verify as any).mockReturnValue(mockJWTPayload);
      mockUserRepository.findById.mockResolvedValue(mockUser);

      await authMiddleware.optionalAuth(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockRequest.user).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User'
      });
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('refreshToken', () => {
    it('should refresh token successfully', async () => {
      mockRequest.body = {
        refreshToken: 'valid-refresh-token'
      };

      (jwt.verify as any).mockReturnValue(mockJWTPayload);
      mockUserRepository.findById.mockResolvedValue(mockUser);
      (jwt.sign as any).mockReturnValue('new-token');

      await authMiddleware.refreshToken(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(jwt.verify).toHaveBeenCalledWith('valid-refresh-token', config.jwtSecret);
      expect(mockUserRepository.findById).toHaveBeenCalledWith('user-123');
      expect(jwt.sign).toHaveBeenCalled();
      expect(mockResponse.json).toHaveBeenCalledWith({
        token: 'new-token',
        user: {
          id: mockUser.id,
          email: mockUser.email,
          name: mockUser.name,
          preferences: mockUser.preferences
        }
      });
    });

    it('should reject request without refresh token', async () => {
      mockRequest.body = {};

      await authMiddleware.refreshToken(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Refresh token required',
        code: 'MISSING_REFRESH_TOKEN'
      });
    });

    it('should reject invalid refresh token', async () => {
      mockRequest.body = {
        refreshToken: 'invalid-token'
      };

      const invalidError = new jwt.JsonWebTokenError('invalid token');
      (jwt.verify as any).mockImplementation(() => {
        throw invalidError;
      });

      await authMiddleware.refreshToken(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Invalid refresh token',
        code: 'INVALID_REFRESH_TOKEN'
      });
    });

    it('should reject refresh token for non-existent user', async () => {
      mockRequest.body = {
        refreshToken: 'valid-token'
      };

      (jwt.verify as any).mockReturnValue(mockJWTPayload);
      mockUserRepository.findById.mockResolvedValue(null);

      await authMiddleware.refreshToken(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    });
  });
});