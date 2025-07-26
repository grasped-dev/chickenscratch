import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AppError, ErrorHandler, ErrorCode, ErrorSeverity } from '../utils/errorHandler.js';
import Logger, { LogCategory } from '../utils/logger.js';

// Mock Logger
vi.mock('../utils/logger.js', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn()
  },
  LogCategory: {
    SYSTEM: 'system',
    UPLOAD: 'upload',
    OCR: 'ocr',
    DATABASE: 'database'
  }
}));

describe('AppError', () => {
  it('should create AppError with all properties', () => {
    const error = new AppError(
      ErrorCode.FILE_TOO_LARGE,
      'File is too large',
      400,
      false,
      ErrorSeverity.LOW,
      LogCategory.UPLOAD,
      { fileSize: 1000000 },
      'user123',
      'req456'
    );

    expect(error.code).toBe(ErrorCode.FILE_TOO_LARGE);
    expect(error.message).toBe('File is too large');
    expect(error.statusCode).toBe(400);
    expect(error.retryable).toBe(false);
    expect(error.severity).toBe(ErrorSeverity.LOW);
    expect(error.category).toBe(LogCategory.UPLOAD);
    expect(error.details).toEqual({ fileSize: 1000000 });
    expect(error.userId).toBe('user123');
    expect(error.requestId).toBe('req456');
  });

  it('should create AppError with default values', () => {
    const error = new AppError(ErrorCode.INTERNAL_ERROR, 'Something went wrong');

    expect(error.statusCode).toBe(500);
    expect(error.retryable).toBe(false);
    expect(error.severity).toBe(ErrorSeverity.MEDIUM);
    expect(error.category).toBe(LogCategory.SYSTEM);
  });

  it('should return user-friendly messages', () => {
    const error = new AppError(ErrorCode.FILE_TOO_LARGE, 'File exceeds limit');
    expect(error.getUserFriendlyMessage()).toBe('The file you uploaded is too large. Please choose a smaller file.');

    const ocrError = new AppError(ErrorCode.OCR_PROCESSING_FAILED, 'OCR failed');
    expect(ocrError.getUserFriendlyMessage()).toBe('Failed to extract text from your image. Please try with a clearer image.');
  });
});

describe('ErrorHandler', () => {
  beforeEach(() => {
    ErrorHandler.resetMetrics();
    vi.clearAllMocks();
  });

  describe('createErrorResponse', () => {
    it('should create error response from AppError', () => {
      const appError = new AppError(
        ErrorCode.UPLOAD_FAILED,
        'Upload failed',
        500,
        true,
        ErrorSeverity.HIGH,
        LogCategory.UPLOAD,
        { reason: 'network' },
        'user123',
        'req456'
      );

      const response = ErrorHandler.createErrorResponse(appError, 'req456', 'user123');

      expect(response.code).toBe(ErrorCode.UPLOAD_FAILED);
      expect(response.message).toBe('Failed to upload your file. Please try again.');
      expect(response.retryable).toBe(true);
      expect(response.requestId).toBe('req456');
      expect(response.userId).toBe('user123');
      expect(response.timestamp).toBeInstanceOf(Date);
    });

    it('should map known error patterns', () => {
      const fileError = new Error('File size exceeds maximum limit');
      const response = ErrorHandler.createErrorResponse(fileError, 'req123');

      expect(response.code).toBe(ErrorCode.FILE_TOO_LARGE);
      expect(response.message).toBe('The file you uploaded is too large. Please choose a smaller file.');
      expect(response.retryable).toBe(false);
    });

    it('should handle AWS service errors', () => {
      const awsError = new Error('AWS Textract service unavailable');
      const response = ErrorHandler.createErrorResponse(awsError);

      expect(response.code).toBe(ErrorCode.AWS_SERVICE_ERROR);
      expect(response.retryable).toBe(true);
    });

    it('should handle database errors', () => {
      const dbError = new Error('Database connection failed');
      const response = ErrorHandler.createErrorResponse(dbError);

      expect(response.code).toBe(ErrorCode.DATABASE_ERROR);
      expect(response.retryable).toBe(true);
    });

    it('should default to internal error for unknown errors', () => {
      const unknownError = new Error('Something weird happened');
      const response = ErrorHandler.createErrorResponse(unknownError);

      expect(response.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(response.retryable).toBe(false);
    });
  });

  describe('shouldRetry', () => {
    it('should not retry after max attempts', () => {
      const error = new AppError(ErrorCode.AWS_SERVICE_ERROR, 'AWS error', 500, true);
      expect(ErrorHandler.shouldRetry(error, 3, 3)).toBe(false);
    });

    it('should respect AppError retryable flag', () => {
      const retryableError = new AppError(ErrorCode.AWS_SERVICE_ERROR, 'AWS error', 500, true);
      const nonRetryableError = new AppError(ErrorCode.FILE_TOO_LARGE, 'File too large', 400, false);

      expect(ErrorHandler.shouldRetry(retryableError, 1)).toBe(true);
      expect(ErrorHandler.shouldRetry(nonRetryableError, 1)).toBe(false);
    });

    it('should retry on network errors', () => {
      const networkError = new Error('ECONNRESET');
      expect(ErrorHandler.shouldRetry(networkError, 1)).toBe(true);

      const timeoutError = new Error('Request timeout');
      expect(ErrorHandler.shouldRetry(timeoutError, 1)).toBe(true);
    });

    it('should retry on service errors', () => {
      const awsError = new Error('AWS service error');
      expect(ErrorHandler.shouldRetry(awsError, 1)).toBe(true);

      const dbError = new Error('Database connection error');
      expect(ErrorHandler.shouldRetry(dbError, 1)).toBe(true);
    });
  });

  describe('getRetryDelay', () => {
    it('should calculate exponential backoff', () => {
      expect(ErrorHandler.getRetryDelay(0)).toBeGreaterThanOrEqual(1000);
      expect(ErrorHandler.getRetryDelay(1)).toBeGreaterThanOrEqual(2000);
      expect(ErrorHandler.getRetryDelay(2)).toBeGreaterThanOrEqual(4000);
    });

    it('should cap at maximum delay', () => {
      const delay = ErrorHandler.getRetryDelay(10);
      expect(delay).toBeLessThanOrEqual(33000); // 30000 + jitter
    });
  });

  describe('retry', () => {
    it('should succeed on first attempt', async () => {
      const mockFn = vi.fn().mockResolvedValue('success');
      
      const result = await ErrorHandler.retry(mockFn, {
        maxRetries: 3,
        context: 'test operation'
      });

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const mockFn = vi.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValue('success');

      const result = await ErrorHandler.retry(mockFn, {
        maxRetries: 3,
        context: 'test operation'
      });

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('should fail after max retries', async () => {
      const error = new Error('Network timeout'); // Use retryable error pattern
      const mockFn = vi.fn().mockRejectedValue(error);

      await expect(
        ErrorHandler.retry(mockFn, { maxRetries: 2, context: 'test operation' })
      ).rejects.toThrow('Network timeout');

      expect(mockFn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    }, 10000); // Increase timeout for retry delays

    it('should not retry non-retryable errors', async () => {
      const error = new AppError(ErrorCode.FILE_TOO_LARGE, 'File too large', 400, false);
      const mockFn = vi.fn().mockRejectedValue(error);

      await expect(
        ErrorHandler.retry(mockFn, { maxRetries: 3, context: 'test operation' })
      ).rejects.toThrow('File too large');

      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should handle circuit breaker', async () => {
      const serviceName = 'test-service';
      const circuitBreaker = ErrorHandler.getCircuitBreaker(serviceName);
      
      // Simulate circuit breaker being open
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure();
      }

      const mockFn = vi.fn().mockResolvedValue('success');

      await expect(
        ErrorHandler.retry(mockFn, {
          maxRetries: 3,
          serviceName,
          context: 'test operation'
        })
      ).rejects.toThrow('Service test-service is temporarily unavailable');

      expect(mockFn).not.toHaveBeenCalled();
    });
  });

  describe('withRetry', () => {
    it('should wrap function with retry logic', async () => {
      const originalFn = vi.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue('success');

      const wrappedFn = ErrorHandler.withRetry(originalFn, {
        maxRetries: 2,
        context: 'wrapped operation'
      });

      const result = await wrappedFn('arg1', 'arg2');

      expect(result).toBe('success');
      expect(originalFn).toHaveBeenCalledTimes(2);
      expect(originalFn).toHaveBeenCalledWith('arg1', 'arg2');
    });
  });

  describe('error metrics', () => {
    it('should track error metrics', () => {
      const error1 = new AppError(ErrorCode.UPLOAD_FAILED, 'Upload failed');
      const error2 = new AppError(ErrorCode.UPLOAD_FAILED, 'Another upload failed');

      ErrorHandler.createErrorResponse(error1, 'req1', 'user1');
      ErrorHandler.createErrorResponse(error2, 'req2', 'user2');

      const metrics = ErrorHandler.getErrorMetrics();
      const uploadMetrics = metrics.get(ErrorCode.UPLOAD_FAILED);

      expect(uploadMetrics).toBeDefined();
      expect(uploadMetrics!.errorCount).toBe(2);
      expect(uploadMetrics!.affectedUsers.size).toBe(2);
      expect(uploadMetrics!.affectedUsers.has('user1')).toBe(true);
      expect(uploadMetrics!.affectedUsers.has('user2')).toBe(true);
    });

    it('should reset metrics', () => {
      const error = new AppError(ErrorCode.UPLOAD_FAILED, 'Upload failed');
      ErrorHandler.createErrorResponse(error);

      expect(ErrorHandler.getErrorMetrics().size).toBeGreaterThan(0);

      ErrorHandler.resetMetrics();
      expect(ErrorHandler.getErrorMetrics().size).toBe(0);
    });
  });
});

describe('CircuitBreaker', () => {
  let circuitBreaker: any;

  beforeEach(() => {
    circuitBreaker = ErrorHandler.getCircuitBreaker('test-service');
    // Reset circuit breaker state
    (circuitBreaker as any).state = 'closed';
    (circuitBreaker as any).failureCount = 0;
    (circuitBreaker as any).lastFailureTime = undefined;
  });

  it('should start in closed state', () => {
    expect(circuitBreaker.isOpen()).toBe(false);
    expect(circuitBreaker.getState()).toBe('closed');
  });

  it('should open after threshold failures', () => {
    // Record failures up to threshold
    for (let i = 0; i < 5; i++) {
      circuitBreaker.recordFailure();
    }

    expect(circuitBreaker.isOpen()).toBe(true);
    expect(circuitBreaker.getState()).toBe('open');
  });

  it('should transition to half-open after recovery timeout', () => {
    // Open the circuit breaker
    for (let i = 0; i < 5; i++) {
      circuitBreaker.recordFailure();
    }
    expect(circuitBreaker.getState()).toBe('open');

    // Simulate time passing
    (circuitBreaker as any).lastFailureTime = new Date(Date.now() - 70000); // 70 seconds ago

    expect(circuitBreaker.isOpen()).toBe(false);
    expect(circuitBreaker.getState()).toBe('half-open');
  });

  it('should close on success in half-open state', () => {
    // Set to half-open state
    (circuitBreaker as any).state = 'half-open';
    (circuitBreaker as any).failureCount = 3;

    circuitBreaker.recordSuccess();

    expect(circuitBreaker.getState()).toBe('closed');
    expect(circuitBreaker.getMetrics().failureCount).toBe(0);
  });

  it('should reopen on failure in half-open state', () => {
    // Set to half-open state
    (circuitBreaker as any).state = 'half-open';

    circuitBreaker.recordFailure();

    expect(circuitBreaker.getState()).toBe('open');
  });

  it('should provide metrics', () => {
    circuitBreaker.recordFailure();
    circuitBreaker.recordFailure();

    const metrics = circuitBreaker.getMetrics();

    expect(metrics.state).toBe('closed');
    expect(metrics.failureCount).toBe(2);
    expect(metrics.lastFailureTime).toBeInstanceOf(Date);
  });
});