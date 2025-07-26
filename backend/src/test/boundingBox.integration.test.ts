import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import boundingBoxRoutes from '../routes/boundingBox';
import { ocrService } from '../services/ocr';
import { OCRResponse, TextBlock } from '../types/ocr';

// Mock the OCR service
vi.mock('../services/ocr', () => ({
  ocrService: {
    getOCRResults: vi.fn(),
  },
}));

// Mock the BoundingBoxRepository
vi.mock('../models/BoundingBoxRepository', () => ({
  boundingBoxRepository: {
    saveBoundingBoxGroups: vi.fn().mockResolvedValue([]),
    saveBoundingBoxGroup: vi.fn().mockResolvedValue({
      id: 'mock-group-id',
      imageId: 'test-image',
      boundingBox: { left: 10, top: 10, width: 100, height: 50 },
      textBlockIds: [],
      confidence: 1.0,
      type: 'manual',
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    getBoundingBoxGroups: vi.fn().mockResolvedValue([]),
    deleteBoundingBoxGroup: vi.fn().mockResolvedValue(true),
  },
}));

// Mock auth middleware
vi.mock('../middleware/auth', () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    req.user = { id: 'test-user', email: 'test@example.com' };
    next();
  },
}));

describe('BoundingBox Integration Tests', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/bounding-box', boundingBoxRoutes);
    
    // Reset mocks
    vi.clearAllMocks();
  });

  // Helper function to create mock OCR response
  const createMockOCRResponse = (textBlocks: TextBlock[]): OCRResponse => ({
    extractedText: textBlocks,
    boundingBoxes: textBlocks.map(block => block.boundingBox),
    confidence: 0.85,
    processingTime: 1000,
  });

  // Helper function to create mock text block
  const createMockTextBlock = (
    id: string,
    text: string,
    left: number,
    top: number,
    width: number,
    height: number
  ): TextBlock => ({
    id,
    text,
    confidence: 0.9,
    boundingBox: { left, top, width, height },
    type: 'LINE',
  });

  describe('POST /api/bounding-box/detect', () => {
    it('should detect bounding boxes successfully', async () => {
      const mockTextBlocks = [
        createMockTextBlock('1', 'Hello', 10, 10, 50, 20),
        createMockTextBlock('2', 'World', 10, 35, 50, 20),
      ];

      const mockOCRResponse = createMockOCRResponse(mockTextBlocks);
      (ocrService.getOCRResults as any).mockResolvedValue(mockOCRResponse);

      const response = await request(app)
        .post('/api/bounding-box/detect')
        .send({
          imageId: 'test-image-123',
          detectionOptions: {
            minGroupSize: 1,
            proximityThreshold: 50,
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('groups');
      expect(response.body.data).toHaveProperty('ungroupedBlocks');
      expect(response.body.data).toHaveProperty('processingTime');
      expect(response.body.data).toHaveProperty('confidence');
      expect(response.body.data.groups).toHaveLength(1);
    });

    it('should return 400 for missing imageId', async () => {
      const response = await request(app)
        .post('/api/bounding-box/detect')
        .send({
          detectionOptions: {},
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Image ID is required');
      expect(response.body.code).toBe('MISSING_IMAGE_ID');
    });

    it('should return 404 for non-existent OCR results', async () => {
      (ocrService.getOCRResults as any).mockResolvedValue(null);

      const response = await request(app)
        .post('/api/bounding-box/detect')
        .send({
          imageId: 'non-existent-image',
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('OCR results not found for image');
      expect(response.body.code).toBe('OCR_RESULTS_NOT_FOUND');
    });

    it('should handle service errors gracefully', async () => {
      (ocrService.getOCRResults as any).mockRejectedValue(new Error('Service unavailable'));

      const response = await request(app)
        .post('/api/bounding-box/detect')
        .send({
          imageId: 'test-image-123',
        });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to detect bounding boxes');
      expect(response.body.code).toBe('DETECTION_FAILED');
    });
  });

  describe('POST /api/bounding-box/manual', () => {
    it('should create manual bounding box successfully', async () => {
      const response = await request(app)
        .post('/api/bounding-box/manual')
        .send({
          imageId: 'test-image-123',
          boundingBox: { left: 10, top: 10, width: 100, height: 50 },
          action: 'create',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.type).toBe('manual');
      expect(response.body.data.confidence).toBe(1.0);
    });

    it('should update manual bounding box successfully', async () => {
      const response = await request(app)
        .post('/api/bounding-box/manual')
        .send({
          imageId: 'test-image-123',
          boundingBox: { left: 20, top: 20, width: 80, height: 40 },
          action: 'update',
          groupId: 'existing-group-123',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('existing-group-123');
      expect(response.body.data.type).toBe('manual');
    });

    it('should delete manual bounding box successfully', async () => {
      const response = await request(app)
        .post('/api/bounding-box/manual')
        .send({
          imageId: 'test-image-123',
          boundingBox: { left: 10, top: 10, width: 100, height: 50 },
          action: 'delete',
          groupId: 'group-to-delete',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Group deleted successfully');
    });

    it('should return 400 for missing required fields', async () => {
      const response = await request(app)
        .post('/api/bounding-box/manual')
        .send({
          imageId: 'test-image-123',
          // Missing boundingBox and action
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Image ID, bounding box, and action are required');
      expect(response.body.code).toBe('MISSING_REQUIRED_FIELDS');
    });

    it('should return 400 for invalid action', async () => {
      const response = await request(app)
        .post('/api/bounding-box/manual')
        .send({
          imageId: 'test-image-123',
          boundingBox: { left: 10, top: 10, width: 100, height: 50 },
          action: 'invalid-action',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Action must be create, update, or delete');
      expect(response.body.code).toBe('INVALID_ACTION');
    });

    it('should return 400 for missing groupId on update', async () => {
      const response = await request(app)
        .post('/api/bounding-box/manual')
        .send({
          imageId: 'test-image-123',
          boundingBox: { left: 10, top: 10, width: 100, height: 50 },
          action: 'update',
          // Missing groupId
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Group ID is required for update and delete actions');
      expect(response.body.code).toBe('MISSING_GROUP_ID');
    });
  });

  describe('POST /api/bounding-box/update-groupings', () => {
    it('should update text groupings successfully', async () => {
      const mockTextBlocks = [
        createMockTextBlock('1', 'Inside', 15, 15, 30, 20),
        createMockTextBlock('2', 'Outside', 100, 100, 30, 20),
      ];

      const mockOCRResponse = createMockOCRResponse(mockTextBlocks);
      (ocrService.getOCRResults as any).mockResolvedValue(mockOCRResponse);

      const response = await request(app)
        .post('/api/bounding-box/update-groupings')
        .send({
          groupId: 'test-group-123',
          boundingBox: { left: 10, top: 10, width: 50, height: 50 },
          imageId: 'test-image-123',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('groupId');
      expect(response.body.data).toHaveProperty('boundingBox');
      expect(response.body.data).toHaveProperty('textBlocks');
      expect(response.body.data.textBlocks).toHaveLength(1); // Only 'Inside' block should be included
    });

    it('should return 400 for missing required fields', async () => {
      const response = await request(app)
        .post('/api/bounding-box/update-groupings')
        .send({
          groupId: 'test-group-123',
          // Missing boundingBox and imageId
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Group ID, bounding box, and image ID are required');
      expect(response.body.code).toBe('MISSING_REQUIRED_FIELDS');
    });

    it('should return 404 for non-existent OCR results', async () => {
      (ocrService.getOCRResults as any).mockResolvedValue(null);

      const response = await request(app)
        .post('/api/bounding-box/update-groupings')
        .send({
          groupId: 'test-group-123',
          boundingBox: { left: 10, top: 10, width: 50, height: 50 },
          imageId: 'non-existent-image',
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('OCR results not found for image');
      expect(response.body.code).toBe('OCR_RESULTS_NOT_FOUND');
    });
  });

  describe('GET /api/bounding-box/:imageId', () => {
    it('should get bounding box groups successfully', async () => {
      const response = await request(app)
        .get('/api/bounding-box/test-image-123');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('imageId');
      expect(response.body.data).toHaveProperty('groups');
      expect(response.body.data).toHaveProperty('lastUpdated');
      expect(response.body.data.imageId).toBe('test-image-123');
    });

    it('should return 400 for missing imageId', async () => {
      const response = await request(app)
        .get('/api/bounding-box/');

      expect(response.status).toBe(404); // Express returns 404 for missing route params
    });
  });

  describe('POST /api/bounding-box/separate', () => {
    it('should separate overlapping notes successfully', async () => {
      const mockTextBlocks = [
        createMockTextBlock('1', 'Note1', 10, 10, 50, 20),
        createMockTextBlock('2', 'Note2', 10, 40, 50, 20),
        createMockTextBlock('3', 'Note3', 10, 100, 50, 20),
      ];

      const mockOCRResponse = createMockOCRResponse(mockTextBlocks);
      (ocrService.getOCRResults as any).mockResolvedValue(mockOCRResponse);

      const overlappingGroups = [
        {
          id: 'overlapping-group-1',
          textBlocks: mockTextBlocks,
          boundingBox: { left: 10, top: 10, width: 50, height: 110 },
        },
      ];

      const response = await request(app)
        .post('/api/bounding-box/separate')
        .send({
          imageId: 'test-image-123',
          overlappingGroups,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('originalGroups');
      expect(response.body.data).toHaveProperty('separatedGroups');
      expect(response.body.data).toHaveProperty('groups');
      expect(response.body.data.originalGroups).toBe(1);
      expect(response.body.data.separatedGroups).toBeGreaterThanOrEqual(1);
    });

    it('should return 400 for missing required fields', async () => {
      const response = await request(app)
        .post('/api/bounding-box/separate')
        .send({
          imageId: 'test-image-123',
          // Missing overlappingGroups
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Image ID and overlapping groups array are required');
      expect(response.body.code).toBe('MISSING_REQUIRED_FIELDS');
    });

    it('should return 400 for invalid overlappingGroups format', async () => {
      const response = await request(app)
        .post('/api/bounding-box/separate')
        .send({
          imageId: 'test-image-123',
          overlappingGroups: 'not-an-array',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Image ID and overlapping groups array are required');
      expect(response.body.code).toBe('MISSING_REQUIRED_FIELDS');
    });

    it('should return 404 for non-existent OCR results', async () => {
      (ocrService.getOCRResults as any).mockResolvedValue(null);

      const response = await request(app)
        .post('/api/bounding-box/separate')
        .send({
          imageId: 'non-existent-image',
          overlappingGroups: [],
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('OCR results not found for image');
      expect(response.body.code).toBe('OCR_RESULTS_NOT_FOUND');
    });
  });

  describe('Error handling', () => {
    it('should handle service errors in detection', async () => {
      (ocrService.getOCRResults as any).mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .post('/api/bounding-box/detect')
        .send({
          imageId: 'test-image-123',
        });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to detect bounding boxes');
      expect(response.body.code).toBe('DETECTION_FAILED');
      expect(response.body.details).toBe('Database connection failed');
    });

    it('should handle service errors in text grouping update', async () => {
      (ocrService.getOCRResults as any).mockRejectedValue(new Error('Service timeout'));

      const response = await request(app)
        .post('/api/bounding-box/update-groupings')
        .send({
          groupId: 'test-group-123',
          boundingBox: { left: 10, top: 10, width: 50, height: 50 },
          imageId: 'test-image-123',
        });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to update text groupings');
      expect(response.body.code).toBe('TEXT_GROUPING_UPDATE_FAILED');
      expect(response.body.details).toBe('Service timeout');
    });

    it('should handle service errors in note separation', async () => {
      (ocrService.getOCRResults as any).mockRejectedValue(new Error('Processing failed'));

      const response = await request(app)
        .post('/api/bounding-box/separate')
        .send({
          imageId: 'test-image-123',
          overlappingGroups: [],
        });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to separate overlapping notes');
      expect(response.body.code).toBe('NOTE_SEPARATION_FAILED');
      expect(response.body.details).toBe('Processing failed');
    });
  });
});