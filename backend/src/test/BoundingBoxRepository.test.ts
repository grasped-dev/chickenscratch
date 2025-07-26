import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { BoundingBoxRepository } from '../models/BoundingBoxRepository';
import { BoundingBoxGroup } from '../services/boundingBox';
import { TextBlock } from '../types/ocr';

// Mock the pg Pool
vi.mock('pg', () => {
  const mockPool = {
    connect: vi.fn(),
    query: vi.fn(),
  };
  
  return {
    Pool: vi.fn(() => mockPool),
  };
});

// Mock BaseRepository
vi.mock('../models/BaseRepository', () => {
  return {
    BaseRepository: class {
      pool = {
        connect: vi.fn(),
        query: vi.fn(),
      };
    }
  };
});

describe('BoundingBoxRepository', () => {
  let repository: BoundingBoxRepository;
  let mockPool: any;
  let mockClient: any;
  
  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    
    // Create mock client
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    
    // Get the mock pool
    repository = new BoundingBoxRepository();
    mockPool = (repository as any).pool;
    
    // Setup mock client
    mockPool.connect.mockResolvedValue(mockClient);
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });
  
  // Helper function to create mock text blocks
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
  
  // Helper function to create mock bounding box groups
  const createMockBoundingBoxGroup = (
    id: string,
    left: number,
    top: number,
    width: number,
    height: number,
    textBlocks: TextBlock[] = []
  ): BoundingBoxGroup => ({
    id,
    boundingBox: { left, top, width, height },
    textBlocks,
    confidence: 0.9,
    type: 'auto',
  });
  
  describe('saveBoundingBoxGroups', () => {
    it('should save multiple bounding box groups', async () => {
      // Setup mock responses
      mockClient.query.mockImplementation((query: string, params: any[]) => {
        if (query.includes('DELETE')) {
          return { rowCount: 0 };
        } else if (query.includes('INSERT')) {
          return {
            rows: [{
              id: params[0],
              image_id: params[1],
              left_pos: params[2],
              top_pos: params[3],
              width: params[4],
              height: params[5],
              text_block_ids: params[6],
              confidence: params[7],
              type: params[8],
              created_at: new Date(),
              updated_at: new Date(),
            }],
          };
        }
        return { rows: [] };
      });
      
      // Create test data
      const imageId = 'test-image-123';
      const textBlock1 = createMockTextBlock('text-1', 'Hello', 10, 10, 50, 20);
      const textBlock2 = createMockTextBlock('text-2', 'World', 10, 40, 50, 20);
      
      const group1 = createMockBoundingBoxGroup('group-1', 5, 5, 60, 30, [textBlock1]);
      const group2 = createMockBoundingBoxGroup('group-2', 5, 35, 60, 30, [textBlock2]);
      
      // Call the method
      const result = await repository.saveBoundingBoxGroups(imageId, [group1, group2]);
      
      // Verify results
      expect(mockClient.query).toHaveBeenCalledTimes(5); // BEGIN, DELETE, 2x INSERT, COMMIT
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith(
        'DELETE FROM bounding_box_groups WHERE image_id = $1',
        [imageId]
      );
      expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO bounding_box_groups'), [
        'group-1',
        imageId,
        5,
        5,
        60,
        30,
        JSON.stringify(['text-1']),
        0.9,
        'auto',
      ]);
      expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO bounding_box_groups'), [
        'group-2',
        imageId,
        5,
        35,
        60,
        30,
        JSON.stringify(['text-2']),
        0.9,
        'auto',
      ]);
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('group-1');
      expect(result[1].id).toBe('group-2');
    });
    
    it('should handle transaction errors', async () => {
      // Setup mock to throw an error
      mockClient.query.mockImplementation((query: string) => {
        if (query.includes('INSERT')) {
          throw new Error('Database error');
        }
        return { rows: [] };
      });
      
      // Create test data
      const imageId = 'test-image-123';
      const group = createMockBoundingBoxGroup('group-1', 5, 5, 60, 30, []);
      
      // Call the method and expect it to throw
      await expect(repository.saveBoundingBoxGroups(imageId, [group])).rejects.toThrow('Failed to save bounding box groups');
      
      // Verify rollback was called
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });
  
  describe('getBoundingBoxGroups', () => {
    it('should get bounding box groups for an image', async () => {
      // Setup mock response
      mockPool.query.mockResolvedValue({
        rows: [
          {
            id: 'group-1',
            image_id: 'test-image-123',
            left_pos: 5,
            top_pos: 5,
            width: 60,
            height: 30,
            text_block_ids: JSON.stringify(['text-1']),
            confidence: 0.9,
            type: 'auto',
            created_at: new Date(),
            updated_at: new Date(),
          },
          {
            id: 'group-2',
            image_id: 'test-image-123',
            left_pos: 5,
            top_pos: 35,
            width: 60,
            height: 30,
            text_block_ids: JSON.stringify(['text-2']),
            confidence: 0.9,
            type: 'auto',
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      });
      
      // Create test data
      const imageId = 'test-image-123';
      const textBlock1 = createMockTextBlock('text-1', 'Hello', 10, 10, 50, 20);
      const textBlock2 = createMockTextBlock('text-2', 'World', 10, 40, 50, 20);
      
      // Call the method
      const result = await repository.getBoundingBoxGroups(imageId, [textBlock1, textBlock2]);
      
      // Verify results
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        [imageId]
      );
      
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('group-1');
      expect(result[0].textBlocks).toHaveLength(1);
      expect(result[0].textBlocks[0].id).toBe('text-1');
      expect(result[1].id).toBe('group-2');
      expect(result[1].textBlocks).toHaveLength(1);
      expect(result[1].textBlocks[0].id).toBe('text-2');
    });
    
    it('should handle empty results', async () => {
      // Setup mock response
      mockPool.query.mockResolvedValue({ rows: [] });
      
      // Call the method
      const result = await repository.getBoundingBoxGroups('test-image-123');
      
      // Verify results
      expect(result).toHaveLength(0);
    });
    
    it('should handle missing text blocks', async () => {
      // Setup mock response
      mockPool.query.mockResolvedValue({
        rows: [
          {
            id: 'group-1',
            image_id: 'test-image-123',
            left_pos: 5,
            top_pos: 5,
            width: 60,
            height: 30,
            text_block_ids: JSON.stringify(['text-1']),
            confidence: 0.9,
            type: 'auto',
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      });
      
      // Call the method without providing text blocks
      const result = await repository.getBoundingBoxGroups('test-image-123');
      
      // Verify results
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('group-1');
      expect(result[0].textBlocks).toHaveLength(0);
    });
  });
  
  describe('saveBoundingBoxGroup', () => {
    it('should save a single bounding box group', async () => {
      // Setup mock response
      mockPool.query.mockResolvedValue({
        rows: [
          {
            id: 'group-1',
            image_id: 'test-image-123',
            left_pos: 5,
            top_pos: 5,
            width: 60,
            height: 30,
            text_block_ids: JSON.stringify(['text-1']),
            confidence: 0.9,
            type: 'auto',
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      });
      
      // Create test data
      const imageId = 'test-image-123';
      const textBlock = createMockTextBlock('text-1', 'Hello', 10, 10, 50, 20);
      const group = createMockBoundingBoxGroup('group-1', 5, 5, 60, 30, [textBlock]);
      
      // Call the method
      const result = await repository.saveBoundingBoxGroup(imageId, group);
      
      // Verify results
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO bounding_box_groups'),
        [
          'group-1',
          imageId,
          5,
          5,
          60,
          30,
          JSON.stringify(['text-1']),
          0.9,
          'auto',
        ]
      );
      
      expect(result.id).toBe('group-1');
      expect(result.imageId).toBe('test-image-123');
      expect(result.textBlockIds).toEqual(['text-1']);
    });
    
    it('should handle database errors', async () => {
      // Setup mock to throw an error
      mockPool.query.mockRejectedValue(new Error('Database error'));
      
      // Create test data
      const imageId = 'test-image-123';
      const group = createMockBoundingBoxGroup('group-1', 5, 5, 60, 30, []);
      
      // Call the method and expect it to throw
      await expect(repository.saveBoundingBoxGroup(imageId, group)).rejects.toThrow('Failed to save bounding box group');
    });
  });
  
  describe('deleteBoundingBoxGroup', () => {
    it('should delete a bounding box group', async () => {
      // Setup mock response
      mockPool.query.mockResolvedValue({
        rowCount: 1,
        rows: [{ id: 'group-1' }],
      });
      
      // Call the method
      const result = await repository.deleteBoundingBoxGroup('group-1');
      
      // Verify results
      expect(mockPool.query).toHaveBeenCalledWith(
        'DELETE FROM bounding_box_groups WHERE id = $1 RETURNING id',
        ['group-1']
      );
      
      expect(result).toBe(true);
    });
    
    it('should return false if group not found', async () => {
      // Setup mock response
      mockPool.query.mockResolvedValue({
        rowCount: 0,
        rows: [],
      });
      
      // Call the method
      const result = await repository.deleteBoundingBoxGroup('non-existent-group');
      
      // Verify results
      expect(result).toBe(false);
    });
    
    it('should handle database errors', async () => {
      // Setup mock to throw an error
      mockPool.query.mockRejectedValue(new Error('Database error'));
      
      // Call the method and expect it to throw
      await expect(repository.deleteBoundingBoxGroup('group-1')).rejects.toThrow('Failed to delete bounding box group');
    });
  });
  
  describe('createMigration', () => {
    it('should create the bounding box groups table', async () => {
      const mockClient = {
        query: vi.fn(),
      };
      
      await BoundingBoxRepository.createMigration(mockClient);
      
      expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS bounding_box_groups'));
      expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('CREATE INDEX IF NOT EXISTS'));
    });
  });
});