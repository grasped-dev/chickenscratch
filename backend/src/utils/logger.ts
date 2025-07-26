import winston from 'winston';
import path from 'path';

// Define log levels
export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  HTTP = 'http',
  DEBUG = 'debug'
}

// Define log categories for better organization
export enum LogCategory {
  AUTH = 'auth',
  UPLOAD = 'upload',
  OCR = 'ocr',
  PROCESSING = 'processing',
  CLUSTERING = 'clustering',
  EXPORT = 'export',
  DATABASE = 'database',
  AWS = 'aws',
  API = 'api',
  SYSTEM = 'system',
  JOB_QUEUE = 'job_queue'
}

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, category, userId, requestId, stack, ...meta }) => {
    const logEntry = {
      timestamp,
      level,
      message,
      category: category || LogCategory.SYSTEM,
      ...(userId && { userId }),
      ...(requestId && { requestId }),
      ...(stack && { stack }),
      ...meta
    };
    return JSON.stringify(logEntry);
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'chicken-scratch-api' },
  transports: [
    // Console transport for development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
        winston.format.printf(({ timestamp, level, message, category, userId, requestId }) => {
          let logMessage = `${timestamp} [${level}]`;
          if (category) logMessage += ` [${category}]`;
          if (requestId) logMessage += ` [${requestId}]`;
          if (userId) logMessage += ` [user:${userId}]`;
          logMessage += `: ${message}`;
          return logMessage;
        })
      )
    }),
    
    // File transport for errors
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    
    // File transport for all logs
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ]
});

// Production-specific transports
if (process.env.NODE_ENV === 'production') {
  // Remove console transport in production
  logger.clear();
  
  // Add production file transports
  logger.add(new winston.transports.File({
    filename: path.join(process.cwd(), 'logs', 'error.log'),
    level: 'error',
    maxsize: 10485760, // 10MB
    maxFiles: 10
  }));
  
  logger.add(new winston.transports.File({
    filename: path.join(process.cwd(), 'logs', 'combined.log'),
    maxsize: 10485760, // 10MB
    maxFiles: 10
  }));
}

// Logger interface for structured logging
export interface LogContext {
  category?: LogCategory;
  userId?: string;
  requestId?: string;
  metadata?: Record<string, any>;
}

export class Logger {
  /**
   * Log error message
   */
  static error(message: string, error?: Error, context?: LogContext): void {
    logger.error(message, {
      ...context,
      ...(error && { 
        error: error.message,
        stack: error.stack,
        name: error.name
      })
    });
  }

  /**
   * Log warning message
   */
  static warn(message: string, context?: LogContext): void {
    logger.warn(message, context);
  }

  /**
   * Log info message
   */
  static info(message: string, context?: LogContext): void {
    logger.info(message, context);
  }

  /**
   * Log HTTP request
   */
  static http(message: string, context?: LogContext): void {
    logger.http(message, context);
  }

  /**
   * Log debug message
   */
  static debug(message: string, context?: LogContext): void {
    logger.debug(message, context);
  }

  /**
   * Log authentication events
   */
  static auth(message: string, userId?: string, metadata?: Record<string, any>): void {
    logger.info(message, {
      category: LogCategory.AUTH,
      userId,
      metadata
    });
  }

  /**
   * Log upload events
   */
  static upload(message: string, userId?: string, metadata?: Record<string, any>): void {
    logger.info(message, {
      category: LogCategory.UPLOAD,
      userId,
      metadata
    });
  }

  /**
   * Log OCR processing events
   */
  static ocr(message: string, userId?: string, metadata?: Record<string, any>): void {
    logger.info(message, {
      category: LogCategory.OCR,
      userId,
      metadata
    });
  }

  /**
   * Log clustering events
   */
  static clustering(message: string, userId?: string, metadata?: Record<string, any>): void {
    logger.info(message, {
      category: LogCategory.CLUSTERING,
      userId,
      metadata
    });
  }

  /**
   * Log export events
   */
  static export(message: string, userId?: string, metadata?: Record<string, any>): void {
    logger.info(message, {
      category: LogCategory.EXPORT,
      userId,
      metadata
    });
  }

  /**
   * Log database operations
   */
  static database(message: string, metadata?: Record<string, any>): void {
    logger.info(message, {
      category: LogCategory.DATABASE,
      metadata
    });
  }

  /**
   * Log AWS service interactions
   */
  static aws(message: string, metadata?: Record<string, any>): void {
    logger.info(message, {
      category: LogCategory.AWS,
      metadata
    });
  }

  /**
   * Log API requests and responses
   */
  static api(message: string, requestId?: string, metadata?: Record<string, any>): void {
    logger.http(message, {
      category: LogCategory.API,
      requestId,
      metadata
    });
  }

  /**
   * Log job queue events
   */
  static jobQueue(message: string, metadata?: Record<string, any>): void {
    logger.info(message, {
      category: LogCategory.JOB_QUEUE,
      metadata
    });
  }

  /**
   * Log performance metrics
   */
  static performance(operation: string, duration: number, context?: LogContext): void {
    logger.info(`Performance: ${operation} completed in ${duration}ms`, {
      ...context,
      metadata: {
        ...context?.metadata,
        operation,
        duration,
        performance: true
      }
    });
  }

  /**
   * Create child logger with context
   */
  static child(context: LogContext): Logger {
    return new ContextLogger(context);
  }
}

/**
 * Context logger that maintains context across multiple log calls
 */
class ContextLogger {
  constructor(private context: LogContext) {}

  error(message: string, error?: Error): void {
    Logger.error(message, error, this.context);
  }

  warn(message: string): void {
    Logger.warn(message, this.context);
  }

  info(message: string): void {
    Logger.info(message, this.context);
  }

  debug(message: string): void {
    Logger.debug(message, this.context);
  }
}

export default Logger;