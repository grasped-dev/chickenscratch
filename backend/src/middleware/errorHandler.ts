import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AppError, ErrorHandler, ErrorCode, ErrorSeverity } from '../utils/errorHandler.js';
import Logger, { LogCategory } from '../utils/logger.js';

// Extend Request interface to include requestId and userId
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      userId?: string;
    }
  }
}

/**
 * Middleware to add request ID to all requests
 */
export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  req.requestId = req.headers['x-request-id'] as string || uuidv4();
  res.setHeader('X-Request-ID', req.requestId);
  next();
};

/**
 * Middleware to log all requests
 */
export const requestLoggingMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now();
  
  // Log request
  Logger.api(
    `${req.method} ${req.path}`,
    req.requestId,
    {
      method: req.method,
      path: req.path,
      query: req.query,
      userAgent: req.headers['user-agent'],
      ip: req.ip,
      userId: req.userId
    }
  );

  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any) {
    const duration = Date.now() - startTime;
    
    Logger.api(
      `${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`,
      req.requestId,
      {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        userId: req.userId
      }
    );

    // Log slow requests
    if (duration > 5000) { // 5 seconds
      Logger.warn(
        `Slow request detected: ${req.method} ${req.path} took ${duration}ms`,
        {
          category: LogCategory.API,
          requestId: req.requestId,
          userId: req.userId,
          metadata: { duration, method: req.method, path: req.path }
        }
      );
    }

    originalEnd.call(this, chunk, encoding);
  };

  next();
};

/**
 * Middleware to handle async errors
 */
export const asyncErrorHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Main error handling middleware
 */
export const errorHandlingMiddleware = (
  error: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Don't handle if response already sent
  if (res.headersSent) {
    return next(error);
  }

  // Create standardized error response
  const errorResponse = ErrorHandler.createErrorResponse(
    error,
    req.requestId,
    req.userId
  );

  // Determine HTTP status code
  let statusCode = 500;
  if (error instanceof AppError) {
    statusCode = error.statusCode;
  } else {
    // Map common error types to status codes
    if (error.message.includes('not found') || error.message.includes('Not found')) {
      statusCode = 404;
    } else if (error.message.includes('unauthorized') || error.message.includes('Unauthorized')) {
      statusCode = 401;
    } else if (error.message.includes('forbidden') || error.message.includes('Forbidden')) {
      statusCode = 403;
    } else if (error.message.includes('validation') || error.message.includes('invalid')) {
      statusCode = 400;
    }
  }

  // Send error response
  res.status(statusCode).json({
    success: false,
    error: {
      code: errorResponse.code,
      message: errorResponse.message,
      ...(process.env.NODE_ENV === 'development' && { details: errorResponse.details }),
      timestamp: errorResponse.timestamp,
      requestId: errorResponse.requestId
    }
  });
};

/**
 * 404 handler middleware
 */
export const notFoundHandler = (req: Request, res: Response): void => {
  const error = new AppError(
    ErrorCode.NOT_FOUND,
    `Route ${req.method} ${req.path} not found`,
    404,
    false,
    ErrorSeverity.LOW,
    LogCategory.API,
    { method: req.method, path: req.path },
    req.userId,
    req.requestId
  );

  const errorResponse = ErrorHandler.createErrorResponse(error, req.requestId, req.userId);

  res.status(404).json({
    success: false,
    error: {
      code: errorResponse.code,
      message: errorResponse.message,
      timestamp: errorResponse.timestamp,
      requestId: errorResponse.requestId
    }
  });
};

/**
 * Validation error handler
 */
export const validationErrorHandler = (errors: any[]): AppError => {
  const details = errors.map(err => ({
    field: err.path || err.param,
    message: err.msg || err.message,
    value: err.value
  }));

  return new AppError(
    ErrorCode.VALIDATION_FAILED,
    'Validation failed',
    400,
    false,
    ErrorSeverity.LOW,
    LogCategory.API,
    { validationErrors: details }
  );
};

/**
 * Rate limiting error handler
 */
export const rateLimitErrorHandler = (req: Request, res: Response): void => {
  const error = new AppError(
    ErrorCode.RATE_LIMIT_EXCEEDED,
    'Too many requests, please try again later',
    429,
    true,
    ErrorSeverity.MEDIUM,
    LogCategory.API,
    { ip: req.ip, path: req.path },
    req.userId,
    req.requestId
  );

  const errorResponse = ErrorHandler.createErrorResponse(error, req.requestId, req.userId);

  res.status(429).json({
    success: false,
    error: {
      code: errorResponse.code,
      message: errorResponse.message,
      timestamp: errorResponse.timestamp,
      requestId: errorResponse.requestId,
      retryAfter: 60 // seconds
    }
  });
};

/**
 * Health check for error handling system
 */
export const errorSystemHealthCheck = (): {
  status: 'healthy' | 'degraded' | 'unhealthy';
  metrics: any;
  circuitBreakers: any;
} => {
  const errorMetrics = ErrorHandler.getErrorMetrics();
  const circuitBreakers = Array.from((ErrorHandler as any).circuitBreakers.entries()).map(
    ([name, breaker]: [string, any]) => ({
      service: name,
      ...breaker.getMetrics()
    })
  );

  // Determine system health based on error rates and circuit breaker states
  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  
  // Check for high error rates
  for (const [code, metrics] of errorMetrics) {
    if (metrics.errorRate > 10) { // More than 10 errors per minute
      status = 'degraded';
    }
    if (metrics.errorRate > 50) { // More than 50 errors per minute
      status = 'unhealthy';
      break;
    }
  }

  // Check circuit breaker states
  const openCircuitBreakers = circuitBreakers.filter(cb => cb.state === 'open');
  if (openCircuitBreakers.length > 0) {
    status = openCircuitBreakers.length > 2 ? 'unhealthy' : 'degraded';
  }

  return {
    status,
    metrics: Object.fromEntries(
      Array.from(errorMetrics.entries()).map(([code, metrics]) => [
        code,
        {
          count: metrics.errorCount,
          rate: metrics.errorRate,
          lastOccurrence: metrics.lastOccurrence,
          affectedUsers: metrics.affectedUsers.size
        }
      ])
    ),
    circuitBreakers
  };
};

/**
 * Graceful shutdown handler
 */
export const gracefulShutdownHandler = (server: any): void => {
  const shutdown = (signal: string) => {
    Logger.info(`Received ${signal}, starting graceful shutdown`, {
      category: LogCategory.SYSTEM,
      metadata: { signal }
    });

    server.close((err: Error) => {
      if (err) {
        Logger.error('Error during server shutdown', err, {
          category: LogCategory.SYSTEM
        });
        process.exit(1);
      }

      Logger.info('Server closed successfully', {
        category: LogCategory.SYSTEM
      });
      process.exit(0);
    });

    // Force shutdown after 30 seconds
    setTimeout(() => {
      Logger.error('Forced shutdown after timeout', undefined, {
        category: LogCategory.SYSTEM
      });
      process.exit(1);
    }, 30000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

/**
 * Unhandled rejection and exception handlers
 */
export const setupGlobalErrorHandlers = (): void => {
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    Logger.error(
      'Unhandled Promise Rejection',
      reason instanceof Error ? reason : new Error(String(reason)),
      {
        category: LogCategory.SYSTEM,
        metadata: { type: 'unhandledRejection', promise: promise.toString() }
      }
    );
  });

  process.on('uncaughtException', (error: Error) => {
    Logger.error('Uncaught Exception', error, {
      category: LogCategory.SYSTEM,
      metadata: { type: 'uncaughtException' }
    });
    
    // Exit process after logging
    process.exit(1);
  });
};