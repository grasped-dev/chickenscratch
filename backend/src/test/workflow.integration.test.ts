import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import workflowRoutes from '../routes/workflow.js';
import { errorHandlingMiddleware } from '../middleware/errorHandler.js';
import { initializeJobQueueService, getJobQueueService } from '../services/jobQueue.js';
import { initializeJobWorkerService, getJobWorkerService } from '../services/jobWorker.js';
import { initializeWorkflowService, getWorkflowService } from '../services/workflow.js';
import { ProjectRepository } from '../models/ProjectRepository.js';
import { ProcessedImageRepository } from '../models/ProcessedImageRepository.js';
import { NoteRepository } from '../models/NoteRepository.js';
import { ClusterRepository } from '../models/ClusterRepository.js';
import { UserRepository } from '../models/UserRepository.js';
import { authService } from '../services/auth.js';
import type { User, Project, ProcessedImage } from 'chicken-scratch-shared';

describe('Workflow Integration Tests', () => {
  let app: express.Application;
  let testUser: User;
  let testProject: Project;
  let testImages: ProcessedImage[];
  let authToken: string;
  
  const userRepo = new UserRepository();
  const projectRepo = new ProjectRepository();
  const imageRepo = new ProcessedImageRepository();
  const noteRepo = new NoteRepository();
  const clusterRepo = new ClusterRepository();

  // Create test app
  beforeAll(() => {
    app = express();
    app.use(helmet());
    app.use(cors());
    app.use(express.json());
    app.use('/api', workflowRoutes);
    app.use(errorHandlingMiddleware);
  });

  beforeAll(async () => {
    // Initialize services
    initializeJobQueueService();
    initializeJobWorkerService();
    initializeWorkflowService();
  });

  afterAll(async () => {
    // Cleanup services
    const jobQueueService = getJobQueueService();
    const jobWorkerService = getJobWorkerService();
    
    if (jobWorkerService) {
      await jobWorkerService.shutdown();
    }
    
    if (jobQueueService) {
      await jobQueueService.shutdown();
    }
  });

  beforeEach(async () => {
    // Create test user
    testUser = await userRepo.create({
      email: 'workflow-test@example.com',
      name: 'Workflow Test User',
      passwordHash: await authService.hashPassword('password123')
    });

    // Generate auth token
    authToken = authService.generateToken({
      userId: testUser.id,
      email: testUser.email,
      name: testUser.name
    });

    // Create test project
    testProject = await projectRepo.create({
      userId: testUser.id,
      name: 'Test Workflow Project',
      description: 'Project for testing workflow integration'
    });

    // Create test images
    testImages = await Promise.all([
      imageRepo.create({
        projectId: testProject.id,
        originalUrl: 'https://example.com/image1.jpg',
        filename: 'image1.jpg',
        fileSize: 1024000,
        mimeType: 'image/jpeg'
      }),
      imageRepo.create({
        projectId: testProject.id,
        originalUrl: 'https://example.com/image2.jpg',
        filename: 'image2.jpg',
        fileSize: 2048000,
        mimeType: 'image/jpeg'
      })
    ]);

    // Add mock OCR results to images
    await Promise.all(testImages.map(image => 
      imageRepo.updateById(image.id, {
        processingStatus: 'completed',
        ocrResults: {
          extractedText: [
            {
              id: `text-${image.id}-1`,
              text: `Sample text from ${image.filename}`,
              confidence: 0.95,
              boundingBox: { left: 10, top: 10, width: 100, height: 20 },
              type: 'LINE' as const
            }
          ],
          boundingBoxes: [
            { left: 10, top: 10, width: 100, height: 20 }
          ],
          confidence: 0.95,
          processingTime: 1000
        }
      })
    ));
  });

  afterEach(async () => {
    // Cleanup test data
    if (testProject) {
      await clusterRepo.deleteByProjectId(testProject.id);
      await imageRepo.deleteByProjectId(testProject.id);
      await projectRepo.deleteById(testProject.id);
    }
    
    if (testUser) {
      await userRepo.deleteById(testUser.id);
    }
  });

  describe('POST /api/projects/:projectId/workflow', () => {
    it('should start a new workflow successfully', async () => {
      const workflowConfig = {
        autoProcessing: true,
        clusteringMethod: 'hybrid',
        cleaningOptions: {
          spellCheck: true,
          removeArtifacts: true,
          normalizeSpacing: true
        },
        summaryOptions: {
          includeQuotes: true,
          includeDistribution: true,
          maxThemes: 10
        }
      };

      const response = await request(app)
        .post(`/api/projects/${testProject.id}/workflow`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(workflowConfig)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('workflowId');
      expect(response.body.data).toHaveProperty('projectId', testProject.id);
      expect(response.body.data).toHaveProperty('status', 'started');
    });

    it('should reject workflow start for non-existent project', async () => {
      const response = await request(app)
        .post('/api/projects/non-existent-id/workflow')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(404);

      expect(response.body.error).toBe('Project not found');
    });

    it('should reject workflow start for project owned by different user', async () => {
      // Create another user and project
      const otherUser = await userRepo.create({
        email: 'other-user@example.com',
        name: 'Other User',
        passwordHash: await authService.hashPassword('password123')
      });

      const otherProject = await projectRepo.create({
        userId: otherUser.id,
        name: 'Other User Project',
        description: 'Project owned by other user'
      });

      const response = await request(app)
        .post(`/api/projects/${otherProject.id}/workflow`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(403);

      expect(response.body.error).toBe('Not authorized to access this project');

      // Cleanup
      await projectRepo.deleteById(otherProject.id);
      await userRepo.deleteById(otherUser.id);
    });

    it('should reject workflow start for already processing project', async () => {
      // Set project status to processing
      await projectRepo.updateStatus(testProject.id, 'processing');

      const response = await request(app)
        .post(`/api/projects/${testProject.id}/workflow`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(409);

      expect(response.body.error).toBe('Project is already being processed');
    });

    it('should use default configuration when not provided', async () => {
      const response = await request(app)
        .post(`/api/projects/${testProject.id}/workflow`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('workflowId');
    });
  });

  describe('GET /api/workflows/:workflowId', () => {
    let workflowId: string;

    beforeEach(async () => {
      const workflowService = getWorkflowService();
      if (workflowService) {
        workflowId = await workflowService.startWorkflow(testProject.id, testUser.id, {
          autoProcessing: false,
          clusteringMethod: 'embeddings',
          cleaningOptions: {
            spellCheck: true,
            removeArtifacts: true,
            normalizeSpacing: true
          },
          summaryOptions: {
            includeQuotes: true,
            includeDistribution: true,
            maxThemes: 5
          }
        });
      }
    });

    it('should get workflow status successfully', async () => {
      const response = await request(app)
        .get(`/api/workflows/${workflowId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('workflowId', workflowId);
      expect(response.body.data).toHaveProperty('projectId', testProject.id);
      expect(response.body.data).toHaveProperty('status');
      expect(response.body.data).toHaveProperty('currentStage');
      expect(response.body.data).toHaveProperty('progress');
      expect(response.body.data).toHaveProperty('config');
    });

    it('should reject access to non-existent workflow', async () => {
      const response = await request(app)
        .get('/api/workflows/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.error).toBe('Workflow not found');
    });
  });

  describe('DELETE /api/workflows/:workflowId', () => {
    let workflowId: string;

    beforeEach(async () => {
      const workflowService = getWorkflowService();
      if (workflowService) {
        workflowId = await workflowService.startWorkflow(testProject.id, testUser.id, {
          autoProcessing: false,
          clusteringMethod: 'embeddings',
          cleaningOptions: {
            spellCheck: true,
            removeArtifacts: true,
            normalizeSpacing: true
          },
          summaryOptions: {
            includeQuotes: true,
            includeDistribution: true,
            maxThemes: 5
          }
        });
      }
    });

    it('should cancel workflow successfully', async () => {
      const response = await request(app)
        .delete(`/api/workflows/${workflowId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Workflow cancelled successfully');
    });

    it('should reject cancellation of non-existent workflow', async () => {
      const response = await request(app)
        .delete('/api/workflows/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.error).toBe('Workflow not found');
    });
  });

  describe('GET /api/workflows', () => {
    it('should get user workflows successfully', async () => {
      const response = await request(app)
        .get('/api/workflows')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('workflows');
      expect(response.body.data).toHaveProperty('total');
      expect(Array.isArray(response.body.data.workflows)).toBe(true);
    });
  });

  describe('GET /api/projects/:projectId/workflows', () => {
    it('should get project workflows successfully', async () => {
      const response = await request(app)
        .get(`/api/projects/${testProject.id}/workflows`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('projectId', testProject.id);
      expect(response.body.data).toHaveProperty('workflows');
      expect(response.body.data).toHaveProperty('total');
      expect(Array.isArray(response.body.data.workflows)).toBe(true);
    });

    it('should reject access to workflows for non-existent project', async () => {
      const response = await request(app)
        .get('/api/projects/non-existent-id/workflows')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.error).toBe('Project not found');
    });
  });

  describe('POST /api/workflows/:workflowId/restart', () => {
    let workflowId: string;

    beforeEach(async () => {
      const workflowService = getWorkflowService();
      if (workflowService) {
        workflowId = await workflowService.startWorkflow(testProject.id, testUser.id, {
          autoProcessing: false,
          clusteringMethod: 'embeddings',
          cleaningOptions: {
            spellCheck: true,
            removeArtifacts: true,
            normalizeSpacing: true
          },
          summaryOptions: {
            includeQuotes: true,
            includeDistribution: true,
            maxThemes: 5
          }
        });

        // Simulate workflow failure
        const workflow = await workflowService.getWorkflowStatus(workflowId);
        if (workflow) {
          workflow.status = 'failed';
          workflow.error = 'Simulated failure for testing';
        }
      }
    });

    it('should restart failed workflow successfully', async () => {
      const response = await request(app)
        .post(`/api/workflows/${workflowId}/restart`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('newWorkflowId');
      expect(response.body.data).toHaveProperty('projectId', testProject.id);
      expect(response.body.data).toHaveProperty('status', 'restarted');
    });

    it('should reject restart of non-failed workflow', async () => {
      // Reset workflow status to running
      const workflowService = getWorkflowService();
      if (workflowService) {
        const workflow = await workflowService.getWorkflowStatus(workflowId);
        if (workflow) {
          workflow.status = 'running';
          workflow.error = undefined;
        }
      }

      const response = await request(app)
        .post(`/api/workflows/${workflowId}/restart`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.error).toBe('Only failed workflows can be restarted');
    });
  });

  describe('Workflow Service Integration', () => {
    it('should execute complete workflow stages', async () => {
      const workflowService = getWorkflowService();
      expect(workflowService).toBeTruthy();

      if (!workflowService) return;

      // Mock the job queue service to avoid actual job processing
      const jobQueueService = getJobQueueService();
      if (jobQueueService) {
        // Mock job completion
        vi.spyOn(jobQueueService, 'addJob').mockImplementation(async (jobType, jobData, options) => {
          return {
            id: `mock-job-${Date.now()}`,
            data: jobData,
            opts: options || {},
            progress: vi.fn(),
            remove: vi.fn(),
            getState: vi.fn().mockResolvedValue('completed')
          } as any;
        });

        vi.spyOn(jobQueueService, 'getJobStatus').mockImplementation(async (jobId) => {
          return {
            id: jobId,
            status: 'completed',
            progress: 100,
            result: { success: true }
          };
        });
      }

      const workflowId = await workflowService.startWorkflow(testProject.id, testUser.id, {
        autoProcessing: false,
        clusteringMethod: 'embeddings',
        cleaningOptions: {
          spellCheck: true,
          removeArtifacts: true,
          normalizeSpacing: true
        },
        summaryOptions: {
          includeQuotes: true,
          includeDistribution: true,
          maxThemes: 5
        }
      });

      expect(workflowId).toBeTruthy();

      // Check initial workflow state
      const initialState = await workflowService.getWorkflowStatus(workflowId);
      expect(initialState).toBeTruthy();
      expect(initialState?.projectId).toBe(testProject.id);
      expect(initialState?.userId).toBe(testUser.id);
    });

    it('should handle workflow cancellation', async () => {
      const workflowService = getWorkflowService();
      if (!workflowService) return;

      const workflowId = await workflowService.startWorkflow(testProject.id, testUser.id, {
        autoProcessing: false,
        clusteringMethod: 'embeddings',
        cleaningOptions: {
          spellCheck: true,
          removeArtifacts: true,
          normalizeSpacing: true
        },
        summaryOptions: {
          includeQuotes: true,
          includeDistribution: true,
          maxThemes: 5
        }
      });

      const cancelled = await workflowService.cancelWorkflow(workflowId);
      expect(cancelled).toBe(true);

      const workflow = await workflowService.getWorkflowStatus(workflowId);
      expect(workflow?.status).toBe('cancelled');
    });

    it('should track workflow progress correctly', async () => {
      const workflowService = getWorkflowService();
      if (!workflowService) return;

      const workflowId = await workflowService.startWorkflow(testProject.id, testUser.id, {
        autoProcessing: false,
        clusteringMethod: 'embeddings',
        cleaningOptions: {
          spellCheck: true,
          removeArtifacts: true,
          normalizeSpacing: true
        },
        summaryOptions: {
          includeQuotes: true,
          includeDistribution: true,
          maxThemes: 5
        }
      });

      const workflow = await workflowService.getWorkflowStatus(workflowId);
      expect(workflow).toBeTruthy();
      expect(workflow?.progress).toBeGreaterThanOrEqual(0);
      expect(workflow?.progress).toBeLessThanOrEqual(100);
    });

    it('should handle workflow errors gracefully', async () => {
      const workflowService = getWorkflowService();
      if (!workflowService) return;

      // Create a project with no images to trigger an error
      const emptyProject = await projectRepo.create({
        userId: testUser.id,
        name: 'Empty Project',
        description: 'Project with no images'
      });

      try {
        await workflowService.startWorkflow(emptyProject.id, testUser.id, {
          autoProcessing: false,
          clusteringMethod: 'embeddings',
          cleaningOptions: {
            spellCheck: true,
            removeArtifacts: true,
            normalizeSpacing: true
          },
          summaryOptions: {
            includeQuotes: true,
            includeDistribution: true,
            maxThemes: 5
          }
        });
      } catch (error) {
        expect(error).toBeTruthy();
        expect(error instanceof Error ? error.message : '').toContain('No images found');
      }

      // Cleanup
      await projectRepo.deleteById(emptyProject.id);
    });
  });

  describe('Authentication and Authorization', () => {
    it('should reject requests without authentication', async () => {
      const response = await request(app)
        .post(`/api/projects/${testProject.id}/workflow`)
        .send({})
        .expect(401);

      expect(response.body.error).toBe('User not authenticated');
    });

    it('should reject requests with invalid token', async () => {
      const response = await request(app)
        .post(`/api/projects/${testProject.id}/workflow`)
        .set('Authorization', 'Bearer invalid-token')
        .send({})
        .expect(401);

      expect(response.body.error).toBe('Invalid token');
    });
  });
});