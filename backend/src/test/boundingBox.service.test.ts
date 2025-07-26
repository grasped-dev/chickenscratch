import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BoundingBoxService, BoundingBoxDetectionRequest } from '../services/boundingBox';
import { TextBlock, OCRResponse, BoundingBox } from '../types/ocr';

// Mock the BoundingBoxRepository
vi.mock('../models/BoundingBoxRepository', () => ({
  boundingBoxRepository: {
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
    deleteBoundingBoxGroup: vi.fn().mockResolvedValue(true),
  },
}));

// Mock the OCR service
vi.mock('../services/ocr', () => ({
  ocrService: {
    getOCRResults: vi.fn().mockResolvedValue({
      extractedText: [],
      boundingBoxes: [],
      confidence: 0.9,
      processingTime: 1000,
    }),
  },
}));

describe('BoundingBoxService', () => {
  let service: BoundingBoxService;
  
  beforeEach(() => {
    service = new BoundingBoxService();
  });

  // Helper function to create mock text blocks
  const createMockTextBlock = (
    id: string,
    text: string,
    left: number,
    top: number,
    width: number,
    height: number,
    confidence: number = 0.9
  ): TextBlock => ({
    id,
    text,
    confidence,
    boundingBox: { left, top, width, height },
    type: 'LINE',
  });

  // Helper function to create mock OCR response
  const createMockOCRResponse = (textBlocks: TextBlock[]): OCRResponse => ({
    extractedText: textBlocks,
    boundingBoxes: textBlocks.map(block => block.boundingBox),
    confidence: 0.85,
    processingTime: 1000,
  });

  describe('detectBoundingBoxGroups', () => {
    it('should group nearby text blocks together', async () => {
      const textBlocks = [
        createMockTextBlock('1', 'Hello', 10, 10, 50, 20),
        createMockTextBlock('2', 'World', 10, 35, 50, 20), // Close to first block
        createMockTextBlock('3', 'Separate', 200, 10, 60, 20), // Far from others
      ];

      const request: BoundingBoxDetectionRequest = {
        ocrResults: createMockOCRResponse(textBlocks),
        detectionOptions: {
          minGroupSize: 1,
          overlapThreshold: 0.1,
          proximityThreshold: 50,
          useHierarchicalGrouping: false,
        },
      };

      const result = await service.detectBoundingBoxGroups(request);

      expect(result.groups).toHaveLength(2);
      expect(result.groups[0].textBlocks).toHaveLength(2); // Hello and World grouped
      expect(result.groups[1].textBlocks).toHaveLength(1); // Separate alone
      expect(result.ungroupedBlocks).toHaveLength(0);
    });

    it('should handle overlapping text blocks', async () => {
      const textBlocks = [
        createMockTextBlock('1', 'Overlap1', 10, 10, 50, 20),
        createMockTextBlock('2', 'Overlap2', 15, 15, 50, 20), // Overlapping
      ];

      const request: BoundingBoxDetectionRequest = {
        ocrResults: createMockOCRResponse(textBlocks),
        detectionOptions: {
          minGroupSize: 1,
          overlapThreshold: 0.1,
          proximityThreshold: 100,
          useHierarchicalGrouping: false,
        },
      };

      const result = await service.detectBoundingBoxGroups(request);

      expect(result.groups).toHaveLength(1);
      expect(result.groups[0].textBlocks).toHaveLength(2);
    });

    it('should respect minimum group size', async () => {
      const textBlocks = [
        createMockTextBlock('1', 'Single', 10, 10, 50, 20),
        createMockTextBlock('2', 'Group1', 100, 10, 50, 20),
        createMockTextBlock('3', 'Group2', 100, 35, 50, 20),
      ];

      const request: BoundingBoxDetectionRequest = {
        ocrResults: createMockOCRResponse(textBlocks),
        detectionOptions: {
          minGroupSize: 2,
          overlapThreshold: 0.1,
          proximityThreshold: 50,
          useHierarchicalGrouping: false,
        },
      };

      const result = await service.detectBoundingBoxGroups(request);

      expect(result.groups).toHaveLength(1); // Only the group with 2 blocks
      expect(result.groups[0].textBlocks).toHaveLength(2);
      expect(result.ungroupedBlocks).toHaveLength(1); // Single block ungrouped
    });

    it('should calculate correct bounding box for groups', async () => {
      const textBlocks = [
        createMockTextBlock('1', 'Top', 10, 10, 30, 20),
        createMockTextBlock('2', 'Bottom', 20, 40, 40, 20),
      ];

      const request: BoundingBoxDetectionRequest = {
        ocrResults: createMockOCRResponse(textBlocks),
        detectionOptions: {
          minGroupSize: 1,
          overlapThreshold: 0.1,
          proximityThreshold: 50,
          useHierarchicalGrouping: false,
        },
      };

      const result = await service.detectBoundingBoxGroups(request);

      expect(result.groups).toHaveLength(1);
      const groupBox = result.groups[0].boundingBox;
      
      expect(groupBox.left).toBe(10); // Leftmost
      expect(groupBox.top).toBe(10); // Topmost
      expect(groupBox.width).toBe(50); // 60 (rightmost) - 10 (leftmost)
      expect(groupBox.height).toBe(50); // 60 (bottommost) - 10 (topmost)
    });

    it('should handle empty text blocks', async () => {
      const request: BoundingBoxDetectionRequest = {
        ocrResults: createMockOCRResponse([]),
        detectionOptions: {
          minGroupSize: 1,
          overlapThreshold: 0.1,
          proximityThreshold: 50,
          useHierarchicalGrouping: false,
        },
      };

      const result = await service.detectBoundingBoxGroups(request);

      expect(result.groups).toHaveLength(0);
      expect(result.ungroupedBlocks).toHaveLength(0);
      expect(result.confidence).toBe(0);
    });

    it('should calculate confidence scores correctly', async () => {
      const textBlocks = [
        createMockTextBlock('1', 'High', 10, 10, 50, 20, 0.95),
        createMockTextBlock('2', 'Low', 10, 35, 50, 20, 0.75),
      ];

      const request: BoundingBoxDetectionRequest = {
        ocrResults: createMockOCRResponse(textBlocks),
        detectionOptions: {
          minGroupSize: 1,
          overlapThreshold: 0.1,
          proximityThreshold: 50,
          useHierarchicalGrouping: false,
        },
      };

      const result = await service.detectBoundingBoxGroups(request);

      expect(result.groups).toHaveLength(1);
      expect(result.groups[0].confidence).toBe(0.85); // Average of 0.95 and 0.75
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should handle proximity threshold correctly', async () => {
      const textBlocks = [
        createMockTextBlock('1', 'Close1', 10, 10, 50, 20),
        createMockTextBlock('2', 'Close2', 10, 35, 50, 20), // 25 pixels apart
        createMockTextBlock('3', 'Far', 10, 100, 50, 20), // 65 pixels apart
      ];

      const request: BoundingBoxDetectionRequest = {
        ocrResults: createMockOCRResponse(textBlocks),
        detectionOptions: {
          minGroupSize: 1,
          overlapThreshold: 0.1,
          proximityThreshold: 30, // Only first two should group
          useHierarchicalGrouping: false,
        },
      };

      const result = await service.detectBoundingBoxGroups(request);

      expect(result.groups).toHaveLength(2);
      expect(result.groups[0].textBlocks).toHaveLength(2); // Close1 and Close2
      expect(result.groups[1].textBlocks).toHaveLength(1); // Far
    });
  });

  describe('handleManualBoundingBox', () => {
    it('should create new manual bounding box group', async () => {
      const boundingBox: BoundingBox = { left: 10, top: 10, width: 100, height: 50 };
      
      const result = await service.handleManualBoundingBox({
        imageId: 'test-image',
        boundingBox,
        action: 'create',
      });

      expect(result.type).toBe('manual');
      expect(result.confidence).toBe(1.0);
      expect(result.boundingBox).toEqual(boundingBox);
      expect(result.id).toMatch(/^manual-/);
    });

    it('should update existing bounding box group', async () => {
      const boundingBox: BoundingBox = { left: 20, top: 20, width: 80, height: 40 };
      
      const result = await service.handleManualBoundingBox({
        imageId: 'test-image',
        boundingBox,
        action: 'update',
        groupId: 'existing-group',
      });

      expect(result.type).toBe('manual');
      expect(result.confidence).toBe(1.0);
      expect(result.boundingBox).toEqual(boundingBox);
      expect(result.id).toBe('existing-group');
    });

    it('should throw error for delete action', async () => {
      await expect(
        service.handleManualBoundingBox({
          imageId: 'test-image',
          boundingBox: { left: 0, top: 0, width: 10, height: 10 },
          action: 'delete',
          groupId: 'group-to-delete',
        })
      ).rejects.toThrow('Group deleted');
    });

    it('should require groupId for update action', async () => {
      await expect(
        service.handleManualBoundingBox({
          imageId: 'test-image',
          boundingBox: { left: 0, top: 0, width: 10, height: 10 },
          action: 'update',
        })
      ).rejects.toThrow('Group ID required for update action');
    });

    it('should require groupId for delete action', async () => {
      await expect(
        service.handleManualBoundingBox({
          imageId: 'test-image',
          boundingBox: { left: 0, top: 0, width: 10, height: 10 },
          action: 'delete',
        })
      ).rejects.toThrow('Group ID required for delete action');
    });
  });

  describe('updateTextGroupings', () => {
    it('should find text blocks within bounding box', async () => {
      const textBlocks = [
        createMockTextBlock('1', 'Inside', 15, 15, 30, 20), // Center at (30, 25)
        createMockTextBlock('2', 'Outside', 100, 100, 30, 20), // Center at (115, 110)
      ];

      const boundingBox: BoundingBox = { left: 10, top: 10, width: 50, height: 50 };

      const result = await service.updateTextGroupings('test-group', boundingBox, textBlocks);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
      expect(result[0].text).toBe('Inside');
    });

    it('should handle empty text blocks array', async () => {
      const boundingBox: BoundingBox = { left: 10, top: 10, width: 50, height: 50 };

      const result = await service.updateTextGroupings('test-group', boundingBox, []);

      expect(result).toHaveLength(0);
    });

    it('should handle bounding box with no contained blocks', async () => {
      const textBlocks = [
        createMockTextBlock('1', 'Outside1', 100, 100, 30, 20),
        createMockTextBlock('2', 'Outside2', 200, 200, 30, 20),
      ];

      const boundingBox: BoundingBox = { left: 10, top: 10, width: 50, height: 50 };

      const result = await service.updateTextGroupings('test-group', boundingBox, textBlocks);

      expect(result).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('should handle single text block', async () => {
      const textBlocks = [
        createMockTextBlock('1', 'Single', 10, 10, 50, 20),
      ];

      const request: BoundingBoxDetectionRequest = {
        ocrResults: createMockOCRResponse(textBlocks),
        detectionOptions: {
          minGroupSize: 1,
          overlapThreshold: 0.1,
          proximityThreshold: 50,
          useHierarchicalGrouping: false,
        },
      };

      const result = await service.detectBoundingBoxGroups(request);

      expect(result.groups).toHaveLength(1);
      expect(result.groups[0].textBlocks).toHaveLength(1);
      expect(result.groups[0].boundingBox).toEqual(textBlocks[0].boundingBox);
    });

    it('should handle text blocks with zero dimensions', async () => {
      const textBlocks = [
        createMockTextBlock('1', 'Zero', 10, 10, 0, 0),
        createMockTextBlock('2', 'Normal', 20, 20, 50, 20),
      ];

      const request: BoundingBoxDetectionRequest = {
        ocrResults: createMockOCRResponse(textBlocks),
        detectionOptions: {
          minGroupSize: 1,
          overlapThreshold: 0.1,
          proximityThreshold: 50,
          useHierarchicalGrouping: false,
        },
      };

      const result = await service.detectBoundingBoxGroups(request);

      expect(result.groups.length).toBeGreaterThanOrEqual(1);
      expect(result.processingTime).toBeGreaterThanOrEqual(0);
    });

    it('should handle very large proximity threshold', async () => {
      const textBlocks = [
        createMockTextBlock('1', 'Far1', 0, 0, 10, 10),
        createMockTextBlock('2', 'Far2', 1000, 1000, 10, 10),
      ];

      const request: BoundingBoxDetectionRequest = {
        ocrResults: createMockOCRResponse(textBlocks),
        detectionOptions: {
          minGroupSize: 1,
          overlapThreshold: 0.1,
          proximityThreshold: 2000, // Very large threshold
          useHierarchicalGrouping: false,
        },
      };

      const result = await service.detectBoundingBoxGroups(request);

      expect(result.groups).toHaveLength(1); // Should group everything
      expect(result.groups[0].textBlocks).toHaveLength(2);
    });

    it('should handle identical bounding boxes', async () => {
      const textBlocks = [
        createMockTextBlock('1', 'Same1', 10, 10, 50, 20),
        createMockTextBlock('2', 'Same2', 10, 10, 50, 20), // Identical position
      ];

      const request: BoundingBoxDetectionRequest = {
        ocrResults: createMockOCRResponse(textBlocks),
        detectionOptions: {
          minGroupSize: 1,
          overlapThreshold: 0.1,
          proximityThreshold: 50,
          useHierarchicalGrouping: false,
        },
      };

      const result = await service.detectBoundingBoxGroups(request);

      expect(result.groups).toHaveLength(1);
      expect(result.groups[0].textBlocks).toHaveLength(2);
    });
  });
});