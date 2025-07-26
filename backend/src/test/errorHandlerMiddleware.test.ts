import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import {
  requestIdMiddleware,
  requestLoggingMiddleware,
  errorHandlingMiddleware,
  notFoundHandler,
  validationErrorHandler,
  rateLimitErrorHandler,
  errorSystemHealthCheck,
  asyncErrorHandler
} from '../middleware/errorHandler.js';
import { AppError, ErrorCode, ErrorSeverity, ErrorHandler } from '../utils/errorHandler.js';
import Logger, { LogCategory } from '../utils/logger.js';

// Mock Logger
vi.mock('../utils/logger.js', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    api: vi.fn()
  },
  LogCategory: {
    SYSTEM: 'system',
    API: 'api'
  }
}));

// Mock ErrorHandler
vi.mock('../utils/errorHandler.js', () => ({
  ErrorHandler: {
    createErrorResponse: vi.fn(),
    getErrorMetrics: vi.fn(),
    circuitBreakers: new Map()
  },
  AppError: class extends Error {
    constructor(
      public code: string,
      message: string,
      public statusCode: number = 500,
      public retryable: boolean = false,
      public severity: string = 'medium',
      public category: string = 'system',
      public details?: any,
      public userId?: string,
      public requestId?: string
    ) {
      super(message);
      this.name = 'AppError';
    }
  },
  ErrorCode: {
    NOT_FOUND: 'NOT_FOUND',
    RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
    VALIDATION_FAILED: 'VALIDATION_FAILED',
    INTERNAL_ERROR: 'INTERNAL_ERROR'
  },
  ErrorSeverity: {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high'
  }
}));

describe('Error Handling Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      headers: {},
      method: 'GET',
      path: '/api/test',
      query: {},
      ip: '127.0.0.1'
    };

    mockRes = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      end: vi.fn(),
      headersSent: false
    };

    mockNext = vi.fn();

    vi.clearAllMocks();
  });

  describe('requestIdMiddleware', () => {
    it('should add request ID from header', () => {
      mockReq.headers = { 'x-request-id': 'existing-id' };

      requestIdMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.requestId).toBe('existing-id');
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-Request-ID', 'existing-id');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should generate request ID if not provided', () => {
      requestIdMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.requestId).toBeDefined();
      expect(mockReq.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-Request-ID', mockReq.requestId);
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('requestLoggingMiddleware', () => {
    it('should log request and response', () => {
      mockReq.requestId = 'test-request-id';
      mockReq.userId = 'test-user';

      requestLoggingMiddleware(mockReq as Request, mockRes as Response, mockNext);

      // Verify request logging
      expect(Logger.api).toHaveBeenCalledWith(
        'GET /api/test',
        'test-request-id',
        expect.objectContaining({
          method: 'GET',
          path: '/api/test',
          userId: 'test-user'
        })
      );

      expect(mockNext).toHaveBeenCalled();

      // Simulate response end
      const originalEnd = mockRes.end as any;
      mockRes.statusCode = 200;
      originalEnd.call(mockRes);

      // Verify response logging
      expect(Logger.api).toHaveBeenCalledWith(
        expect.stringContaining('GET /api/test - 200'),
        'test-request-id',
        expect.objectContaining({
          statusCode: 200,
          userId: 'test-user'
        })
      );
    });

    it('should log slow requests as warnings', () => {
      mockReq.requestId = 'test-request-id';
      
      // Mock Date.now to simulate slow request
      const originalNow = Date.now;
      let callCount = 0;
      Date.now = vi.fn(() => {
        callCount++;
        return callCount === 1 ? 1000 : 7000; // 6 second difference
      });

      requestLoggingMiddleware(mockReq as Request, mockRes as Response, mockNext);

      // Simulate response end
      const originalEnd = mockRes.end as any;
      mockRes.statusCode = 200;
      originalEnd.call(mockRes);

      expect(Logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Slow request detected'),
        expect.objectContaining({
          category: LogCategory.API,
          requestId: 'test-request-id'
        })
      );

      // Restore Date.now
      Date.now = originalNow;
    });
  });

  describe('asyncErrorHandler', () => {
    it('should handle async function success', async () => {
      const asyncFn = vi.fn().mockResolvedValue('success');
      const wrappedFn = asyncErrorHandler(asyncFn);

      await wrappedFn(mockReq, mockRes, mockNext);

      expect(asyncFn).toHaveBeenCalledWith(mockReq, mockRes, mockNext);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should catch async function errors', async () => {
      const error = new Error('Async error');
      const asyncFn = vi.fn().mockRejectedValue(error);
      const wrappedFn = asyncErrorHandler(asyncFn);

      await wrappedFn(mockReq, mockRes, mockNext);

      expect(asyncFn).toHaveBeenCalledWith(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('errorHandlingMiddleware', () => {
    beforeEach(() => {
      (ErrorHandler.createErrorResponse as any).mockReturnValue({
        code: 'TEST_ERROR',
        message: 'Test error message',
        retryable: false,
        timestamp: new Date(),
        requestId: 'test-request-id'
      });
    });

    it('should handle AppError', () => {
      const { AppError } = require('../utils/errorHandler.js');
      const error = new AppError(
        'VALIDATION_FAILED',
        'Validation failed',
        400
      );
      mockReq.requestId = 'test-request-id';

      errorHandlingMiddleware(error, mockReq as Request, mockRes as Response, mockNext);

      expect(ErrorHandler.createErrorResponse).toHaveBeenCalledWith(
        error,
        'test-request-id',
        undefined
      );
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: expect.objectContaining({
          code: 'TEST_ERROR',
          message: 'Test error message'
        })
      });
    });

    it('should handle generic errors', () => {
      const error = new Error('Generic error');
      mockReq.requestId = 'test-request-id';

      errorHandlingMiddleware(error, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: expect.objectContaining({
          code: 'TEST_ERROR',
          message: 'Test error message'
        })
      });
    });

    it('should map error types to status codes', () => {
      vi.clearAllMocks();
      
      const notFoundError = new Error('Resource not found');
      errorHandlingMiddleware(notFoundError, mockReq as Request, mockRes as Response, mockNext);
      expect(mockRes.status).toHaveBeenLastCalledWith(404);

      vi.clearAllMocks();
      const unauthorizedError = new Error('Unauthorized access');
      errorHandlingMiddleware(unauthorizedError, mockReq as Request, mockRes as Response, mockNext);
      expect(mockRes.status).toHaveBeenLastCalledWith(401);

      vi.clearAllMocks();
      const forbiddenError = new Error('Forbidden resource');
      errorHandlingMiddleware(forbiddenError, mockReq as Request, mockRes as Response, mockNext);
      expect(mockRes.status).toHaveBeenLastCalledWith(403);

      vi.clearAllMocks();
      const validationError = new Error('Validation failed');
      errorHandlingMiddleware(validationError, mockReq as Request, mockRes as Response, mockNext);
      expect(mockRes.status).toHaveBeenLastCalledWith(400);
    });

    it('should not handle if response already sent', () => {
      mockRes.headersSent = true;
      const error = new Error('Test error');

      errorHandlingMiddleware(error, mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
      expect(mockRes.status).not.toHaveBeenCalled();
    });
  });

  describe('notFoundHandler', () => {
    it('should handle 404 errors', () => {
      mockReq.method = 'POST';
      mockReq.path = '/api/nonexistent';
      mockReq.requestId = 'test-request-id';
      mockReq.userId = 'test-user';

      (ErrorHandler.createErrorResponse as any).mockReturnValue({
        code: ErrorCode.NOT_FOUND,
        message: 'Route not found',
        timestamp: new Date(),
        requestId: 'test-request-id'
      });

      notFoundHandler(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: expect.objectContaining({
          code: ErrorCode.NOT_FOUND,
          message: 'Route not found'
        })
      });
    });
  });

  describe('validationErrorHandler', () => {
    it('should create validation error from error array', () => {
      const errors = [
        { path: 'email', msg: 'Invalid email format', value: 'invalid-email' },
        { param: 'password', message: 'Password too short', value: '123' }
      ];

      const error = validationErrorHandler(errors);

      expect(error).toBeInstanceOf(Error);
      expect(error.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(error.statusCode).toBe(400);
      expect(error.details.validationErrors).toHaveLength(2);
      expect(error.details.validationErrors[0]).toEqual({
        field: 'email',
        message: 'Invalid email format',
        value: 'invalid-email'
      });
    });
  });

  describe('rateLimitErrorHandler', () => {
    it('should handle rate limit errors', () => {
      mockReq.ip = '192.168.1.1';
      mockReq.path = '/api/upload';
      mockReq.requestId = 'test-request-id';
      mockReq.userId = 'test-user';

      (ErrorHandler.createErrorResponse as any).mockReturnValue({
        code: ErrorCode.RATE_LIMIT_EXCEEDED,
        message: 'Too many requests',
        timestamp: new Date(),
        requestId: 'test-request-id'
      });

      rateLimitErrorHandler(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(429);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: expect.objectContaining({
          code: ErrorCode.RATE_LIMIT_EXCEEDED,
          message: 'Too many requests',
          retryAfter: 60
        })
      });
    });
  });

  describe('errorSystemHealthCheck', () => {
    beforeEach(() => {
      (ErrorHandler.getErrorMetrics as any).mockReturnValue(new Map([
        ['TEST_ERROR', {
          errorCount: 5,
          errorRate: 2.5,
          lastOccurrence: new Date(),
          affectedUsers: new Set(['user1', 'user2'])
        }]
      ]));

      (ErrorHandler as any).circuitBreakers = new Map([
        ['test-service', {
          getMetrics: () => ({
            state: 'closed',
            failureCount: 2,
            lastFailureTime: new Date()
          })
        }]
      ]);
    });

    it('should return healthy status for normal conditions', () => {
      const health = errorSystemHealthCheck();

      expect(health.status).toBe('healthy');
      expect(health.metrics).toEqual({
        TEST_ERROR: {
          count: 5,
          rate: 2.5,
          lastOccurrence: expect.any(Date),
          affectedUsers: 2
        }
      });
      expect(health.circuitBreakers).toHaveLength(1);
    });

    it('should return degraded status for high error rates', () => {
      (ErrorHandler.getErrorMetrics as any).mockReturnValue(new Map([
        ['HIGH_ERROR_RATE', {
          errorCount: 50,
          errorRate: 15, // > 10 errors per minute
          lastOccurrence: new Date(),
          affectedUsers: new Set(['user1'])
        }]
      ]));

      const health = errorSystemHealthCheck();
      expect(health.status).toBe('degraded');
    });

    it('should return unhealthy status for very high error rates', () => {
      (ErrorHandler.getErrorMetrics as any).mockReturnValue(new Map([
        ['CRITICAL_ERROR_RATE', {
          errorCount: 200,
          errorRate: 60, // > 50 errors per minute
          lastOccurrence: new Date(),
          affectedUsers: new Set(['user1'])
        }]
      ]));

      const health = errorSystemHealthCheck();
      expect(health.status).toBe('unhealthy');
    });

    it('should return degraded status for open circuit breakers', () => {
      (ErrorHandler as any).circuitBreakers = new Map([
        ['service1', {
          getMetrics: () => ({ state: 'open', failureCount: 5 })
        }]
      ]);

      const health = errorSystemHealthCheck();
      expect(health.status).toBe('degraded');
    });

    it('should return unhealthy status for multiple open circuit breakers', () => {
      (ErrorHandler as any).circuitBreakers = new Map([
        ['service1', { getMetrics: () => ({ state: 'open', failureCount: 5 }) }],
        ['service2', { getMetrics: () => ({ state: 'open', failureCount: 3 }) }],
        ['service3', { getMetrics: () => ({ state: 'open', failureCount: 7 }) }]
      ]);

      const health = errorSystemHealthCheck();
      expect(health.status).toBe('unhealthy');
    });
  });
});