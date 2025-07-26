import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClusteringService } from '../services/clustering.js';
import { NoteRepository } from '../models/NoteRepository.js';
import { ClusterRepository } from '../models/ClusterRepository.js';
import type { CleanedText } from 'chicken-scratch-shared/types/processing';

// Mock the OpenAI API
vi.mock('openai', () => {
  return {
    Configuration: vi.fn().mockImplementation(() => ({})),
    OpenAIApi: vi.fn().mockImplementation(() => ({
      createEmbedding: vi.fn().mockResolvedValue({
        data: {
          data: [
            { embedding: [0.1, 0.2, 0.3] },
            { embedding: [0.2, 0.3, 0.4] },
            { embedding: [0.3, 0.4, 0.5] },
            { embedding: [0.1, 0.2, 0.3] },
            { embedding: [0.7, 0.8, 0.9] },
          ]
        }
      }),
      createChatCompletion: vi.fn().mockResolvedValue({
        data: {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  clusters: [
                    {
                      label: "Education",
                      notes: [1, 2],
                      confidence: 0.85
                    },
                    {
                      label: "Technology",
                      notes: [3, 4],
                      confidence: 0.9
                    }
                  ],
                  unclustered: [5],
                  overallConfidence: 0.88
                })
              }
            }
          ]
        }
      })
    }))
  };
});

// Mock the repositories
vi.mock('../models/NoteRepository.js', () => {
  return {
    NoteRepository: vi.fn().mockImplementation(() => ({
      updateEmbeddings: vi.fn().mockResolvedValue(undefined),
      assignToCluster: vi.fn().mockResolvedValue([]),
      removeFromCluster: vi.fn().mockResolvedValue([]),
      findUnclusteredByProject: vi.fn().mockResolvedValue([]),
      findByProjectId: vi.fn().mockResolvedValue([])
    }))
  };
});

vi.mock('../models/ClusterRepository.js', () => {
  return {
    ClusterRepository: vi.fn().mockImplementation(() => ({
      create: vi.fn().mockImplementation((data) => ({
        ...data,
        id: 'cluster-123',
        createdAt: new Date(),
        updatedAt: new Date()
      })),
      findByProjectId: vi.fn().mockResolvedValue([]),
      findById: vi.fn().mockResolvedValue({
        id: 'cluster-123',
        projectId: 'project-123',
        label: 'Test Cluster',
        textBlocks: ['note-1', 'note-2'],
        confidence: 0.85,
        createdAt: new Date(),
        updatedAt: new Date()
      }),
      updateById: vi.fn().mockImplementation((id, data) => ({
        id,
        projectId: 'project-123',
        label: data.label || 'Test Cluster',
        textBlocks: data.textBlocks || ['note-1', 'note-2'],
        confidence: data.confidence || 0.85,
        createdAt: new Date(),
        updatedAt: new Date()
      })),
      executeInTransaction: vi.fn().mockImplementation(async (callback) => {
        return await callback({
          query: vi.fn().mockResolvedValue({ rows: [] })
        });
      }),
      getClusterWithNotes: vi.fn().mockResolvedValue({
        cluster: {
          id: 'cluster-123',
          projectId: 'project-123',
          label: 'Test Cluster',
          textBlocks: ['note-1', 'note-2'],
          confidence: 0.85,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        notes: [
          {
            id: 'note-1',
            originalText: 'Original text 1',
            cleanedText: 'Cleaned text 1',
            confidence: 0.9
          },
          {
            id: 'note-2',
            originalText: 'Original text 2',
            cleanedText: 'Cleaned text 2',
            confidence: 0.85
          }
        ]
      }),
      updateLabel: vi.fn().mockImplementation((id, label) => ({
        id,
        projectId: 'project-123',
        label,
        textBlocks: ['note-1', 'note-2'],
        confidence: 0.85,
        createdAt: new Date(),
        updatedAt: new Date()
      })),
      getProjectClusterStats: vi.fn().mockResolvedValue({
        totalClusters: 2,
        averageConfidence: 0.85,
        averageNotesPerCluster: 2.5,
        topThemes: [
          { label: 'Education', noteCount: 3, confidence: 0.9 },
          { label: 'Technology', noteCount: 2, confidence: 0.8 }
        ]
      }),
      deleteClusterAndUnassignNotes: vi.fn().mockResolvedValue(true)
    }))
  };
});

// Mock ml-kmeans
vi.mock('ml-kmeans', () => {
  return {
    kmeans: vi.fn().mockReturnValue({
      clusters: [0, 0, 1, 1, 1],
      centroids: [
        [0.15, 0.25, 0.35],
        [0.4, 0.5, 0.6]
      ]
    })
  };
});

// Mock ml-hclust
vi.mock('ml-hclust', () => {
  return {
    agnes: vi.fn().mockReturnValue({
      group: vi.fn().mockReturnValue([0, 0, 1, 1, 1])
    })
  };
});

describe('ClusteringService', () => {
  let clusteringService: ClusteringService;
  let mockTextBlocks: CleanedText[];

  beforeEach(() => {
    clusteringService = new ClusteringService();
    mockTextBlocks = [
      { originalId: 'note-1', cleanedText: 'Education is important', corrections: [], confidence: 0.9 },
      { originalId: 'note-2', cleanedText: 'Learning is fun', corrections: [], confidence: 0.85 },
      { originalId: 'note-3', cleanedText: 'Technology is advancing', corrections: [], confidence: 0.95 },
      { originalId: 'note-4', cleanedText: 'AI is the future', corrections: [], confidence: 0.8 },
      { originalId: 'note-5', cleanedText: 'Random note', corrections: [], confidence: 0.7 }
    ];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('generateEmbeddings', () => {
    it('should generate embeddings for text blocks', async () => {
      const embeddingMap = await clusteringService.generateEmbeddings(mockTextBlocks);
      
      expect(embeddingMap.size).toBe(5);
      expect(embeddingMap.get('note-1')).toEqual([0.1, 0.2, 0.3]);
      expect(embeddingMap.get('note-3')).toEqual([0.3, 0.4, 0.5]);
    });
  });

  describe('processEmbeddingClustering', () => {
    it('should process clustering using embeddings', async () => {
      const result = await clusteringService.processClustering('project-123', {
        textBlocks: mockTextBlocks,
        clusteringMethod: 'embeddings'
      });
      
      expect(result.clusters.length).toBe(2);
      expect(result.clusters[0].textBlocks).toContain('note-1');
      expect(result.clusters[0].textBlocks).toContain('note-2');
      expect(result.clusters[1].textBlocks).toContain('note-3');
      expect(result.clusters[1].textBlocks).toContain('note-4');
      expect(result.clusters[1].textBlocks).toContain('note-5');
    });
  });

  describe('processLLMClustering', () => {
    it('should process clustering using LLM', async () => {
      const result = await clusteringService.processClustering('project-123', {
        textBlocks: mockTextBlocks,
        clusteringMethod: 'llm'
      });
      
      expect(result.clusters.length).toBe(2);
      expect(result.clusters[0].label).toBe('Education');
      expect(result.clusters[0].textBlocks).toContain('note-1');
      expect(result.clusters[0].textBlocks).toContain('note-2');
      expect(result.clusters[1].label).toBe('Technology');
      expect(result.clusters[1].textBlocks).toContain('note-3');
      expect(result.clusters[1].textBlocks).toContain('note-4');
      expect(result.unclustered).toContain('note-5');
    });
  });

  describe('processHybridClustering', () => {
    it('should process clustering using hybrid approach', async () => {
      const result = await clusteringService.processClustering('project-123', {
        textBlocks: mockTextBlocks,
        clusteringMethod: 'hybrid'
      });
      
      expect(result.clusters.length).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0);
    });
  });

  describe('getClusterWithNotes', () => {
    it('should get cluster with its notes', async () => {
      const result = await clusteringService.getClusterWithNotes('cluster-123');
      
      expect(result).not.toBeNull();
      expect(result?.cluster.id).toBe('cluster-123');
      expect(result?.cluster.label).toBe('Test Cluster');
      expect(result?.notes.length).toBe(2);
      expect(result?.notes[0].id).toBe('note-1');
      expect(result?.notes[1].id).toBe('note-2');
    });
  });

  describe('updateClusterLabel', () => {
    it('should update cluster label', async () => {
      const result = await clusteringService.updateClusterLabel('cluster-123', 'New Label');
      
      expect(result).not.toBeNull();
      expect(result?.id).toBe('cluster-123');
      expect(result?.label).toBe('New Label');
    });
  });

  describe('moveNotesToCluster', () => {
    it('should move notes to a cluster', async () => {
      const result = await clusteringService.moveNotesToCluster(['note-3', 'note-4'], 'cluster-123');
      
      expect(result).toBe(true);
    });

    it('should remove notes from clusters', async () => {
      const result = await clusteringService.moveNotesToCluster(['note-1', 'note-2'], null);
      
      expect(result).toBe(true);
    });
  });
});