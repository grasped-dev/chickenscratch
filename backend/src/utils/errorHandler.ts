import Logger, { LogCategory } from './logger.js';

export interface ErrorResponse {
  code: string;
  message: string;
  details?: any;
  retryable: boolean;
  timestamp: Date;
  requestId?: string;
  userId?: string;
}

export enum ErrorCode {
  // Upload errors (1.5)
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  UNSUPPORTED_FORMAT = 'UNSUPPORTED_FORMAT',
  EMPTY_FILE = 'EMPTY_FILE',
  UPLOAD_FAILED = 'UPLOAD_FAILED',
  STORAGE_QUOTA_EXCEEDED = 'STORAGE_QUOTA_EXCEEDED',
  
  // Authentication errors
  MISSING_TOKEN = 'MISSING_TOKEN',
  INVALID_TOKEN = 'INVALID_TOKEN',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  ACCESS_DENIED = 'ACCESS_DENIED',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  
  // Validation errors
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  INVALID_INPUT = 'INVALID_INPUT',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  
  // Resource errors
  NOT_FOUND = 'NOT_FOUND',
  PROJECT_NOT_FOUND = 'PROJECT_NOT_FOUND',
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  RESOURCE_CONFLICT = 'RESOURCE_CONFLICT',
  
  // OCR Processing errors (2.4)
  OCR_SERVICE_UNAVAILABLE = 'OCR_SERVICE_UNAVAILABLE',
  OCR_PROCESSING_FAILED = 'OCR_PROCESSING_FAILED',
  OCR_TIMEOUT = 'OCR_TIMEOUT',
  IMAGE_QUALITY_TOO_POOR = 'IMAGE_QUALITY_TOO_POOR',
  TEXT_EXTRACTION_FAILED = 'TEXT_EXTRACTION_FAILED',
  
  // Clustering errors
  CLUSTERING_FAILED = 'CLUSTERING_FAILED',
  INSUFFICIENT_TEXT_CONTENT = 'INSUFFICIENT_TEXT_CONTENT',
  EMBEDDING_GENERATION_FAILED = 'EMBEDDING_GENERATION_FAILED',
  
  // Export errors (8.5)
  EXPORT_GENERATION_FAILED = 'EXPORT_GENERATION_FAILED',
  TEMPLATE_RENDERING_FAILED = 'TEMPLATE_RENDERING_FAILED',
  PDF_GENERATION_FAILED = 'PDF_GENERATION_FAILED',
  CSV_GENERATION_FAILED = 'CSV_GENERATION_FAILED',
  EXPORT_TIMEOUT = 'EXPORT_TIMEOUT',
  
  // Service errors
  AWS_SERVICE_ERROR = 'AWS_SERVICE_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  LLM_SERVICE_ERROR = 'LLM_SERVICE_ERROR',
  
  // Job processing errors
  JOB_PROCESSING_FAILED = 'JOB_PROCESSING_FAILED',
  JOB_TIMEOUT = 'JOB_TIMEOUT',
  JOB_QUEUE_FULL = 'JOB_QUEUE_FULL',
  
  // Generic errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE'
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface ErrorMetrics {
  errorCount: number;
  lastOccurrence: Date;
  affectedUsers: Set<string>;
  errorRate: number;
}

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly retryable: boolean;
  public readonly severity: ErrorSeverity;
  public readonly category: LogCategory;
  public readonly details?: any;
  public readonly userId?: string;
  public readonly requestId?: string;

  constructor(
    code: ErrorCode,
    message: string,
    statusCode: number = 500,
    retryable: boolean = false,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    category: LogCategory = LogCategory.SYSTEM,
    details?: any,
    userId?: string,
    requestId?: string
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.retryable = retryable;
    this.severity = severity;
    this.category = category;
    this.details = details;
    this.userId = userId;
    this.requestId = requestId;

    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Create user-friendly error message
   */
  getUserFriendlyMessage(): string {
    const userMessages: Record<ErrorCode, string> = {
      // Upload errors
      [ErrorCode.FILE_TOO_LARGE]: 'The file you uploaded is too large. Please choose a smaller file.',
      [ErrorCode.UNSUPPORTED_FORMAT]: 'This file format is not supported. Please upload a JPEG, PNG, or HEIC image.',
      [ErrorCode.EMPTY_FILE]: 'The file appears to be empty. Please choose a valid image file.',
      [ErrorCode.UPLOAD_FAILED]: 'Failed to upload your file. Please try again.',
      [ErrorCode.STORAGE_QUOTA_EXCEEDED]: 'Storage quota exceeded. Please delete some files or upgrade your plan.',
      
      // Authentication errors
      [ErrorCode.MISSING_TOKEN]: 'Please log in to continue.',
      [ErrorCode.INVALID_TOKEN]: 'Your session has expired. Please log in again.',
      [ErrorCode.TOKEN_EXPIRED]: 'Your session has expired. Please log in again.',
      [ErrorCode.ACCESS_DENIED]: 'You don\'t have permission to access this resource.',
      [ErrorCode.INVALID_CREDENTIALS]: 'Invalid email or password. Please try again.',
      
      // Validation errors
      [ErrorCode.MISSING_REQUIRED_FIELD]: 'Please fill in all required fields.',
      [ErrorCode.INVALID_INPUT]: 'Please check your input and try again.',
      [ErrorCode.VALIDATION_FAILED]: 'The information provided is not valid.',
      
      // Resource errors
      [ErrorCode.NOT_FOUND]: 'The requested resource was not found.',
      [ErrorCode.PROJECT_NOT_FOUND]: 'Project not found. It may have been deleted.',
      [ErrorCode.FILE_NOT_FOUND]: 'File not found. It may have been deleted.',
      [ErrorCode.USER_NOT_FOUND]: 'User not found.',
      [ErrorCode.RESOURCE_CONFLICT]: 'This action conflicts with existing data.',
      
      // OCR Processing errors
      [ErrorCode.OCR_SERVICE_UNAVAILABLE]: 'Text recognition service is temporarily unavailable. Please try again later.',
      [ErrorCode.OCR_PROCESSING_FAILED]: 'Failed to extract text from your image. Please try with a clearer image.',
      [ErrorCode.OCR_TIMEOUT]: 'Text extraction is taking longer than expected. Please try again.',
      [ErrorCode.IMAGE_QUALITY_TOO_POOR]: 'Image quality is too poor for text extraction. Please upload a clearer image.',
      [ErrorCode.TEXT_EXTRACTION_FAILED]: 'Unable to extract text from this image. Please try with a different image.',
      
      // Clustering errors
      [ErrorCode.CLUSTERING_FAILED]: 'Failed to organize your notes. Please try again.',
      [ErrorCode.INSUFFICIENT_TEXT_CONTENT]: 'Not enough text content to organize. Please add more notes.',
      [ErrorCode.EMBEDDING_GENERATION_FAILED]: 'Failed to analyze text content. Please try again.',
      
      // Export errors
      [ErrorCode.EXPORT_GENERATION_FAILED]: 'Failed to generate export file. Please try again.',
      [ErrorCode.TEMPLATE_RENDERING_FAILED]: 'Failed to format export document. Please try again.',
      [ErrorCode.PDF_GENERATION_FAILED]: 'Failed to generate PDF. Please try again.',
      [ErrorCode.CSV_GENERATION_FAILED]: 'Failed to generate CSV file. Please try again.',
      [ErrorCode.EXPORT_TIMEOUT]: 'Export is taking longer than expected. Please try again.',
      
      // Service errors
      [ErrorCode.AWS_SERVICE_ERROR]: 'Cloud service temporarily unavailable. Please try again later.',
      [ErrorCode.DATABASE_ERROR]: 'Database temporarily unavailable. Please try again later.',
      [ErrorCode.EXTERNAL_SERVICE_ERROR]: 'External service temporarily unavailable. Please try again later.',
      [ErrorCode.LLM_SERVICE_ERROR]: 'AI service temporarily unavailable. Please try again later.',
      
      // Job processing errors
      [ErrorCode.JOB_PROCESSING_FAILED]: 'Processing failed. Please try again.',
      [ErrorCode.JOB_TIMEOUT]: 'Processing is taking longer than expected. Please try again.',
      [ErrorCode.JOB_QUEUE_FULL]: 'System is busy. Please try again in a few minutes.',
      
      // Generic errors
      [ErrorCode.INTERNAL_ERROR]: 'Something went wrong. Please try again.',
      [ErrorCode.NETWORK_ERROR]: 'Network connection issue. Please check your connection and try again.',
      [ErrorCode.RATE_LIMIT_EXCEEDED]: 'Too many requests. Please wait a moment and try again.',
      [ErrorCode.SERVICE_UNAVAILABLE]: 'Service temporarily unavailable. Please try again later.'
    };

    return userMessages[this.code] || this.message;
  }
}

export class ErrorHandler {
  private static errorMetrics = new Map<ErrorCode, ErrorMetrics>();
  private static circuitBreakers = new Map<string, CircuitBreaker>();

  /**
   * Create standardized error response
   */
  static createErrorResponse(error: Error | AppError, requestId?: string, userId?: string): ErrorResponse {
    const timestamp = new Date();

    if (error instanceof AppError) {
      // Track error metrics
      this.trackError(error.code, userId);
      
      // Log error with context
      Logger.error(
        `AppError: ${error.message}`,
        error,
        {
          category: error.category,
          userId: error.userId || userId,
          requestId: error.requestId || requestId,
          metadata: {
            code: error.code,
            severity: error.severity,
            retryable: error.retryable,
            details: error.details
          }
        }
      );

      return {
        code: error.code,
        message: error.getUserFriendlyMessage(),
        details: process.env.NODE_ENV === 'development' ? error.details : undefined,
        retryable: error.retryable,
        timestamp,
        requestId: error.requestId || requestId,
        userId: error.userId || userId
      };
    }

    // Handle known error patterns
    const mappedError = this.mapKnownError(error);
    this.trackError(mappedError.code, userId);

    // Log unmapped error
    Logger.error(
      `Unmapped error: ${error.message}`,
      error,
      {
        category: LogCategory.SYSTEM,
        userId,
        requestId,
        metadata: {
          code: mappedError.code,
          originalError: error.name
        }
      }
    );

    return {
      code: mappedError.code,
      message: mappedError.userMessage,
      retryable: mappedError.retryable,
      timestamp,
      requestId,
      userId
    };
  }

  /**
   * Map known error patterns to AppError codes
   */
  private static mapKnownError(error: Error): { code: ErrorCode; userMessage: string; retryable: boolean } {
    const message = error.message.toLowerCase();

    // Upload errors
    if (message.includes('file size exceeds') || message.includes('too large')) {
      return {
        code: ErrorCode.FILE_TOO_LARGE,
        userMessage: 'The file you uploaded is too large. Please choose a smaller file.',
        retryable: false
      };
    }

    if (message.includes('not allowed') || message.includes('unsupported format')) {
      return {
        code: ErrorCode.UNSUPPORTED_FORMAT,
        userMessage: 'This file format is not supported. Please upload a JPEG, PNG, or HEIC image.',
        retryable: false
      };
    }

    // AWS/S3 errors
    if (message.includes('aws') || message.includes('s3') || message.includes('textract')) {
      return {
        code: ErrorCode.AWS_SERVICE_ERROR,
        userMessage: 'Cloud service temporarily unavailable. Please try again later.',
        retryable: true
      };
    }

    // Database errors
    if (message.includes('database') || message.includes('connection') || message.includes('query')) {
      return {
        code: ErrorCode.DATABASE_ERROR,
        userMessage: 'Database temporarily unavailable. Please try again later.',
        retryable: true
      };
    }

    // Network errors (check before database errors since some network errors mention connection)
    if (message.includes('econnreset') || message.includes('enotfound') || message.includes('network') || 
        (message.includes('timeout') && !message.includes('database'))) {
      return {
        code: ErrorCode.NETWORK_ERROR,
        userMessage: 'Network connection issue. Please check your connection and try again.',
        retryable: true
      };
    }

    // JWT/Auth errors
    if (message.includes('jwt') || message.includes('token') || message.includes('unauthorized')) {
      return {
        code: ErrorCode.INVALID_TOKEN,
        userMessage: 'Your session has expired. Please log in again.',
        retryable: false
      };
    }

    // Validation errors
    if (message.includes('validation') || message.includes('required') || message.includes('invalid') ||
        message.includes('json') || message.includes('syntax')) {
      return {
        code: ErrorCode.VALIDATION_FAILED,
        userMessage: 'The information provided is not valid.',
        retryable: false
      };
    }

    // Default to internal error
    return {
      code: ErrorCode.INTERNAL_ERROR,
      userMessage: 'Something went wrong. Please try again.',
      retryable: false
    };
  }

  /**
   * Track error metrics for monitoring
   */
  private static trackError(code: ErrorCode, userId?: string): void {
    const existing = this.errorMetrics.get(code);
    
    if (existing) {
      existing.errorCount++;
      existing.lastOccurrence = new Date();
      if (userId) {
        existing.affectedUsers.add(userId);
      }
    } else {
      this.errorMetrics.set(code, {
        errorCount: 1,
        lastOccurrence: new Date(),
        affectedUsers: new Set(userId ? [userId] : []),
        errorRate: 0
      });
    }

    // Calculate error rate (errors per minute)
    const metrics = this.errorMetrics.get(code)!;
    const timeWindow = 60000; // 1 minute
    const now = Date.now();
    const windowStart = now - timeWindow;
    
    // This is a simplified rate calculation
    // In production, you'd want a more sophisticated sliding window
    metrics.errorRate = metrics.errorCount / (timeWindow / 60000);

    // Alert on high error rates or critical errors
    this.checkAlertThresholds(code, metrics);
  }

  /**
   * Check if error metrics exceed alert thresholds
   */
  private static checkAlertThresholds(code: ErrorCode, metrics: ErrorMetrics): void {
    const criticalErrors = [
      ErrorCode.DATABASE_ERROR,
      ErrorCode.AWS_SERVICE_ERROR,
      ErrorCode.INTERNAL_ERROR
    ];

    const highVolumeThreshold = 10; // errors per minute
    const criticalErrorThreshold = 1; // any critical error

    if (criticalErrors.includes(code) && metrics.errorCount >= criticalErrorThreshold) {
      Logger.error(
        `Critical error threshold exceeded: ${code}`,
        undefined,
        {
          category: LogCategory.SYSTEM,
          metadata: {
            errorCode: code,
            errorCount: metrics.errorCount,
            affectedUsers: metrics.affectedUsers.size,
            errorRate: metrics.errorRate
          }
        }
      );
    }

    if (metrics.errorRate >= highVolumeThreshold) {
      Logger.warn(
        `High error rate detected: ${code}`,
        {
          category: LogCategory.SYSTEM,
          metadata: {
            errorCode: code,
            errorRate: metrics.errorRate,
            errorCount: metrics.errorCount
          }
        }
      );
    }
  }

  /**
   * Get error metrics for monitoring dashboard
   */
  static getErrorMetrics(): Map<ErrorCode, ErrorMetrics> {
    return new Map(this.errorMetrics);
  }

  /**
   * Reset error metrics (useful for testing)
   */
  static resetMetrics(): void {
    this.errorMetrics.clear();
  }

  /**
   * Determine if error should be retried
   */
  static shouldRetry(error: Error | AppError, attemptCount: number = 0, maxRetries: number = 3): boolean {
    if (attemptCount >= maxRetries) {
      return false;
    }

    if (error instanceof AppError) {
      return error.retryable;
    }

    // Retry on network errors, AWS service errors, and database errors
    const retryablePatterns = [
      /network/i,
      /timeout/i,
      /connection/i,
      /aws/i,
      /s3/i,
      /textract/i,
      /database/i,
      /econnreset/i,
      /enotfound/i,
      /503/i, // Service unavailable
      /502/i, // Bad gateway
      /504/i  // Gateway timeout
    ];

    return retryablePatterns.some(pattern => pattern.test(error.message));
  }

  /**
   * Get circuit breaker for a service
   */
  static getCircuitBreaker(serviceName: string): CircuitBreaker {
    if (!this.circuitBreakers.has(serviceName)) {
      this.circuitBreakers.set(serviceName, new CircuitBreaker(serviceName));
    }
    return this.circuitBreakers.get(serviceName)!;
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  static getRetryDelay(attemptCount: number): number {
    const baseDelay = 1000; // 1 second
    const maxDelay = 30000; // 30 seconds
    
    const delay = Math.min(baseDelay * Math.pow(2, attemptCount), maxDelay);
    
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.1 * delay;
    
    return delay + jitter;
  }

  /**
   * Retry function with exponential backoff and circuit breaker
   */
  static async retry<T>(
    fn: () => Promise<T>,
    options: {
      maxRetries?: number;
      context?: string;
      serviceName?: string;
      userId?: string;
      requestId?: string;
    } = {}
  ): Promise<T> {
    const {
      maxRetries = 3,
      context = 'operation',
      serviceName,
      userId,
      requestId
    } = options;

    let lastError: Error;
    const circuitBreaker = serviceName ? this.getCircuitBreaker(serviceName) : null;
    
    // Check circuit breaker before attempting
    if (circuitBreaker && circuitBreaker.isOpen()) {
      throw new AppError(
        ErrorCode.SERVICE_UNAVAILABLE,
        `Service ${serviceName} is temporarily unavailable`,
        503,
        false,
        ErrorSeverity.HIGH,
        LogCategory.SYSTEM,
        { serviceName, circuitBreakerState: 'open' },
        userId,
        requestId
      );
    }

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await fn();
        
        // Record success in circuit breaker
        if (circuitBreaker) {
          circuitBreaker.recordSuccess();
        }
        
        if (attempt > 0) {
          Logger.info(
            `${context} succeeded after ${attempt} retries`,
            {
              category: LogCategory.SYSTEM,
              userId,
              requestId,
              metadata: { context, attempts: attempt + 1, serviceName }
            }
          );
        }
        
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Record failure in circuit breaker
        if (circuitBreaker) {
          circuitBreaker.recordFailure();
        }
        
        if (attempt === maxRetries || !this.shouldRetry(lastError, attempt, maxRetries)) {
          Logger.error(
            `${context} failed after ${attempt + 1} attempts`,
            lastError,
            {
              category: LogCategory.SYSTEM,
              userId,
              requestId,
              metadata: { context, attempts: attempt + 1, serviceName, finalError: true }
            }
          );
          throw lastError;
        }
        
        const delay = this.getRetryDelay(attempt);
        Logger.warn(
          `${context} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms`,
          {
            category: LogCategory.SYSTEM,
            userId,
            requestId,
            metadata: { 
              context, 
              attempt: attempt + 1, 
              maxRetries: maxRetries + 1, 
              delay, 
              error: lastError.message,
              serviceName
            }
          }
        );
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError!;
  }

  /**
   * Wrap a function with error handling and retry logic
   */
  static withRetry<T extends any[], R>(
    fn: (...args: T) => Promise<R>,
    options: {
      maxRetries?: number;
      context?: string;
      serviceName?: string;
    } = {}
  ) {
    return async (...args: T): Promise<R> => {
      return this.retry(() => fn(...args), options);
    };
  }
}

/**
 * Circuit breaker implementation for service resilience
 */
class CircuitBreaker {
  private failureCount = 0;
  private lastFailureTime?: Date;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  
  private readonly failureThreshold: number;
  private readonly recoveryTimeout: number; // milliseconds
  private readonly monitoringWindow: number; // milliseconds

  constructor(
    private serviceName: string,
    failureThreshold: number = 5,
    recoveryTimeout: number = 60000, // 1 minute
    monitoringWindow: number = 300000 // 5 minutes
  ) {
    this.failureThreshold = failureThreshold;
    this.recoveryTimeout = recoveryTimeout;
    this.monitoringWindow = monitoringWindow;
  }

  isOpen(): boolean {
    if (this.state === 'closed') {
      return false;
    }

    if (this.state === 'open') {
      // Check if we should transition to half-open
      if (this.lastFailureTime && 
          Date.now() - this.lastFailureTime.getTime() > this.recoveryTimeout) {
        this.state = 'half-open';
        Logger.info(
          `Circuit breaker for ${this.serviceName} transitioning to half-open`,
          {
            category: LogCategory.SYSTEM,
            metadata: { serviceName: this.serviceName, state: 'half-open' }
          }
        );
        return false;
      }
      return true;
    }

    // half-open state
    return false;
  }

  recordSuccess(): void {
    if (this.state === 'half-open') {
      this.state = 'closed';
      this.failureCount = 0;
      Logger.info(
        `Circuit breaker for ${this.serviceName} closed after successful recovery`,
        {
          category: LogCategory.SYSTEM,
          metadata: { serviceName: this.serviceName, state: 'closed' }
        }
      );
    } else if (this.state === 'closed') {
      // Reset failure count on success in closed state
      this.failureCount = Math.max(0, this.failureCount - 1);
    }
  }

  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = new Date();

    if (this.state === 'half-open') {
      // Failure in half-open state goes back to open
      this.state = 'open';
      Logger.warn(
        `Circuit breaker for ${this.serviceName} reopened after failure in half-open state`,
        {
          category: LogCategory.SYSTEM,
          metadata: { serviceName: this.serviceName, state: 'open', failureCount: this.failureCount }
        }
      );
    } else if (this.state === 'closed' && this.failureCount >= this.failureThreshold) {
      // Too many failures, open the circuit
      this.state = 'open';
      Logger.error(
        `Circuit breaker for ${this.serviceName} opened due to ${this.failureCount} failures`,
        undefined,
        {
          category: LogCategory.SYSTEM,
          metadata: { 
            serviceName: this.serviceName, 
            state: 'open', 
            failureCount: this.failureCount,
            threshold: this.failureThreshold
          }
        }
      );
    }
  }

  getState(): string {
    return this.state;
  }

  getMetrics(): { state: string; failureCount: number; lastFailureTime?: Date } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime
    };
  }
}

/**
 * Upload-specific error utilities
 */
export class UploadErrorHandler {
  static validateFileError(file: Express.Multer.File, maxSize: number, allowedTypes: string[]): AppError | null {
    if (file.size === 0) {
      return new AppError(
        ErrorCode.EMPTY_FILE,
        'File is empty',
        400,
        false
      );
    }

    if (file.size > maxSize) {
      return new AppError(
        ErrorCode.FILE_TOO_LARGE,
        `File size exceeds maximum allowed size of ${maxSize / 1024 / 1024}MB`,
        400,
        false,
        { fileSize: file.size, maxSize }
      );
    }

    if (!allowedTypes.includes(file.mimetype)) {
      return new AppError(
        ErrorCode.UNSUPPORTED_FORMAT,
        `File type ${file.mimetype} is not allowed. Allowed types: ${allowedTypes.join(', ')}`,
        400,
        false,
        { fileType: file.mimetype, allowedTypes }
      );
    }

    return null;
  }

  static s3UploadError(error: any): AppError {
    return new AppError(
      ErrorCode.AWS_SERVICE_ERROR,
      `Failed to upload file to S3: ${error.message}`,
      500,
      true,
      { awsError: error }
    );
  }

  static databaseError(error: any): AppError {
    return new AppError(
      ErrorCode.DATABASE_ERROR,
      `Database operation failed: ${error.message}`,
      500,
      true,
      { dbError: error }
    );
  }
}