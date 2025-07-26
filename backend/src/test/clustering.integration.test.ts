import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import express from 'express';
import { clusteringController } from '../controllers/clustering.js';
import { ClusteringService } from '../services/clustering.js';
import { ClusterRepository } from '../models/ClusterRepository.js';
import { NoteRepository } from '../models/NoteRepository.js';

// Create a router manually instead of importing the one with middleware
const clusteringRoutes = express.Router();

// Define routes manually without auth middleware
clusteringRoutes.post('/projects/:projectId/clustering', clusteringController.processClustering);
clusteringRoutes.get('/projects/:projectId/clusters', clusteringController.getProjectClusters);
clusteringRoutes.get('/projects/:projectId/unclustered-notes', clusteringController.getUnclusteredNotes);
clusteringRoutes.get('/projects/:projectId/cluster-stats', clusteringController.getClusterStats);
clusteringRoutes.get('/clusters/:clusterId', clusteringController.getClusterWithNotes);
clusteringRoutes.patch('/clusters/:clusterId/label', clusteringController.updateClusterLabel);
clusteringRoutes.post('/notes/move', clusteringController.moveNotesToCluster);
clusteringRoutes.delete('/clusters/:clusterId', clusteringController.deleteCluster);

// Mock the repositories and services
vi.mock('../services/clustering.js', () => {
  return {
    ClusteringService: vi.fn().mockImplementation(() => ({
      processClustering: vi.fn().mockResolvedValue({
        clusters: [
          {
            id: 'cluster-1',
            label: 'Education',
            textBlocks: ['note-1', 'note-2'],
            confidence: 0.85
          },
          {
            id: 'cluster-2',
            label: 'Technology',
            textBlocks: ['note-3', 'note-4'],
            confidence: 0.9
          }
        ],
        unclustered: ['note-5'],
        confidence: 0.88
      }),
      getProjectClusters: vi.fn().mockResolvedValue([
        {
          id: 'cluster-1',
          label: 'Education',
          textBlocks: ['note-1', 'note-2'],
          confidence: 0.85
        },
        {
          id: 'cluster-2',
          label: 'Technology',
          textBlocks: ['note-3', 'note-4'],
          confidence: 0.9
        }
      ]),
      getClusterWithNotes: vi.fn().mockResolvedValue({
        cluster: {
          id: 'cluster-1',
          label: 'Education',
          textBlocks: ['note-1', 'note-2'],
          confidence: 0.85
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
      updateClusterLabel: vi.fn().mockResolvedValue({
        id: 'cluster-1',
        label: 'New Label',
        textBlocks: ['note-1', 'note-2'],
        confidence: 0.85
      }),
      moveNotesToCluster: vi.fn().mockResolvedValue(true)
    }))
  };
});

vi.mock('../models/NoteRepository.js', () => {
  return {
    NoteRepository: vi.fn().mockImplementation(() => ({
      findUnclusteredByProject: vi.fn().mockResolvedValue([
        {
          id: 'note-5',
          imageId: 'image-1',
          originalText: 'Original text 5',
          cleanedText: 'Cleaned text 5',
          boundingBox: { left: 0, top: 0, width: 100, height: 50 },
          confidence: 0.7,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ])
    }))
  };
});

vi.mock('../models/ClusterRepository.js', () => {
  return {
    ClusterRepository: vi.fn().mockImplementation(() => ({
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

// Mock JWT verification
vi.mock('jsonwebtoken', () => {
  return {
    verify: vi.fn().mockImplementation(() => ({ userId: 'user-123' }))
  };
});

describe('Clustering API Integration Tests', () => {
  const app = express();
  app.use(express.json());
  
  // Mock auth middleware
  app.use((req, _res, next) => {
    req.user = { id: 'user-123' };
    next();
  });
  
  app.use('/api/clustering', clusteringRoutes);

  describe('POST /api/clustering/projects/:projectId/clustering', () => {
    it('should process clustering for a project', async () => {
      const response = await request(app)
        .post('/api/clustering/projects/project-123/clustering')
        .send({
          textBlocks: [
            { originalId: 'note-1', cleanedText: 'Education is important', corrections: [], confidence: 0.9 },
            { originalId: 'note-2', cleanedText: 'Learning is fun', corrections: [], confidence: 0.85 },
            { originalId: 'note-3', cleanedText: 'Technology is advancing', corrections: [], confidence: 0.95 },
            { originalId: 'note-4', cleanedText: 'AI is the future', corrections: [], confidence: 0.8 },
            { originalId: 'note-5', cleanedText: 'Random note', corrections: [], confidence: 0.7 }
          ],
          clusteringMethod: 'hybrid'
        });
      
      expect(response.status).toBe(200);
      expect(response.body.clusters).toHaveLength(2);
      expect(response.body.clusters[0].label).toBe('Education');
      expect(response.body.clusters[1].label).toBe('Technology');
      expect(response.body.unclustered).toContain('note-5');
    });

    it('should return 400 if text blocks are missing', async () => {
      const response = await request(app)
        .post('/api/clustering/projects/project-123/clustering')
        .send({
          clusteringMethod: 'hybrid'
        });
      
      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/clustering/projects/:projectId/clusters', () => {
    it('should get clusters for a project', async () => {
      const response = await request(app)
        .get('/api/clustering/projects/project-123/clusters');
      
      expect(response.status).toBe(200);
      expect(response.body.clusters).toHaveLength(2);
      expect(response.body.clusters[0].label).toBe('Education');
      expect(response.body.clusters[1].label).toBe('Technology');
    });
  });

  describe('GET /api/clustering/clusters/:clusterId', () => {
    it('should get cluster with its notes', async () => {
      const response = await request(app)
        .get('/api/clustering/clusters/cluster-1');
      
      expect(response.status).toBe(200);
      expect(response.body.cluster.label).toBe('Education');
      expect(response.body.notes).toHaveLength(2);
    });
  });

  describe('PATCH /api/clustering/clusters/:clusterId/label', () => {
    it('should update cluster label', async () => {
      const response = await request(app)
        .patch('/api/clustering/clusters/cluster-1/label')
        .send({ label: 'New Label' });
      
      expect(response.status).toBe(200);
      expect(response.body.label).toBe('New Label');
    });

    it('should return 400 if label is missing', async () => {
      const response = await request(app)
        .patch('/api/clustering/clusters/cluster-1/label')
        .send({});
      
      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/clustering/notes/move', () => {
    it('should move notes to a cluster', async () => {
      const response = await request(app)
        .post('/api/clustering/notes/move')
        .send({
          noteIds: ['note-3', 'note-4'],
          targetClusterId: 'cluster-1'
        });
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should return 400 if note IDs are missing', async () => {
      const response = await request(app)
        .post('/api/clustering/notes/move')
        .send({
          targetClusterId: 'cluster-1'
        });
      
      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/clustering/projects/:projectId/unclustered-notes', () => {
    it('should get unclustered notes for a project', async () => {
      const response = await request(app)
        .get('/api/clustering/projects/project-123/unclustered-notes');
      
      expect(response.status).toBe(200);
      expect(response.body.notes).toHaveLength(1);
      expect(response.body.notes[0].id).toBe('note-5');
    });
  });

  describe('GET /api/clustering/projects/:projectId/cluster-stats', () => {
    it('should get cluster statistics for a project', async () => {
      const response = await request(app)
        .get('/api/clustering/projects/project-123/cluster-stats');
      
      expect(response.status).toBe(200);
      expect(response.body.totalClusters).toBe(2);
      expect(response.body.averageConfidence).toBe(0.85);
      expect(response.body.topThemes).toHaveLength(2);
    });
  });

  describe('DELETE /api/clustering/clusters/:clusterId', () => {
    it('should delete a cluster', async () => {
      const response = await request(app)
        .delete('/api/clustering/clusters/cluster-1');
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });
});