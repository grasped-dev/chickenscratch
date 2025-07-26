import { Request, Response } from 'express';
import { ocrService, OCRError } from '../services/ocr.js';
import { OCRRequest } from '../../../shared/src/types/processing.js';

/**
 * Process image synchronously using OCR
 */
export const processImageSync = async (req: Request, res: Response): Promise<void> => {
  try {
    const ocrRequest: OCRRequest = {
      imageUrl: req.body.imageUrl,
      processingOptions: {
        detectHandwriting: req.body.processingOptions?.detectHandwriting ?? true,
        detectTables: req.body.processingOptions?.detectTables ?? false,
        detectForms: req.body.processingOptions?.detectForms ?? false,
      },
    };

    // Validate required fields
    if (!ocrRequest.imageUrl) {
      res.status(400).json({
        error: 'Missing required field: imageUrl',
        code: 'MISSING_IMAGE_URL',
      });
      return;
    }

    const result = await ocrService.processImageSync(ocrRequest);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    handleOCRError(error, res);
  }
};

/**
 * Start asynchronous image processing
 */
export const processImageAsync = async (req: Request, res: Response): Promise<void> => {
  try {
    const ocrRequest: OCRRequest = {
      imageUrl: req.body.imageUrl,
      processingOptions: {
        detectHandwriting: req.body.processingOptions?.detectHandwriting ?? true,
        detectTables: req.body.processingOptions?.detectTables ?? false,
        detectForms: req.body.processingOptions?.detectForms ?? false,
      },
    };

    // Validate required fields
    if (!ocrRequest.imageUrl) {
      res.status(400).json({
        error: 'Missing required field: imageUrl',
        code: 'MISSING_IMAGE_URL',
      });
      return;
    }

    const jobId = await ocrService.processImageAsync(ocrRequest);

    res.status(202).json({
      success: true,
      data: {
        jobId,
        status: 'processing',
        message: 'OCR processing started successfully',
      },
    });
  } catch (error) {
    handleOCRError(error, res);
  }
};

/**
 * Get results from asynchronous processing job
 */
export const getAsyncResults = async (req: Request, res: Response): Promise<void> => {
  try {
    const { jobId } = req.params;

    if (!jobId || jobId.trim() === '') {
      res.status(400).json({
        error: 'Missing required parameter: jobId',
        code: 'MISSING_JOB_ID',
      });
      return;
    }

    const result = await ocrService.getAsyncResults(jobId);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    handleOCRError(error, res);
  }
};

/**
 * Check status of asynchronous processing job
 */
export const checkJobStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { jobId } = req.params;

    if (!jobId || jobId.trim() === '') {
      res.status(400).json({
        error: 'Missing required parameter: jobId',
        code: 'MISSING_JOB_ID',
      });
      return;
    }

    const status = await ocrService.checkJobStatus(jobId);

    res.status(200).json({
      success: true,
      data: {
        jobId,
        status,
      },
    });
  } catch (error) {
    handleOCRError(error, res);
  }
};

/**
 * Process image with retry logic
 */
export const processWithRetry = async (req: Request, res: Response): Promise<void> => {
  try {
    const ocrRequest: OCRRequest = {
      imageUrl: req.body.imageUrl,
      processingOptions: {
        detectHandwriting: req.body.processingOptions?.detectHandwriting ?? true,
        detectTables: req.body.processingOptions?.detectTables ?? false,
        detectForms: req.body.processingOptions?.detectForms ?? false,
      },
    };

    const maxRetries = req.body.maxRetries || 3;
    const useAsync = req.body.useAsync || false;

    // Validate required fields
    if (!ocrRequest.imageUrl) {
      res.status(400).json({
        error: 'Missing required field: imageUrl',
        code: 'MISSING_IMAGE_URL',
      });
      return;
    }

    const result = await ocrService.processWithRetry(ocrRequest, maxRetries, useAsync);

    if (useAsync && typeof result === 'string') {
      // Async processing returns job ID
      res.status(202).json({
        success: true,
        data: {
          jobId: result,
          status: 'processing',
          message: 'OCR processing started successfully with retry logic',
        },
      });
    } else {
      // Sync processing returns OCR results
      res.status(200).json({
        success: true,
        data: result,
      });
    }
  } catch (error) {
    handleOCRError(error, res);
  }
};

/**
 * Process multiple images in batch
 */
export const processBatch = async (req: Request, res: Response): Promise<void> => {
  try {
    const { requests } = req.body;

    if (!Array.isArray(requests) || requests.length === 0) {
      res.status(400).json({
        error: 'Missing or empty requests array',
        code: 'MISSING_REQUESTS',
      });
      return;
    }

    // Validate each request
    const ocrRequests: OCRRequest[] = requests.map((request: any, index: number) => {
      if (!request.imageUrl) {
        throw new Error(`Missing imageUrl in request ${index}`);
      }

      return {
        imageUrl: request.imageUrl,
        processingOptions: {
          detectHandwriting: request.processingOptions?.detectHandwriting ?? true,
          detectTables: request.processingOptions?.detectTables ?? false,
          detectForms: request.processingOptions?.detectForms ?? false,
        },
      };
    });

    const results = await ocrService.processBatch(ocrRequests);

    res.status(200).json({
      success: true,
      data: {
        results,
        totalProcessed: results.length,
        totalRequested: requests.length,
      },
    });
  } catch (error) {
    handleOCRError(error, res);
  }
};

/**
 * Handle OCR-specific errors and send appropriate HTTP responses
 */
function handleOCRError(error: unknown, res: Response): void {
  if (error instanceof OCRError) {
    // Determine HTTP status based on error type
    let statusCode = 500;
    let errorCode = 'OCR_ERROR';

    if (error.message.toLowerCase().includes('access denied')) {
      statusCode = 403;
      errorCode = 'ACCESS_DENIED';
    } else if (error.message.toLowerCase().includes('not found')) {
      statusCode = 404;
      errorCode = 'RESOURCE_NOT_FOUND';
    } else if (error.message.toLowerCase().includes('invalid')) {
      statusCode = 400;
      errorCode = 'INVALID_REQUEST';
    } else if (error.message.toLowerCase().includes('timeout')) {
      statusCode = 408;
      errorCode = 'PROCESSING_TIMEOUT';
    } else if (error.message.toLowerCase().includes('throttl')) {
      statusCode = 429;
      errorCode = 'RATE_LIMITED';
    }

    res.status(statusCode).json({
      success: false,
      error: error.message,
      code: errorCode,
      retryable: error.retryable,
      timestamp: new Date().toISOString(),
    });
  } else {
    // Generic error handling
    console.error('Unexpected OCR error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during OCR processing',
      code: 'INTERNAL_ERROR',
      retryable: true,
      timestamp: new Date().toISOString(),
    });
  }
}