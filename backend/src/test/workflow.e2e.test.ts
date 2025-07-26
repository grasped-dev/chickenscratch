import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { Server } from 'http';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import workflowRoutes from '../routes/workflow.js';
import uploadRoutes from '../routes/upload.js';
import projectRoutes from '../routes/project.js';
import { errorHandlingMiddleware } from '../middleware/errorHandler.js';
import { initializeJobQueueService, getJobQueueService } from '../services/jobQueue.js';
import { initializeJobWorkerService, getJobWorkerService } from '../services/jobWorker.js';
import { initializeWorkflowService, getWorkflowService } from '../services/workflow.js';
import { initializeWebSocketService } from '../services/websocket.js';
import { ProjectRepository } from '../models/ProjectRepository.js';
import { ProcessedImageRepository } from '../models/ProcessedImageRepository.js';
import { NoteRepository } from '../models/NoteRepository.js';
import { ClusterRepository } from '../models/ClusterRepository.js';
import { UserRepository } from '../models/UserRepository.js';
import { authService } from '../services/auth.js';
import type { User, Project, ProcessedImage } from 'chicken-scratch-shared';

describe('End-to-End Workflow Integration Tests', () => {
  let app: express.Application;
  let server: Server;
  let testUser: User;
  let testProject: Project;
  let testImages: ProcessedImage[];
  let authToken: string;
  let clientSocket: ClientSocket;
  
  const userRepo = new UserRepository();
  const projectRepo = new ProjectRepository();
  const imageRepo = new ProcessedImageRepository();
  const noteRepo = new NoteRepository();
  const clusterRepo = new ClusterRepository();

  // Create test app and server
  beforeAll(async () => {
    app = express();
    app.use(helmet());
    app.use(cors());
    app.use(express.json());
    app.use('/api', workflowRoutes);
    app.use('/api', uploadRoutes);
    app.use('/api', projectRoutes);
    app.use(errorHandlingMiddleware);

    server = app.listen(0); // Use random port
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 3001;

    // Initialize services
    initializeJobQueueService();
    initializeJobWorkerService();
    initializeWorkflowService();
    initializeWebSocketService(server);

    // Wait for services to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));
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

    if (server) {
      server.close();
    }
  });

  beforeEach(async () => {
    // Create test user
    testUser = await userRepo.create({
      email: 'e2e-test@example.com',
      name: 'E2E Test User',
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
      name: 'E2E Test Project',
      description: 'Project for end-to-end workflow testing'
    });

    // Create test images with realistic OCR results
    testImages = await Promise.all([
      imageRepo.create({
        projectId: testProject.id,
        originalUrl: 'https://example.com/meeting-notes-1.jpg',
        filename: 'meeting-notes-1.jpg',
        fileSize: 1024000,
        mimeType: 'image/jpeg'
      }),
      imageRepo.create({
        projectId: testProject.id,
        originalUrl: 'https://example.com/meeting-notes-2.jpg',
        filename: 'meeting-notes-2.jpg',
        fileSize: 2048000,
        mimeType: 'image/jpeg'
      }),
      imageRepo.create({
        projectId: testProject.id,
        originalUrl: 'https://example.com/whiteboard-ideas.jpg',
        filename: 'whiteboard-ideas.jpg',
        fileSize: 1536000,
        mimeType: 'image/jpeg'
      })
    ]);

    // Add realistic OCR results to images
    await Promise.all([
      imageRepo.updateById(testImages[0].id, {
        processingStatus: 'completed',
        ocrResults: {
          extractedText: [
            {
              id: `text-${testImages[0].id}-1`,
              text: 'Improve user onboarding process',
              confidence: 0.95,
              boundingBox: { left: 10, top: 10, width: 200, height: 20 },
              type: 'LINE' as const
            },
            {
              id: `text-${testImages[0].id}-2`,
              text: 'Add more interactive tutorials',
              confidence: 0.92,
              boundingBox: { left: 10, top: 35, width: 180, height: 20 },
              type: 'LINE' as const
            },
            {
              id: `text-${testImages[0].id}-3`,
              text: 'Simplify registration form',
              confidence: 0.88,
              boundingBox: { left: 10, top: 60, width: 160, height: 20 },
              type: 'LINE' as const
            }
          ],
          boundingBoxes: [
            { left: 10, top: 10, width: 200, height: 20 },
            { left: 10, top: 35, width: 180, height: 20 },
            { left: 10, top: 60, width: 160, height: 20 }
          ],
          confidence: 0.92,
          processingTime: 1200
        }
      }),
      imageRepo.updateById(testImages[1].id, {
        processingStatus: 'completed',
        ocrResults: {
          extractedText: [
            {
              id: `text-${testImages[1].id}-1`,
              text: 'Fix mobile responsiveness issues',
              confidence: 0.94,
              boundingBox: { left: 15, top: 15, width: 220, height: 18 },
              type: 'LINE' as const
            },
            {
              id: `text-${testImages[1].id}-2`,
              text: 'Optimize page load times',
              confidence: 0.91,
              boundingBox: { left: 15, top: 38, width: 190, height: 18 },
              type: 'LINE' as const
            },
            {
              id: `text-${testImages[1].id}-3`,
              text: 'Update color scheme for accessibility',
              confidence: 0.89,
              boundingBox: { left: 15, top: 61, width: 240, height: 18 },
              type: 'LINE' as const
            }
          ],
          boundingBoxes: [
            { left: 15, top: 15, width: 220, height: 18 },
            { left: 15, top: 38, width: 190, height: 18 },
            { left: 15, top: 61, width: 240, height: 18 }
          ],
          confidence: 0.91,
          processingTime: 1100
        }
      }),
      imageRepo.updateById(testImages[2].id, {
        processingStatus: 'completed',
        ocrResults: {
          extractedText: [
            {
              id: `text-${testImages[2].id}-1`,
              text: 'Implement dark mode feature',
              confidence: 0.96,
              boundingBox: { left: 20, top: 20, width: 200, height: 22 },
              type: 'LINE' as const
            },
            {
              id: `text-${testImages[2].id}-2`,
              text: 'Add user preference settings',
              confidence: 0.93,
              boundingBox: { left: 20, top: 47, width: 210, height: 22 },
              type: 'LINE' as const
            },
            {
              id: `text-${testImages[2].id}-3`,
              text: 'Create notification system',
              confidence: 0.90,
              boundingBox: { left: 20, top: 74, width: 195, height: 22 },
              type: 'LINE' as const
            }
          ],
          boundingBoxes: [
            { left: 20, top: 20, width: 200, height: 22 },
            { left: 20, top: 47, width: 210, height: 22 },
            { left: 20, top: 74, width: 195, height: 22 }
          ],
          confidence: 0.93,
          processingTime: 1300
        }
      })
    ]);

    // Create corresponding notes from OCR results
    for (const image of testImages) {
      if (image.ocrResults?.extractedText) {
        for (const textBlock of image.ocrResults.extractedText) {
          await noteRepo.create({
            imageId: image.id,
            projectId: testProject.id,
            originalText: textBlock.text,
            cleanedText: textBlock.text, // For testing, assume cleaning doesn't change much
            boundingBox: textBlock.boundingBox,
            confidence: textBlock.confidence
          });
        }
      }
    }

    // Setup WebSocket client for testing real-time updates
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 3001;
    
    clientSocket = ioClient(`http://localhost:${port}`, {
      auth: {
        token: authToken
      },
      transports: ['websocket']
    });

    await new Promise<void>((resolve, reject) => {
      clientSocket.on('connect', resolve);
      clientSocket.on('connect_error', reject);
      setTimeout(() => reject(new Error('WebSocket connection timeout')), 5000);
    });
  });

  afterEach(async () => {
    // Disconnect WebSocket client
    if (clientSocket) {
      clientSocket.disconnect();
    }

    // Cleanup test data
    if (testProject) {
      await clusterRepo.deleteByProjectId(testProject.id);
      await noteRepo.deleteByProjectId(testProject.id);
      await imageRepo.deleteByProjectId(testProject.id);
      await projectRepo.deleteById(testProject.id);
    }
    
    if (testUser) {
      await userRepo.deleteById(testUser.id);
    }
  });

  describe('Complete Workflow End-to-End', () => {
    it('should execute complete workflow from start to finish with real-time updates', async () => {
      // Mock external services to avoid actual API calls
      const mockJobQueue = {
        addJob: vi.fn().mockImplementation(async (jobType, jobData, options) => ({
          id: `mock-job-${Date.now()}-${Math.random()}`,
          data: jobData,
          opts: options || {},
          progress: vi.fn(),
          remove: vi.fn(),
          getState: vi.fn().mockResolvedValue('completed')
        })),
        getJobStatus: vi.fn().mockImplementation(async (jobId) => ({
          id: jobId,
          status: 'completed',
          progress: 100,
          result: { success: true }
        })),
        cancelJob: vi.fn().mockResolvedValue(true)
      };

      const jobQueueService = getJobQueueService();
      if (jobQueueService) {
        Object.assign(jobQueueService, mockJobQueue);
      }

      // Track WebSocket events
      const workflowProgressEvents: any[] = [];
      const workflowStatusEvents: any[] = [];
      const notificationEvents: any[] = [];

      clientSocket.on('workflow-progress', (data) => {
        workflowProgressEvents.push(data);
      });

      clientSocket.on('workflow-status', (data) => {
        workflowStatusEvents.push(data);
      });

      clientSocket.on('notification', (data) => {
        notificationEvents.push(data);
      });

      // Join project room for updates
      clientSocket.emit('join-project', testProject.id);

      // Step 1: Start workflow
      const workflowConfig = {
        autoProcessing: true,
        clusteringMethod: 'hybrid' as const,
        targetClusters: 3,
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
      };

      const startResponse = await request(app)
        .post(`/api/projects/${testProject.id}/workflow`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(workflowConfig)
        .expect(200);

      expect(startResponse.body.success).toBe(true);
      expect(startResponse.body.data).toHaveProperty('workflowId');
      
      const workflowId = startResponse.body.data.workflowId;

      // Step 2: Monitor workflow progress
      let workflowCompleted = false;
      let attempts = 0;
      const maxAttempts = 30; // 30 seconds timeout

      while (!workflowCompleted && attempts < maxAttempts) {
        const statusResponse = await request(app)
          .get(`/api/workflows/${workflowId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        const workflow = statusResponse.body.data;
        
        expect(workflow).toHaveProperty('workflowId', workflowId);
        expect(workflow).toHaveProperty('projectId', testProject.id);
        expect(workflow).toHaveProperty('status');
        expect(workflow).toHaveProperty('currentStage');
        expect(workflow).toHaveProperty('progress');
        expect(workflow.progress).toBeGreaterThanOrEqual(0);
        expect(workflow.progress).toBeLessThanOrEqual(100);

        if (workflow.status === 'completed') {
          workflowCompleted = true;
          expect(workflow.progress).toBe(100);
          expect(workflow.currentStage).toBe('completed');
          expect(workflow).toHaveProperty('completedAt');
        } else if (workflow.status === 'failed') {
          throw new Error(`Workflow failed: ${workflow.error}`);
        }

        attempts++;
        if (!workflowCompleted) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        }
      }

      expect(workflowCompleted).toBe(true);

      // Step 3: Verify project status updated
      const updatedProject = await projectRepo.findById(testProject.id);
      expect(updatedProject?.status).toBe('completed');

      // Step 4: Verify clusters were created
      const clusters = await clusterRepo.findByProjectId(testProject.id);
      expect(clusters.length).toBeGreaterThan(0);
      expect(clusters.length).toBeLessThanOrEqual(workflowConfig.targetClusters || 5);

      // Each cluster should have a label and confidence score
      for (const cluster of clusters) {
        expect(cluster.label).toBeTruthy();
        expect(cluster.confidence).toBeGreaterThan(0);
        expect(cluster.confidence).toBeLessThanOrEqual(1);
      }

      // Step 5: Verify notes were assigned to clusters
      const notes = await noteRepo.findByProjectId(testProject.id);
      const clusteredNotes = notes.filter(note => note.clusterId);
      expect(clusteredNotes.length).toBeGreaterThan(0);

      // Step 6: Verify project summary was generated
      const finalProject = await projectRepo.findById(testProject.id);
      expect(finalProject?.summary).toBeTruthy();
      expect(finalProject?.summary?.topThemes).toBeTruthy();
      expect(finalProject?.summary?.topThemes.length).toBeGreaterThan(0);

      // Step 7: Verify WebSocket events were received
      expect(workflowProgressEvents.length).toBeGreaterThan(0);
      
      // Should have received progress updates for different stages
      const stages = new Set(workflowProgressEvents.map(event => event.stage));
      expect(stages.size).toBeGreaterThan(1);

      // Progress should be increasing
      for (let i = 1; i < workflowProgressEvents.length; i++) {
        expect(workflowProgressEvents[i].progress).toBeGreaterThanOrEqual(
          workflowProgressEvents[i - 1].progress
        );
      }

      // Step 8: Test workflow cancellation (start another workflow to cancel)
      const cancelTestResponse = await request(app)
        .post(`/api/projects/${testProject.id}/workflow`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ autoProcessing: false })
        .expect(200);

      const cancelWorkflowId = cancelTestResponse.body.data.workflowId;

      const cancelResponse = await request(app)
        .delete(`/api/workflows/${cancelWorkflowId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(cancelResponse.body.success).toBe(true);

      // Verify workflow was cancelled
      const cancelledStatusResponse = await request(app)
        .get(`/api/workflows/${cancelWorkflowId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(cancelledStatusResponse.body.data.status).toBe('cancelled');

      // Step 9: Test workflow restart
      const restartResponse = await request(app)
        .post(`/api/workflows/${cancelWorkflowId}/restart`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(restartResponse.body.success).toBe(true);
      expect(restartResponse.body.data).toHaveProperty('newWorkflowId');

      // Step 10: Test user workflows endpoint
      const userWorkflowsResponse = await request(app)
        .get('/api/workflows')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(userWorkflowsResponse.body.success).toBe(true);
      expect(userWorkflowsResponse.body.data.workflows).toBeTruthy();
      expect(userWorkflowsResponse.body.data.total).toBeGreaterThan(0);

      // Step 11: Test project workflows endpoint
      const projectWorkflowsResponse = await request(app)
        .get(`/api/projects/${testProject.id}/workflows`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(projectWorkflowsResponse.body.success).toBe(true);
      expect(projectWorkflowsResponse.body.data.projectId).toBe(testProject.id);
      expect(projectWorkflowsResponse.body.data.workflows).toBeTruthy();
      expect(projectWorkflowsResponse.body.data.total).toBeGreaterThan(0);
    }, 60000); // 60 second timeout for this comprehensive test

    it('should handle workflow errors gracefully', async () => {
      // Create a project with no images to trigger an error
      const emptyProject = await projectRepo.create({
        userId: testUser.id,
        name: 'Empty Project',
        description: 'Project with no images for error testing'
      });

      try {
        const response = await request(app)
          .post(`/api/projects/${emptyProject.id}/workflow`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({})
          .expect(500);

        expect(response.body.error).toBeTruthy();
        expect(response.body.details).toContain('No images found');

      } finally {
        await projectRepo.deleteById(emptyProject.id);
      }
    });

    it('should handle concurrent workflows correctly', async () => {
      // Create multiple projects
      const projects = await Promise.all([
        projectRepo.create({
          userId: testUser.id,
          name: 'Concurrent Project 1',
          description: 'First concurrent project'
        }),
        projectRepo.create({
          userId: testUser.id,
          name: 'Concurrent Project 2',
          description: 'Second concurrent project'
        })
      ]);

      try {
        // Add images to both projects
        for (const project of projects) {
          const image = await imageRepo.create({
            projectId: project.id,
            originalUrl: 'https://example.com/concurrent-test.jpg',
            filename: 'concurrent-test.jpg',
            fileSize: 1024000,
            mimeType: 'image/jpeg'
          });

          await imageRepo.updateById(image.id, {
            processingStatus: 'completed',
            ocrResults: {
              extractedText: [{
                id: `text-${image.id}-1`,
                text: 'Concurrent test note',
                confidence: 0.95,
                boundingBox: { left: 10, top: 10, width: 100, height: 20 },
                type: 'LINE' as const
              }],
              boundingBoxes: [{ left: 10, top: 10, width: 100, height: 20 }],
              confidence: 0.95,
              processingTime: 1000
            }
          });

          await noteRepo.create({
            imageId: image.id,
            projectId: project.id,
            originalText: 'Concurrent test note',
            cleanedText: 'Concurrent test note',
            boundingBox: { left: 10, top: 10, width: 100, height: 20 },
            confidence: 0.95
          });
        }

        // Start workflows for both projects simultaneously
        const workflowPromises = projects.map(project =>
          request(app)
            .post(`/api/projects/${project.id}/workflow`)
            .set('Authorization', `Bearer ${authToken}`)
            .send({ autoProcessing: false })
        );

        const responses = await Promise.all(workflowPromises);

        // Both workflows should start successfully
        for (const response of responses) {
          expect(response.status).toBe(200);
          expect(response.body.success).toBe(true);
          expect(response.body.data).toHaveProperty('workflowId');
        }

        // Verify both workflows are tracked
        const userWorkflowsResponse = await request(app)
          .get('/api/workflows')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(userWorkflowsResponse.body.data.total).toBeGreaterThanOrEqual(2);

      } finally {
        // Cleanup
        for (const project of projects) {
          await noteRepo.deleteByProjectId(project.id);
          await imageRepo.deleteByProjectId(project.id);
          await projectRepo.deleteById(project.id);
        }
      }
    });

    it('should validate workflow configuration properly', async () => {
      // Test invalid clustering method
      const invalidConfigResponse = await request(app)
        .post(`/api/projects/${testProject.id}/workflow`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          clusteringMethod: 'invalid-method',
          targetClusters: -1,
          summaryOptions: {
            maxThemes: 100
          }
        })
        .expect(200); // Should still start with default values

      expect(invalidConfigResponse.body.success).toBe(true);
    });

    it('should handle authentication and authorization correctly', async () => {
      // Test without authentication
      await request(app)
        .post(`/api/projects/${testProject.id}/workflow`)
        .send({})
        .expect(401);

      // Test with invalid token
      await request(app)
        .post(`/api/projects/${testProject.id}/workflow`)
        .set('Authorization', 'Bearer invalid-token')
        .send({})
        .expect(401);

      // Test accessing another user's project
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

      try {
        await request(app)
          .post(`/api/projects/${otherProject.id}/workflow`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({})
          .expect(403);

      } finally {
        await projectRepo.deleteById(otherProject.id);
        await userRepo.deleteById(otherUser.id);
      }
    });
  });

  describe('Workflow State Management', () => {
    it('should maintain workflow state correctly throughout execution', async () => {
      const workflowService = getWorkflowService();
      expect(workflowService).toBeTruthy();

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

      // Check initial state
      const initialState = await workflowService.getWorkflowStatus(workflowId);
      expect(initialState).toBeTruthy();
      expect(initialState?.status).toBe('running');
      expect(initialState?.progress).toBeGreaterThanOrEqual(0);
      expect(initialState?.currentStage).toBeTruthy();

      // Check workflow is in active workflows
      const activeWorkflows = workflowService.getActiveWorkflows();
      expect(activeWorkflows.some(w => w.workflowId === workflowId)).toBe(true);

      // Check user workflows
      const userWorkflows = workflowService.getUserWorkflows(testUser.id);
      expect(userWorkflows.some(w => w.workflowId === workflowId)).toBe(true);

      // Check project workflows
      const projectWorkflows = workflowService.getProjectWorkflows(testProject.id);
      expect(projectWorkflows.some(w => w.workflowId === workflowId)).toBe(true);
    });

    it('should handle workflow rollback on errors', async () => {
      // This test would require more complex mocking to simulate failures
      // at different stages and verify rollback behavior
      expect(true).toBe(true); // Placeholder for now
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle multiple concurrent workflows efficiently', async () => {
      const startTime = Date.now();
      const concurrentCount = 5;
      
      // Create multiple projects
      const projects = await Promise.all(
        Array.from({ length: concurrentCount }, (_, i) =>
          projectRepo.create({
            userId: testUser.id,
            name: `Performance Test Project ${i + 1}`,
            description: `Project ${i + 1} for performance testing`
          })
        )
      );

      try {
        // Add minimal data to each project
        for (const project of projects) {
          const image = await imageRepo.create({
            projectId: project.id,
            originalUrl: `https://example.com/perf-test-${project.id}.jpg`,
            filename: `perf-test-${project.id}.jpg`,
            fileSize: 1024000,
            mimeType: 'image/jpeg'
          });

          await imageRepo.updateById(image.id, {
            processingStatus: 'completed',
            ocrResults: {
              extractedText: [{
                id: `text-${image.id}-1`,
                text: `Performance test note for project ${project.id}`,
                confidence: 0.95,
                boundingBox: { left: 10, top: 10, width: 200, height: 20 },
                type: 'LINE' as const
              }],
              boundingBoxes: [{ left: 10, top: 10, width: 200, height: 20 }],
              confidence: 0.95,
              processingTime: 500
            }
          });
        }

        // Start all workflows concurrently
        const workflowPromises = projects.map(project =>
          request(app)
            .post(`/api/projects/${project.id}/workflow`)
            .set('Authorization', `Bearer ${authToken}`)
            .send({ autoProcessing: false })
        );

        const responses = await Promise.all(workflowPromises);
        const endTime = Date.now();
        const totalTime = endTime - startTime;

        // All workflows should start successfully
        for (const response of responses) {
          expect(response.status).toBe(200);
          expect(response.body.success).toBe(true);
        }

        // Should complete within reasonable time (adjust based on system performance)
        expect(totalTime).toBeLessThan(10000); // 10 seconds

        console.log(`Started ${concurrentCount} concurrent workflows in ${totalTime}ms`);

      } finally {
        // Cleanup
        for (const project of projects) {
          await imageRepo.deleteByProjectId(project.id);
          await projectRepo.deleteById(project.id);
        }
      }
    });
  });
});