import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { clusteringController } from '../controllers/clustering.js';
import { ClusteringService } from '../services/clustering.js';

// Mock ML libraries
vi.mock('ml-kmeans', () => ({
  kmeans: vi.fn()
}));

vi.mock('ml-hclust', () => ({
  agnes: vi.fn()
}));

// Mock OpenAI
vi.mock('openai', () => ({
  OpenAIApi: vi.fn(),
  Configuration: vi.fn()
}));

// Mock the clustering service
vi.mock('../services/clustering.js');

// Mock auth middleware
vi.mock('../middleware/auth.js', () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    req.user = { id: 'user-123' };
    next();
  }
}));

describe('Theme Labeling Controller Integration', () => {
  let app: express.Application;
  let mockClusteringService: vi.Mocked<ClusteringService>;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup express app
    app = express();
    app.use(express.json());
    
    // Setup routes
    app.post('/projects/:projectId/generate-theme-labels', clusteringController.generateThemeLabels);
    app.post('/projects/:projectId/validate-label', clusteringController.validateLabelUniqueness);
    app.get('/clusters/:clusterId/label-history', clusteringController.getClusterLabelHistory);
    app.patch('/clusters/:clusterId/label', clusteringController.updateClusterLabel);
    
    // Mock clustering service
    mockClusteringService = {
      generateThemeLabels: vi.fn(),
      validateLabelUniqueness: vi.fn(),
      getClusterLabelHistory: vi.fn(),
      updateClusterLabel: vi.fn()
    } as any;
    
    // Replace the service constructor
    vi.mocked(ClusteringService).mockImplementation(() => mockClusteringService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /projects/:projectId/generate-theme-labels', () => {
    it('should generate theme labels for all clusters', async () => {
      const mockSuggestions = [
        {
          clusterId: 'cluster-1',
          suggestedLabel: 'Meeting Planning',
          confidence: 0.9
        },
        {
          clusterId: 'cluster-2',
          suggestedLabel: 'Action Items',
          confidence: 0.85
        }
      ];

      mockClusteringService.generateThemeLabels.mockResolvedValue(mockSuggestions);

      const response = await request(app)
        .post('/projects/project-123/generate-theme-labels')
        .send({});

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        suggestions: mockSuggestions
      });
      expect(mockClusteringService.generateThemeLabels).toHaveBeenCalledWith('project-123', undefined);
    });

    it('should generate theme labels for specific clusters', async () => {
      const mockSuggestions = [
        {
          clusterId: 'cluster-1',
          suggestedLabel: 'Meeting Planning',
          confidence: 0.9
        }
      ];

      mockClusteringService.generateThemeLabels.mockResolvedValue(mockSuggestions);

      const response = await request(app)
        .post('/projects/project-123/generate-theme-labels')
        .send({
          clusterIds: ['cluster-1']
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        suggestions: mockSuggestions
      });
      expect(mockClusteringService.generateThemeLabels).toHaveBeenCalledWith('project-123', ['cluster-1']);
    });

    it('should return 400 for missing project ID', async () => {
      const response = await request(app)
        .post('/projects//generate-theme-labels')
        .send({});

      expect(response.status).toBe(404); // Express returns 404 for empty params
    });

    it('should handle service errors', async () => {
      mockClusteringService.generateThemeLabels.mockRejectedValue(new Error('Service error'));

      const response = await request(app)
        .post('/projects/project-123/generate-theme-labels')
        .send({});

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: 'Failed to generate theme labels',
        details: 'Service error'
      });
    });
  });

  describe('POST /projects/:projectId/validate-label', () => {
    it('should validate unique labels', async () => {
      const mockValidation = {
        isUnique: true
      };

      mockClusteringService.validateLabelUniqueness.mockResolvedValue(mockValidation);

      const response = await request(app)
        .post('/projects/project-123/validate-label')
        .send({
          label: 'New Theme Label'
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockValidation);
      expect(mockClusteringService.validateLabelUniqueness).toHaveBeenCalledWith(
        'project-123',
        'New Theme Label',
        undefined
      );
    });

    it('should validate duplicate labels with suggestions', async () => {
      const mockValidation = {
        isUnique: false,
        suggestions: ['New Theme Label 2', 'Alternative Label']
      };

      mockClusteringService.validateLabelUniqueness.mockResolvedValue(mockValidation);

      const response = await request(app)
        .post('/projects/project-123/validate-label')
        .send({
          label: 'Duplicate Label',
          excludeClusterId: 'cluster-1'
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockValidation);
      expect(mockClusteringService.validateLabelUniqueness).toHaveBeenCalledWith(
        'project-123',
        'Duplicate Label',
        'cluster-1'
      );
    });

    it('should return 400 for missing label', async () => {
      const response = await request(app)
        .post('/projects/project-123/validate-label')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Valid label is required'
      });
    });

    it('should return 400 for invalid label type', async () => {
      const response = await request(app)
        .post('/projects/project-123/validate-label')
        .send({
          label: 123
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Valid label is required'
      });
    });
  });

  describe('GET /clusters/:clusterId/label-history', () => {
    it('should return cluster label history', async () => {
      const mockHistory = [
        {
          label: 'Meeting Planning',
          changedAt: new Date('2024-01-15T10:00:00Z'),
          isAutoGenerated: false
        },
        {
          label: 'Cluster 1',
          changedAt: new Date('2024-01-15T09:00:00Z'),
          isAutoGenerated: true
        }
      ];

      mockClusteringService.getClusterLabelHistory.mockResolvedValue(mockHistory);

      const response = await request(app)
        .get('/clusters/cluster-123/label-history');

      expect(response.status).toBe(200);
      expect(response.body.history).toHaveLength(2);
      expect(response.body.history[0].label).toBe('Meeting Planning');
      expect(response.body.history[0].isAutoGenerated).toBe(false);
      expect(response.body.history[1].label).toBe('Cluster 1');
      expect(response.body.history[1].isAutoGenerated).toBe(true);
      expect(mockClusteringService.getClusterLabelHistory).toHaveBeenCalledWith('cluster-123');
    });

    it('should return 400 for missing cluster ID', async () => {
      const response = await request(app)
        .get('/clusters//label-history');

      expect(response.status).toBe(404); // Express returns 404 for empty params
    });

    it('should handle service errors', async () => {
      mockClusteringService.getClusterLabelHistory.mockRejectedValue(new Error('Service error'));

      const response = await request(app)
        .get('/clusters/cluster-123/label-history');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: 'Failed to get cluster label history',
        details: 'Service error'
      });
    });
  });

  describe('PATCH /clusters/:clusterId/label', () => {
    it('should update cluster label', async () => {
      const mockUpdatedCluster = {
        id: 'cluster-123',
        label: 'Updated Label',
        textBlocks: ['note-1', 'note-2'],
        confidence: 0.85
      };

      mockClusteringService.updateClusterLabel.mockResolvedValue(mockUpdatedCluster);

      const response = await request(app)
        .patch('/clusters/cluster-123/label')
        .send({
          label: 'Updated Label'
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockUpdatedCluster);
      expect(mockClusteringService.updateClusterLabel).toHaveBeenCalledWith('cluster-123', 'Updated Label');
    });

    it('should return 404 for non-existent cluster', async () => {
      mockClusteringService.updateClusterLabel.mockResolvedValue(null);

      const response = await request(app)
        .patch('/clusters/non-existent/label')
        .send({
          label: 'Updated Label'
        });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        error: 'Cluster not found'
      });
    });

    it('should return 400 for missing label', async () => {
      const response = await request(app)
        .patch('/clusters/cluster-123/label')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Valid label is required'
      });
    });

    it('should return 400 for invalid label type', async () => {
      const response = await request(app)
        .patch('/clusters/cluster-123/label')
        .send({
          label: 123
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Valid label is required'
      });
    });
  });
});