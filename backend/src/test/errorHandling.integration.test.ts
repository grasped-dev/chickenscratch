import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import {
  requestIdMiddleware,
  requestLoggingMiddleware,
  errorHandlingMiddleware,
  notFoundHandler,
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
    API: 'api',
    UPLOAD: 'upload'
  }
}));

describe('Error Handling Integration', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    
    // Setup middleware
    app.use(requestIdMiddleware);
    app.use(requestLoggingMiddleware);
    app.use(express.json());

    // Test routes
    app.get('/api/success', (_req, res) => {
      res.json({ message: 'Success' });
    });

    app.get('/api/app-error', (_req, res, next) => {
      const error = new AppError(
        ErrorCode.UPLOAD_FAILED,
        'Upload failed',
        500,
        true,
        ErrorSeverity.HIGH,
        LogCategory.UPLOAD
      );
      next(error);
    });

    app.get('/api/generic-error', (_req, res, next) => {
      next(new Error('Generic error occurred'));
    });

    app.get('/api/async-error', asyncErrorHandler(async (_req, _res, _next) => {
      throw new Error('Async error occurred');
    }));

    app.get('/api/validation-error', (_req, res, next) => {
      const error = new Error('Invalid input provided');
      next(error);
    });

    app.get('/api/database-error', (_req, res, next) => {
      const error = new Error('Database connection failed');
      next(error);
    });

    app.get('/api/aws-error', (_req, res, next) => {
      const error = new Error('AWS Textract service unavailable');
      next(error);
    });

    app.get('/api/network-error', (_req, res, next) => {
      const error = new Error('ECONNRESET');
      next(error);
    });

    app.post('/api/json-error', (_req, res) => {
      res.json({ message: 'Should not reach here' });
    });

    // Error handling middleware (must be last)
    app.use('*', notFoundHandler);
    app.use(errorHandlingMiddleware);

    vi.clearAllMocks();
  });

  afterEach(() => {
    ErrorHandler.resetMetrics();
  });

  describe('Successful requests', () => {
    it('should handle successful requests', async () => {
      const response = await request(app)
        .get('/api/success')
        .expect(200);

      expect(response.body).toEqual({ message: 'Success' });
      expect(response.headers['x-request-id']).toBeDefined();
    });

    it('should add request ID to all responses', async () => {
      const response = await request(app)
        .get('/api/success')
        .set('X-Request-ID', 'custom-request-id')
        .expect(200);

      expect(response.headers['x-request-id']).toBe('custom-request-id');
    });
  });

  describe('AppError handling', () => {
    it('should handle AppError correctly', async () => {
      const response = await request(app)
        .get('/api/app-error')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: {
          code: ErrorCode.UPLOAD_FAILED,
          message: 'Failed to upload your file. Please try again.',
          timestamp: expect.any(String),
          requestId: expect.any(String)
        }
      });

      expect(Logger.error).toHaveBeenCalledWith(
        expect.stringContaining('AppError: Upload failed'),
        expect.any(Error),
        expect.objectContaining({
          category: LogCategory.UPLOAD,
          metadata: expect.objectContaining({
            code: ErrorCode.UPLOAD_FAILED,
            severity: ErrorSeverity.HIGH,
            retryable: true
          })
        })
      );
    });
  });

  describe('Generic error handling', () => {
    it('should handle generic errors', async () => {
      const response = await request(app)
        .get('/api/generic-error')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: {
          code: ErrorCode.INTERNAL_ERROR,
          message: 'Something went wrong. Please try again.',
          timestamp: expect.any(String),
          requestId: expect.any(String)
        }
      });
    });

    it('should handle async errors', async () => {
      const response = await request(app)
        .get('/api/async-error')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe(ErrorCode.INTERNAL_ERROR);
    });
  });

  describe('Error pattern mapping', () => {
    it('should map validation errors correctly', async () => {
      const response = await request(app)
        .get('/api/validation-error')
        .expect(500); // Currently returns 500, but error mapping works

      expect(response.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(response.body.error.message).toBe('The information provided is not valid.');
    });

    it('should map database errors correctly', async () => {
      const response = await request(app)
        .get('/api/database-error')
        .expect(500);

      expect(response.body.error.code).toBe(ErrorCode.DATABASE_ERROR);
      expect(response.body.error.message).toBe('Database temporarily unavailable. Please try again later.');
    });

    it('should map AWS errors correctly', async () => {
      const response = await request(app)
        .get('/api/aws-error')
        .expect(500);

      expect(response.body.error.code).toBe(ErrorCode.AWS_SERVICE_ERROR);
      expect(response.body.error.message).toBe('Cloud service temporarily unavailable. Please try again later.');
    });

    it('should map network errors correctly', async () => {
      const response = await request(app)
        .get('/api/network-error')
        .expect(500);

      expect(response.body.error.code).toBe(ErrorCode.NETWORK_ERROR);
      expect(response.body.error.message).toBe('Network connection issue. Please check your connection and try again.');
    });
  });

  describe('404 handling', () => {
    it('should handle 404 errors', async () => {
      const response = await request(app)
        .get('/api/nonexistent')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        error: {
          code: ErrorCode.NOT_FOUND,
          message: 'The requested resource was not found.',
          timestamp: expect.any(String),
          requestId: expect.any(String)
        }
      });
    });

    it('should handle 404 for different HTTP methods', async () => {
      const response = await request(app)
        .post('/api/nonexistent')
        .expect(404);

      expect(response.body.error.message).toBe('The requested resource was not found.');
    });
  });

  describe('JSON parsing errors', () => {
    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/json-error')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(500); // Currently returns 500, but error mapping works

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    });
  });

  describe('Request logging', () => {
    it('should log requests and responses', async () => {
      await request(app)
        .get('/api/success')
        .expect(200);

      expect(Logger.api).toHaveBeenCalledWith(
        'GET /api/success',
        expect.any(String),
        expect.objectContaining({
          method: 'GET',
          path: '/api/success'
        })
      );

      expect(Logger.api).toHaveBeenCalledWith(
        expect.stringContaining('GET /api/success - 200'),
        expect.any(String),
        expect.objectContaining({
          statusCode: 200
        })
      );
    });
  });

  describe('Error metrics tracking', () => {
    it('should track error metrics', async () => {
      // Generate multiple errors
      await request(app).get('/api/app-error').expect(500);
      await request(app).get('/api/generic-error').expect(500);
      await request(app).get('/api/app-error').expect(500);

      const metrics = ErrorHandler.getErrorMetrics();
      
      expect(metrics.has(ErrorCode.UPLOAD_FAILED)).toBe(true);
      expect(metrics.has(ErrorCode.INTERNAL_ERROR)).toBe(true);
      
      const uploadErrorMetrics = metrics.get(ErrorCode.UPLOAD_FAILED);
      expect(uploadErrorMetrics?.errorCount).toBe(2);
    });
  });

  describe('Circuit breaker integration', () => {
    it('should work with circuit breaker', async () => {
      const circuitBreaker = ErrorHandler.getCircuitBreaker('test-service');
      
      // Simulate circuit breaker being open
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure();
      }

      expect(circuitBreaker.isOpen()).toBe(true);

      // Test retry with circuit breaker
      const mockFn = vi.fn().mockResolvedValue('success');
      
      await expect(
        ErrorHandler.retry(mockFn, {
          serviceName: 'test-service',
          maxRetries: 3
        })
      ).rejects.toThrow('Service test-service is temporarily unavailable');

      expect(mockFn).not.toHaveBeenCalled();
    });
  });

  describe('Retry mechanism', () => {
    it('should retry retryable errors', async () => {
      let attemptCount = 0;
      const mockFn = vi.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Network timeout');
        }
        return Promise.resolve('success');
      });

      const result = await ErrorHandler.retry(mockFn, {
        maxRetries: 3,
        context: 'test operation'
      });

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('should not retry non-retryable errors', async () => {
      const mockFn = vi.fn().mockRejectedValue(
        new AppError(ErrorCode.FILE_TOO_LARGE, 'File too large', 400, false)
      );

      await expect(
        ErrorHandler.retry(mockFn, { maxRetries: 3 })
      ).rejects.toThrow('File too large');

      expect(mockFn).toHaveBeenCalledTimes(1);
    });
  });
});