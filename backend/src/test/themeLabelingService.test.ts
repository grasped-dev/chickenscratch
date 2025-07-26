import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ClusteringService } from '../services/clustering.js';
import { ClusterRepository } from '../models/ClusterRepository.js';
import { NoteRepository } from '../models/NoteRepository.js';
import type { ClusterData } from 'chicken-scratch-shared/types/processing';

// Mock OpenAI
vi.mock('openai', () => ({
  OpenAIApi: vi.fn().mockImplementation(() => ({
    createChatCompletion: vi.fn()
  })),
  Configuration: vi.fn()
}));

// Mock ML libraries
vi.mock('ml-kmeans', () => ({
  kmeans: vi.fn()
}));

vi.mock('ml-hclust', () => ({
  agnes: vi.fn()
}));

// Mock repositories
vi.mock('../models/ClusterRepository.js');
vi.mock('../models/NoteRepository.js');

describe('ClusteringService - Theme Labeling', () => {
  let clusteringService: ClusteringService;
  let mockClusterRepository: vi.Mocked<ClusterRepository>;
  let mockNoteRepository: vi.Mocked<NoteRepository>;
  let mockOpenAI: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup OpenAI mock
    mockOpenAI = {
      createChatCompletion: vi.fn()
    };
    
    // Setup repository mocks
    mockClusterRepository = {
      findById: vi.fn(),
      updateLabel: vi.fn(),
      findByProjectId: vi.fn(),
      executeInTransaction: vi.fn()
    } as any;
    
    mockNoteRepository = {
      updateEmbeddings: vi.fn(),
      assignToCluster: vi.fn(),
      removeFromCluster: vi.fn()
    } as any;
    
    clusteringService = new ClusteringService();
    
    // Replace repository instances
    (clusteringService as any).clusterRepository = mockClusterRepository;
    (clusteringService as any).noteRepository = mockNoteRepository;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('generateThemeLabels', () => {
    const mockProjectId = 'project-123';
    const mockClusters: ClusterData[] = [
      {
        id: 'cluster-1',
        label: 'Cluster 1',
        textBlocks: ['note-1', 'note-2'],
        confidence: 0.8
      },
      {
        id: 'cluster-2',
        label: 'Cluster 2',
        textBlocks: ['note-3', 'note-4'],
        confidence: 0.9
      }
    ];

    const mockNotes = [
      {
        id: 'note-1',
        originalText: 'Meeting agenda item 1',
        cleanedText: 'Meeting agenda item 1',
        confidence: 0.9
      },
      {
        id: 'note-2',
        originalText: 'Action items from meeting',
        cleanedText: 'Action items from meeting',
        confidence: 0.85
      }
    ];

    beforeEach(() => {
      // Mock getProjectClusters
      vi.spyOn(clusteringService, 'getProjectClusters').mockResolvedValue(mockClusters);
      
      // Mock getClusterWithNotes
      vi.spyOn(clusteringService, 'getClusterWithNotes').mockResolvedValue({
        cluster: mockClusters[0],
        notes: mockNotes
      });
    });

    it('should generate theme labels for all clusters in a project', async () => {
      // Mock OpenAI response
      mockOpenAI.createChatCompletion.mockResolvedValue({
        data: {
          choices: [{
            message: {
              content: JSON.stringify({
                label: 'Meeting Planning',
                confidence: 0.92,
                reasoning: 'Notes focus on meeting agenda and action items'
              })
            }
          }]
        }
      });

      const result = await clusteringService.generateThemeLabels(mockProjectId);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        clusterId: 'cluster-1',
        suggestedLabel: 'Meeting Planning',
        confidence: 0.92
      });
      
      expect(mockOpenAI.createChatCompletion).toHaveBeenCalledTimes(2);
    });

    it('should generate theme labels for specific clusters only', async () => {
      mockOpenAI.createChatCompletion.mockResolvedValue({
        data: {
          choices: [{
            message: {
              content: JSON.stringify({
                label: 'Meeting Planning',
                confidence: 0.92
              })
            }
          }]
        }
      });

      const result = await clusteringService.generateThemeLabels(
        mockProjectId, 
        ['cluster-1']
      );

      expect(result).toHaveLength(1);
      expect(result[0].clusterId).toBe('cluster-1');
      expect(mockOpenAI.createChatCompletion).toHaveBeenCalledTimes(1);
    });

    it('should handle OpenAI API errors gracefully', async () => {
      mockOpenAI.createChatCompletion.mockRejectedValue(new Error('API Error'));

      const result = await clusteringService.generateThemeLabels(mockProjectId);

      expect(result).toHaveLength(2);
      expect(result[0].suggestedLabel).toBe('Theme 1');
      expect(result[0].confidence).toBe(0.5);
    });

    it('should handle malformed JSON responses', async () => {
      mockOpenAI.createChatCompletion.mockResolvedValue({
        data: {
          choices: [{
            message: {
              content: 'Invalid JSON response'
            }
          }]
        }
      });

      const result = await clusteringService.generateThemeLabels(mockProjectId);

      expect(result[0].suggestedLabel).toBe('Untitled Theme');
      expect(result[0].confidence).toBe(0.5);
    });
  });

  describe('validateLabelUniqueness', () => {
    const mockProjectId = 'project-123';
    const mockClusters: ClusterData[] = [
      {
        id: 'cluster-1',
        label: 'Meeting Planning',
        textBlocks: [],
        confidence: 0.8
      },
      {
        id: 'cluster-2',
        label: 'Action Items',
        textBlocks: [],
        confidence: 0.9
      }
    ];

    beforeEach(() => {
      vi.spyOn(clusteringService, 'getProjectClusters').mockResolvedValue(mockClusters);
    });

    it('should return true for unique labels', async () => {
      const result = await clusteringService.validateLabelUniqueness(
        mockProjectId,
        'New Theme'
      );

      expect(result.isUnique).toBe(true);
      expect(result.suggestions).toBeUndefined();
    });

    it('should return false for duplicate labels with suggestions', async () => {
      // Mock OpenAI for suggestions
      mockOpenAI.createChatCompletion.mockResolvedValue({
        data: {
          choices: [{
            message: {
              content: JSON.stringify([
                'Meeting Coordination',
                'Meeting Organization',
                'Meeting Setup'
              ])
            }
          }]
        }
      });

      const result = await clusteringService.validateLabelUniqueness(
        mockProjectId,
        'Meeting Planning'
      );

      expect(result.isUnique).toBe(false);
      expect(result.suggestions).toContain('Meeting Planning 2');
      expect(result.suggestions).toContain('Meeting Coordination');
    });

    it('should exclude specified cluster from uniqueness check', async () => {
      const result = await clusteringService.validateLabelUniqueness(
        mockProjectId,
        'Meeting Planning',
        'cluster-1'
      );

      expect(result.isUnique).toBe(true);
    });

    it('should handle case-insensitive comparison', async () => {
      const result = await clusteringService.validateLabelUniqueness(
        mockProjectId,
        'MEETING PLANNING'
      );

      expect(result.isUnique).toBe(false);
    });
  });

  describe('getClusterLabelHistory', () => {
    it('should return label history for a cluster', async () => {
      const mockCluster = {
        id: 'cluster-1',
        label: 'Meeting Planning',
        updatedAt: new Date('2024-01-15T10:00:00Z'),
        textBlocks: [],
        confidence: 0.8,
        projectId: 'project-1',
        createdAt: new Date('2024-01-15T09:00:00Z')
      };

      mockClusterRepository.findById.mockResolvedValue(mockCluster);

      const result = await clusteringService.getClusterLabelHistory('cluster-1');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        label: 'Meeting Planning',
        changedAt: mockCluster.updatedAt,
        isAutoGenerated: false
      });
    });

    it('should identify auto-generated labels', async () => {
      const mockCluster = {
        id: 'cluster-1',
        label: 'Cluster 1',
        updatedAt: new Date(),
        textBlocks: [],
        confidence: 0.8,
        projectId: 'project-1',
        createdAt: new Date()
      };

      mockClusterRepository.findById.mockResolvedValue(mockCluster);

      const result = await clusteringService.getClusterLabelHistory('cluster-1');

      expect(result[0].isAutoGenerated).toBe(true);
    });

    it('should return empty array for non-existent cluster', async () => {
      mockClusterRepository.findById.mockResolvedValue(null);

      const result = await clusteringService.getClusterLabelHistory('non-existent');

      expect(result).toEqual([]);
    });
  });
});