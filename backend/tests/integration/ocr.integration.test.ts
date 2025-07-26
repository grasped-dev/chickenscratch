import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { authMiddleware } from '../../src/middleware/auth.js';
import ocrRoutes from '../../src/routes/ocr.js';
import { ocrService } from '../../src/services/ocr.js';
import { OCRResponse } from '../../../shared/src/types/processing.js';

// Mock the OCR service
vi.mock('../../src/services/ocr.js');

// Mock auth middleware
vi.mock('../../src/middleware/auth.js', () => ({
  authMiddleware: {
    authenticate: vi.fn((req, res, next) => {
      req.user = { id: 'test-user-id', email: 'test@example.com' };
      next();
    }),
  },
}));

describe('OCR Integration Tests', () => {
  let app: express.Application;

  const mockOCRResponse: OCRResponse = {
    extractedText: [
      {
        id: 'text-1',
        text: 'Hello World',
        confidence: 95.5,
        boundingBox: { left: 0.1, top: 0.2, width: 0.3, height: 0.05 },
        type: 'LINE',
      },
    ],
    boundingBoxes: [
      { left: 0.1, top: 0.2, width: 0.3, height: 0.05 },
    ],
    confidence: 95.5,
    processingTime: 1500,
  };

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/ocr', ocrRoutes);

    // Reset all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/ocr/process/sync', () => {
    it('should process image synchronously', async () => {
      const mockProcessImageSync = vi.mocked(ocrService.processImageSync);
      mockProcessImageSync.mockResolvedValue(mockOCRResponse);

      const response = await request(app)
        .post('/api/ocr/process/sync')
        .send({
          imageUrl: 's3://test-bucket/test-image.jpg',
          processingOptions: {
            detectHandwriting: true,
            detectTables: false,
            detectForms: false,
          },
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        data: mockOCRResponse,
      });

      expect(mockProcessImageSync).toHaveBeenCalledWith({
        imageUrl: 's3://test-bucket/test-image.jpg',
        processingOptions: {
          detectHandwriting: true,
          detectTables: false,
          detectForms: false,
        },
      });
    });

    it('should return 400 for missing imageUrl', async () => {
      const response = await request(app)
        .post('/api/ocr/process/sync')
        .send({
          processingOptions: {
            detectHandwriting: true,
          },
        });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        error: 'Missing required field: imageUrl',
        code: 'MISSING_IMAGE_URL',
      });
    });

    it('should use default processing options when not provided', async () => {
      const mockProcessImageSync = vi.mocked(ocrService.processImageSync);
      mockProcessImageSync.mockResolvedValue(mockOCRResponse);

      const response = await request(app)
        .post('/api/ocr/process/sync')
        .send({
          imageUrl: 's3://test-bucket/test-image.jpg',
        });

      expect(response.status).toBe(200);
      expect(mockProcessImageSync).toHaveBeenCalledWith({
        imageUrl: 's3://test-bucket/test-image.jpg',
        processingOptions: {
          detectHandwriting: true,
          detectTables: false,
          detectForms: false,
        },
      });
    });

    it('should handle OCR service errors', async () => {
      const mockProcessImageSync = vi.mocked(ocrService.processImageSync);
      mockProcessImageSync.mockRejectedValue(new Error('OCR processing failed'));

      const response = await request(app)
        .post('/api/ocr/process/sync')
        .send({
          imageUrl: 's3://test-bucket/test-image.jpg',
        });

      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({
        success: false,
        error: 'Internal server error during OCR processing',
        code: 'INTERNAL_ERROR',
        retryable: true,
      });
    });
  });

  describe('POST /api/ocr/process/async', () => {
    it('should start async processing', async () => {
      const mockJobId = 'job-123';
      const mockProcessImageAsync = vi.mocked(ocrService.processImageAsync);
      mockProcessImageAsync.mockResolvedValue(mockJobId);

      const response = await request(app)
        .post('/api/ocr/process/async')
        .send({
          imageUrl: 's3://test-bucket/test-image.jpg',
          processingOptions: {
            detectHandwriting: true,
            detectTables: true,
            detectForms: false,
          },
        });

      expect(response.status).toBe(202);
      expect(response.body).toMatchObject({
        success: true,
        data: {
          jobId: mockJobId,
          status: 'processing',
          message: 'OCR processing started successfully',
        },
      });

      expect(mockProcessImageAsync).toHaveBeenCalledWith({
        imageUrl: 's3://test-bucket/test-image.jpg',
        processingOptions: {
          detectHandwriting: true,
          detectTables: true,
          detectForms: false,
        },
      });
    });

    it('should return 400 for missing imageUrl', async () => {
      const response = await request(app)
        .post('/api/ocr/process/async')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        error: 'Missing required field: imageUrl',
        code: 'MISSING_IMAGE_URL',
      });
    });
  });

  describe('GET /api/ocr/jobs/:jobId/results', () => {
    it('should get async processing results', async () => {
      const mockJobId = 'job-123';
      const mockGetAsyncResults = vi.mocked(ocrService.getAsyncResults);
      mockGetAsyncResults.mockResolvedValue(mockOCRResponse);

      const response = await request(app)
        .get(`/api/ocr/jobs/${mockJobId}/results`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        data: mockOCRResponse,
      });

      expect(mockGetAsyncResults).toHaveBeenCalledWith(mockJobId);
    });

    it('should return 400 for empty jobId', async () => {
      const response = await request(app)
        .get('/api/ocr/jobs/%20/results'); // URL encoded space

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        error: 'Missing required parameter: jobId',
        code: 'MISSING_JOB_ID',
      });
    });
  });

  describe('GET /api/ocr/jobs/:jobId/status', () => {
    it('should check job status', async () => {
      const mockJobId = 'job-123';
      const mockStatus = 'SUCCEEDED';
      const mockCheckJobStatus = vi.mocked(ocrService.checkJobStatus);
      mockCheckJobStatus.mockResolvedValue(mockStatus);

      const response = await request(app)
        .get(`/api/ocr/jobs/${mockJobId}/status`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        data: {
          jobId: mockJobId,
          status: mockStatus,
        },
      });

      expect(mockCheckJobStatus).toHaveBeenCalledWith(mockJobId);
    });
  });

  describe('POST /api/ocr/process/retry', () => {
    it('should process with retry logic (sync)', async () => {
      const mockProcessWithRetry = vi.mocked(ocrService.processWithRetry);
      mockProcessWithRetry.mockResolvedValue(mockOCRResponse);

      const response = await request(app)
        .post('/api/ocr/process/retry')
        .send({
          imageUrl: 's3://test-bucket/test-image.jpg',
          maxRetries: 5,
          useAsync: false,
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        data: mockOCRResponse,
      });

      expect(mockProcessWithRetry).toHaveBeenCalledWith(
        {
          imageUrl: 's3://test-bucket/test-image.jpg',
          processingOptions: {
            detectHandwriting: true,
            detectTables: false,
            detectForms: false,
          },
        },
        5,
        false
      );
    });

    it('should process with retry logic (async)', async () => {
      const mockJobId = 'job-123';
      const mockProcessWithRetry = vi.mocked(ocrService.processWithRetry);
      mockProcessWithRetry.mockResolvedValue(mockJobId);

      const response = await request(app)
        .post('/api/ocr/process/retry')
        .send({
          imageUrl: 's3://test-bucket/test-image.jpg',
          maxRetries: 3,
          useAsync: true,
        });

      expect(response.status).toBe(202);
      expect(response.body).toMatchObject({
        success: true,
        data: {
          jobId: mockJobId,
          status: 'processing',
          message: 'OCR processing started successfully with retry logic',
        },
      });

      expect(mockProcessWithRetry).toHaveBeenCalledWith(
        {
          imageUrl: 's3://test-bucket/test-image.jpg',
          processingOptions: {
            detectHandwriting: true,
            detectTables: false,
            detectForms: false,
          },
        },
        3,
        true
      );
    });

    it('should use default values for optional parameters', async () => {
      const mockProcessWithRetry = vi.mocked(ocrService.processWithRetry);
      mockProcessWithRetry.mockResolvedValue(mockOCRResponse);

      const response = await request(app)
        .post('/api/ocr/process/retry')
        .send({
          imageUrl: 's3://test-bucket/test-image.jpg',
        });

      expect(response.status).toBe(200);
      expect(mockProcessWithRetry).toHaveBeenCalledWith(
        expect.any(Object),
        3, // default maxRetries
        false // default useAsync
      );
    });
  });

  describe('Authentication', () => {
    it('should require authentication for all endpoints', async () => {
      // Mock auth middleware to reject requests
      vi.mocked(authMiddleware.authenticate).mockImplementation((req, res, next) => {
        res.status(401).json({ error: 'Unauthorized' });
      });

      const endpoints = [
        { method: 'post', path: '/api/ocr/process/sync' },
        { method: 'post', path: '/api/ocr/process/async' },
        { method: 'get', path: '/api/ocr/jobs/test-job/results' },
        { method: 'get', path: '/api/ocr/jobs/test-job/status' },
        { method: 'post', path: '/api/ocr/process/retry' },
      ];

      for (const endpoint of endpoints) {
        const response = await request(app)[endpoint.method](endpoint.path)
          .send({ imageUrl: 's3://test-bucket/test-image.jpg' });

        expect(response.status).toBe(401);
        expect(response.body).toMatchObject({
          error: 'Unauthorized',
        });
      }
    });
  });
});