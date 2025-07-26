import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OCRService, OCRError } from '../services/ocr.js';
import { OCRRequest } from '../../../shared/src/types/processing.js';

// Mock AWS SDK v3
vi.mock('@aws-sdk/client-textract');
vi.mock('@aws-sdk/client-s3');

describe('OCRService', () => {
  let ocrService: OCRService;
  let mockTextractSend: any;
  let mockS3Send: any;

  const mockOCRRequest: OCRRequest = {
    imageUrl: 's3://test-bucket/test-image.jpg',
    processingOptions: {
      detectHandwriting: true,
      detectTables: false,
      detectForms: false,
    },
  };

  const mockTextractResponse = {
    Blocks: [
      {
        Id: 'block-1',
        BlockType: 'LINE',
        Text: 'Hello World',
        Confidence: 95.5,
        Geometry: {
          BoundingBox: {
            Left: 0.1,
            Top: 0.2,
            Width: 0.3,
            Height: 0.05,
          },
        },
      },
      {
        Id: 'block-2',
        BlockType: 'WORD',
        Text: 'Hello',
        Confidence: 96.0,
        Geometry: {
          BoundingBox: {
            Left: 0.1,
            Top: 0.2,
            Width: 0.15,
            Height: 0.05,
          },
        },
      },
      {
        Id: 'block-3',
        BlockType: 'WORD',
        Text: 'World',
        Confidence: 95.0,
        Geometry: {
          BoundingBox: {
            Left: 0.25,
            Top: 0.2,
            Width: 0.15,
            Height: 0.05,
          },
        },
      },
    ],
  };

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    // Mock Textract client
    mockTextractSend = vi.fn();
    const { TextractClient } = await import('@aws-sdk/client-textract');
    vi.mocked(TextractClient).mockImplementation(() => ({
      send: mockTextractSend,
    }) as any);

    // Mock S3 client
    mockS3Send = vi.fn();
    const { S3Client } = await import('@aws-sdk/client-s3');
    vi.mocked(S3Client).mockImplementation(() => ({
      send: mockS3Send,
    }) as any);

    ocrService = new OCRService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('processImageSync', () => {
    it('should successfully process image synchronously', async () => {
      // Mock S3 response with stream
      const mockStream = {
        transformToWebStream: () => ({
          getReader: () => ({
            read: vi.fn()
              .mockResolvedValueOnce({ done: false, value: new Uint8Array([1, 2, 3]) })
              .mockResolvedValueOnce({ done: false, value: new Uint8Array([4, 5, 6]) })
              .mockResolvedValueOnce({ done: true }),
            releaseLock: vi.fn(),
          }),
        }),
      };

      mockS3Send.mockResolvedValue({
        Body: mockStream,
      });

      // Mock Textract response
      mockTextractSend.mockResolvedValue(mockTextractResponse);

      const result = await ocrService.processImageSync(mockOCRRequest);

      expect(result).toMatchObject({
        extractedText: expect.arrayContaining([
          expect.objectContaining({
            text: 'Hello World',
            confidence: 95.5,
            type: 'LINE',
          }),
          expect.objectContaining({
            text: 'Hello',
            confidence: 96.0,
            type: 'WORD',
          }),
          expect.objectContaining({
            text: 'World',
            confidence: 95.0,
            type: 'WORD',
          }),
        ]),
        boundingBoxes: expect.arrayContaining([
          expect.objectContaining({
            left: 0.1,
            top: 0.2,
            width: 0.3,
            height: 0.05,
          }),
        ]),
        confidence: expect.any(Number),
        processingTime: expect.any(Number),
      });

      expect(result.confidence).toBeCloseTo(95.5, 1);
      expect(mockS3Send).toHaveBeenCalled();
      expect(mockTextractSend).toHaveBeenCalled();
    });

    it('should handle S3 errors', async () => {
      mockS3Send.mockRejectedValue(new Error('S3 access denied'));

      await expect(ocrService.processImageSync(mockOCRRequest))
        .rejects.toThrow(OCRError);
    });

    it('should handle Textract errors', async () => {
      const mockStream = {
        transformToWebStream: () => ({
          getReader: () => ({
            read: vi.fn().mockResolvedValueOnce({ done: true }),
            releaseLock: vi.fn(),
          }),
        }),
      };

      mockS3Send.mockResolvedValue({
        Body: mockStream,
      });

      mockTextractSend.mockRejectedValue(new Error('Textract service error'));

      await expect(ocrService.processImageSync(mockOCRRequest))
        .rejects.toThrow(OCRError);
    });

    it('should handle empty Textract response', async () => {
      const mockStream = {
        transformToWebStream: () => ({
          getReader: () => ({
            read: vi.fn().mockResolvedValueOnce({ done: true }),
            releaseLock: vi.fn(),
          }),
        }),
      };

      mockS3Send.mockResolvedValue({
        Body: mockStream,
      });

      mockTextractSend.mockResolvedValue({ Blocks: [] });

      const result = await ocrService.processImageSync(mockOCRRequest);

      expect(result.extractedText).toEqual([]);
      expect(result.boundingBoxes).toEqual([]);
      expect(result.confidence).toBe(0);
    });
  });

  describe('processImageAsync', () => {
    it('should successfully start async processing', async () => {
      const mockJobId = 'job-123';
      
      mockTextractSend.mockResolvedValue({ JobId: mockJobId });

      const result = await ocrService.processImageAsync(mockOCRRequest);

      expect(result).toBe(mockJobId);
      expect(mockTextractSend).toHaveBeenCalled();
    });

    it('should handle missing JobId in response', async () => {
      mockTextractSend.mockResolvedValue({});

      await expect(ocrService.processImageAsync(mockOCRRequest))
        .rejects.toThrow(OCRError);
    });
  });

  describe('getAsyncResults', () => {
    it('should successfully get async results', async () => {
      const mockJobId = 'job-123';
      
      mockTextractSend.mockResolvedValue({
        JobStatus: 'SUCCEEDED',
        ...mockTextractResponse,
      });

      const result = await ocrService.getAsyncResults(mockJobId);

      expect(result).toMatchObject({
        extractedText: expect.any(Array),
        boundingBoxes: expect.any(Array),
        confidence: expect.any(Number),
        processingTime: expect.any(Number),
      });

      expect(mockTextractSend).toHaveBeenCalled();
    });

    it('should handle failed job status', async () => {
      const mockJobId = 'job-123';
      
      mockTextractSend.mockResolvedValue({
        JobStatus: 'FAILED',
      });

      await expect(ocrService.getAsyncResults(mockJobId))
        .rejects.toThrow(OCRError);
    });
  });

  describe('checkJobStatus', () => {
    it('should return job status', async () => {
      const mockJobId = 'job-123';
      
      mockTextractSend.mockResolvedValue({
        JobStatus: 'IN_PROGRESS',
      });

      const status = await ocrService.checkJobStatus(mockJobId);

      expect(status).toBe('IN_PROGRESS');
    });

    it('should handle missing job status', async () => {
      const mockJobId = 'job-123';
      
      mockTextractSend.mockResolvedValue({});

      const status = await ocrService.checkJobStatus(mockJobId);

      expect(status).toBe('UNKNOWN');
    });
  });

  describe('processWithRetry', () => {
    it('should succeed on first attempt', async () => {
      const mockStream = {
        transformToWebStream: () => ({
          getReader: () => ({
            read: vi.fn().mockResolvedValueOnce({ done: true }),
            releaseLock: vi.fn(),
          }),
        }),
      };

      mockS3Send.mockResolvedValue({
        Body: mockStream,
      });

      mockTextractSend.mockResolvedValue(mockTextractResponse);

      const result = await ocrService.processWithRetry(mockOCRRequest, 3, false);

      expect(result).toMatchObject({
        extractedText: expect.any(Array),
        confidence: expect.any(Number),
      });
      expect(mockTextractSend).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable errors', async () => {
      // Mock the sleep function to avoid actual delays
      const sleepSpy = vi.spyOn(ocrService as any, 'sleep').mockResolvedValue(undefined);

      const mockStream = {
        transformToWebStream: () => ({
          getReader: () => ({
            read: vi.fn().mockResolvedValueOnce({ done: true }),
            releaseLock: vi.fn(),
          }),
        }),
      };

      mockS3Send.mockResolvedValue({
        Body: mockStream,
      });

      // First two calls fail, third succeeds
      mockTextractSend
        .mockRejectedValueOnce(new Error('Throttling error'))
        .mockRejectedValueOnce(new Error('Service unavailable'))
        .mockResolvedValueOnce(mockTextractResponse);

      const result = await ocrService.processWithRetry(mockOCRRequest, 3, false);

      expect(result).toMatchObject({
        extractedText: expect.any(Array),
        confidence: expect.any(Number),
      });
      expect(mockTextractSend).toHaveBeenCalledTimes(3);
      expect(sleepSpy).toHaveBeenCalledTimes(2); // Should sleep between retries

      sleepSpy.mockRestore();
    }, 10000);

    it('should not retry on non-retryable errors', async () => {
      mockS3Send.mockRejectedValue(new Error('Access denied'));

      await expect(ocrService.processWithRetry(mockOCRRequest, 3, false))
        .rejects.toThrow(OCRError);

      expect(mockS3Send).toHaveBeenCalledTimes(1);
    });

    it('should fail after max retries', async () => {
      const mockStream = {
        transformToWebStream: () => ({
          getReader: () => ({
            read: vi.fn().mockResolvedValueOnce({ done: true }),
            releaseLock: vi.fn(),
          }),
        }),
      };

      mockS3Send.mockResolvedValue({
        Body: mockStream,
      });

      mockTextractSend.mockRejectedValue(new Error('Persistent error'));

      await expect(ocrService.processWithRetry(mockOCRRequest, 2, false))
        .rejects.toThrow(OCRError);

      expect(mockTextractSend).toHaveBeenCalledTimes(2);
    });
  });

  describe('URL parsing', () => {
    it('should parse s3:// URLs correctly', async () => {
      const request = {
        ...mockOCRRequest,
        imageUrl: 's3://my-bucket/folder/image.jpg',
      };

      const mockStream = {
        transformToWebStream: () => ({
          getReader: () => ({
            read: vi.fn().mockResolvedValueOnce({ done: true }),
            releaseLock: vi.fn(),
          }),
        }),
      };

      mockS3Send.mockResolvedValue({
        Body: mockStream,
      });

      mockTextractSend.mockResolvedValue(mockTextractResponse);

      await ocrService.processImageSync(request);

      expect(mockS3Send).toHaveBeenCalled();
    });

    it('should parse HTTPS S3 URLs correctly', async () => {
      const request = {
        ...mockOCRRequest,
        imageUrl: 'https://my-bucket.s3.us-east-1.amazonaws.com/folder/image.jpg',
      };

      const mockStream = {
        transformToWebStream: () => ({
          getReader: () => ({
            read: vi.fn().mockResolvedValueOnce({ done: true }),
            releaseLock: vi.fn(),
          }),
        }),
      };

      mockS3Send.mockResolvedValue({
        Body: mockStream,
      });

      mockTextractSend.mockResolvedValue(mockTextractResponse);

      await ocrService.processImageSync(request);

      expect(mockS3Send).toHaveBeenCalled();
    });

    it('should handle invalid URLs', async () => {
      const request = {
        ...mockOCRRequest,
        imageUrl: 'invalid-url',
      };

      await expect(ocrService.processImageSync(request))
        .rejects.toThrow(OCRError);
    });
  });

  describe('OCRError', () => {
    it('should create retryable error by default', () => {
      const error = new OCRError('Test error');
      
      expect(error.retryable).toBe(true);
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('OCRError');
    });

    it('should identify non-retryable errors', () => {
      const accessDeniedError = new OCRError('Test error', new Error('Access denied'));
      const invalidError = new OCRError('Test error', new Error('Invalid request'));
      
      expect(accessDeniedError.retryable).toBe(false);
      expect(invalidError.retryable).toBe(false);
    });

    it('should identify retryable errors', () => {
      const throttlingError = new OCRError('Test error', new Error('Throttling'));
      const serviceError = new OCRError('Test error', new Error('Service unavailable'));
      
      expect(throttlingError.retryable).toBe(true);
      expect(serviceError.retryable).toBe(true);
    });
  });

  describe('processBatch', () => {
    it('should process multiple images successfully', async () => {
      const mockStream = {
        transformToWebStream: () => ({
          getReader: () => ({
            read: vi.fn().mockResolvedValueOnce({ done: true }),
            releaseLock: vi.fn(),
          }),
        }),
      };

      mockS3Send.mockResolvedValue({
        Body: mockStream,
      });

      mockTextractSend.mockResolvedValue(mockTextractResponse);

      const requests = [
        { ...mockOCRRequest, imageUrl: 's3://bucket/image1.jpg' },
        { ...mockOCRRequest, imageUrl: 's3://bucket/image2.jpg' },
      ];

      const results = await ocrService.processBatch(requests);

      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({
        extractedText: expect.any(Array),
        confidence: expect.any(Number),
      });
      expect(results[1]).toMatchObject({
        extractedText: expect.any(Array),
        confidence: expect.any(Number),
      });
    });

    it('should handle batch processing with some failures', async () => {
      // Mock the sleep function to avoid actual delays
      const sleepSpy = vi.spyOn(ocrService as any, 'sleep').mockResolvedValue(undefined);

      const mockStream = {
        transformToWebStream: () => ({
          getReader: () => ({
            read: vi.fn().mockResolvedValueOnce({ done: true }),
            releaseLock: vi.fn(),
          }),
        }),
      };

      mockS3Send
        .mockResolvedValueOnce({ Body: mockStream })
        .mockRejectedValue(new Error('Access denied')); // Non-retryable error

      mockTextractSend.mockResolvedValue(mockTextractResponse);

      const requests = [
        { ...mockOCRRequest, imageUrl: 's3://bucket/image1.jpg' },
        { ...mockOCRRequest, imageUrl: 's3://bucket/image2.jpg' },
      ];

      await expect(ocrService.processBatch(requests))
        .rejects.toThrow(OCRError);

      sleepSpy.mockRestore();
    }, 10000);

    it('should handle empty batch', async () => {
      const results = await ocrService.processBatch([]);
      expect(results).toEqual([]);
    });
  });
});