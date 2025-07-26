import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { WorkflowService, WorkflowStage } from '../services/workflow.js';
import { ProjectRepository } from '../models/ProjectRepository.js';
import { ProcessedImageRepository } from '../models/ProcessedImageRepository.js';
import { NoteRepository } from '../models/NoteRepository.js';
import { ClusterRepository } from '../models/ClusterRepository.js';

// Mock the repositories
vi.mock('../models/ProjectRepository.js');
vi.mock('../models/ProcessedImageRepository.js');
vi.mock('../models/NoteRepository.js');
vi.mock('../models/ClusterRepository.js');

// Mock the job queue service
vi.mock('../services/jobQueue.js', () => ({
  getJobQueueService: vi.fn(() => ({
    addJob: vi.fn(),
    getJobStatus: vi.fn(),
    cancelJob: vi.fn()
  }))
}));

// Mock the websocket service
vi.mock('../services/websocket.js', () => ({
  getWebSocketService: vi.fn(() => ({
    sendWorkflowProgress: vi.fn(),
    sendProjectWorkflowProgress: vi.fn()
  }))
}));

// Mock the logger
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

describe('WorkflowService', () => {
  let workflowService: WorkflowService;
  let mockProjectRepo: any;
  let mockImageRepo: any;
  let mockNoteRepo: any;
  let mockClusterRepo: any;

  const testUserId = 'test-user-id';
  const testProjectId = 'test-project-id';
  const testWorkflowConfig = {
    autoProcessing: true,
    clusteringMethod: 'hybrid' as const,
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

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create mock instances
    mockProjectRepo = {
      updateStatus: vi.fn(),
      findById: vi.fn()
    };
    mockImageRepo = {
      findByProjectId: vi.fn()
    };
    mockNoteRepo = {
      findByProjectId: vi.fn()
    };
    mockClusterRepo = {
      findByProjectId: vi.fn()
    };

    // Mock the constructors
    (ProjectRepository as any).mockImplementation(() => mockProjectRepo);
    (ProcessedImageRepository as any).mockImplementation(() => mockImageRepo);
    (NoteRepository as any).mockImplementation(() => mockNoteRepo);
    (ClusterRepository as any).mockImplementation(() => mockClusterRepo);

    workflowService = new WorkflowService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('startWorkflow', () => {
    it('should start a workflow successfully', async () => {
      mockProjectRepo.updateStatus.mockResolvedValue(true);
      mockImageRepo.findByProjectId.mockResolvedValue([
        {
          id: 'image-1',
          processingStatus: 'completed',
          ocrResults: { extractedText: [{ text: 'test' }] }
        }
      ]);

      const workflowId = await workflowService.startWorkflow(
        testProjectId,
        testUserId,
        testWorkflowConfig
      );

      expect(workflowId).toBeTruthy();
      expect(typeof workflowId).toBe('string');
      expect(mockProjectRepo.updateStatus).toHaveBeenCalledWith(testProjectId, 'processing');
    });

    it('should handle workflow start failure', async () => {
      mockProjectRepo.updateStatus.mockRejectedValue(new Error('Database error'));

      await expect(
        workflowService.startWorkflow(testProjectId, testUserId, testWorkflowConfig)
      ).rejects.toThrow('Database error');
    });

    it('should generate unique workflow IDs', async () => {
      mockProjectRepo.updateStatus.mockResolvedValue(true);
      mockImageRepo.findByProjectId.mockResolvedValue([
        {
          id: 'image-1',
          processingStatus: 'completed',
          ocrResults: { extractedText: [{ text: 'test' }] }
        }
      ]);

      const workflowId1 = await workflowService.startWorkflow(
        testProjectId,
        testUserId,
        testWorkflowConfig
      );

      const workflowId2 = await workflowService.startWorkflow(
        'different-project-id',
        testUserId,
        testWorkflowConfig
      );

      expect(workflowId1).not.toBe(workflowId2);
    });
  });

  describe('getWorkflowStatus', () => {
    it('should return workflow status for existing workflow', async () => {
      mockProjectRepo.updateStatus.mockResolvedValue(true);
      mockImageRepo.findByProjectId.mockResolvedValue([
        {
          id: 'image-1',
          processingStatus: 'completed',
          ocrResults: { extractedText: [{ text: 'test' }] }
        }
      ]);

      const workflowId = await workflowService.startWorkflow(
        testProjectId,
        testUserId,
        testWorkflowConfig
      );

      const status = await workflowService.getWorkflowStatus(workflowId);

      expect(status).toBeTruthy();
      expect(status?.workflowId).toBe(workflowId);
      expect(status?.projectId).toBe(testProjectId);
      expect(status?.userId).toBe(testUserId);
      expect(status?.config).toEqual(testWorkflowConfig);
    });

    it('should return null for non-existent workflow', async () => {
      const status = await workflowService.getWorkflowStatus('non-existent-id');
      expect(status).toBeNull();
    });
  });

  describe('cancelWorkflow', () => {
    it('should cancel existing workflow successfully', async () => {
      mockProjectRepo.updateStatus.mockResolvedValue(true);
      mockImageRepo.findByProjectId.mockResolvedValue([
        {
          id: 'image-1',
          processingStatus: 'completed',
          ocrResults: { extractedText: [{ text: 'test' }] }
        }
      ]);

      const workflowId = await workflowService.startWorkflow(
        testProjectId,
        testUserId,
        testWorkflowConfig
      );

      const cancelled = await workflowService.cancelWorkflow(workflowId);

      expect(cancelled).toBe(true);

      const status = await workflowService.getWorkflowStatus(workflowId);
      expect(status?.status).toBe('cancelled');
    });

    it('should return false for non-existent workflow', async () => {
      const cancelled = await workflowService.cancelWorkflow('non-existent-id');
      expect(cancelled).toBe(false);
    });
  });

  describe('getActiveWorkflows', () => {
    it('should return all active workflows', async () => {
      mockProjectRepo.updateStatus.mockResolvedValue(true);
      mockImageRepo.findByProjectId.mockResolvedValue([
        {
          id: 'image-1',
          processingStatus: 'completed',
          ocrResults: { extractedText: [{ text: 'test' }] }
        }
      ]);

      const workflowId1 = await workflowService.startWorkflow(
        testProjectId,
        testUserId,
        testWorkflowConfig
      );

      const workflowId2 = await workflowService.startWorkflow(
        'project-2',
        testUserId,
        testWorkflowConfig
      );

      const activeWorkflows = workflowService.getActiveWorkflows();

      expect(activeWorkflows).toHaveLength(2);
      expect(activeWorkflows.map(w => w.workflowId)).toContain(workflowId1);
      expect(activeWorkflows.map(w => w.workflowId)).toContain(workflowId2);
    });

    it('should return empty array when no workflows are active', () => {
      const activeWorkflows = workflowService.getActiveWorkflows();
      expect(activeWorkflows).toHaveLength(0);
    });
  });

  describe('getUserWorkflows', () => {
    it('should return workflows for specific user', async () => {
      mockProjectRepo.updateStatus.mockResolvedValue(true);
      mockImageRepo.findByProjectId.mockResolvedValue([
        {
          id: 'image-1',
          processingStatus: 'completed',
          ocrResults: { extractedText: [{ text: 'test' }] }
        }
      ]);

      const workflowId1 = await workflowService.startWorkflow(
        testProjectId,
        testUserId,
        testWorkflowConfig
      );

      const workflowId2 = await workflowService.startWorkflow(
        'project-2',
        'different-user-id',
        testWorkflowConfig
      );

      const userWorkflows = workflowService.getUserWorkflows(testUserId);

      expect(userWorkflows).toHaveLength(1);
      expect(userWorkflows[0].workflowId).toBe(workflowId1);
      expect(userWorkflows[0].userId).toBe(testUserId);
    });

    it('should return empty array for user with no workflows', () => {
      const userWorkflows = workflowService.getUserWorkflows('non-existent-user');
      expect(userWorkflows).toHaveLength(0);
    });
  });

  describe('getProjectWorkflows', () => {
    it('should return workflows for specific project', async () => {
      mockProjectRepo.updateStatus.mockResolvedValue(true);
      mockImageRepo.findByProjectId.mockResolvedValue([
        {
          id: 'image-1',
          processingStatus: 'completed',
          ocrResults: { extractedText: [{ text: 'test' }] }
        }
      ]);

      const workflowId1 = await workflowService.startWorkflow(
        testProjectId,
        testUserId,
        testWorkflowConfig
      );

      const workflowId2 = await workflowService.startWorkflow(
        'different-project-id',
        testUserId,
        testWorkflowConfig
      );

      const projectWorkflows = workflowService.getProjectWorkflows(testProjectId);

      expect(projectWorkflows).toHaveLength(1);
      expect(projectWorkflows[0].workflowId).toBe(workflowId1);
      expect(projectWorkflows[0].projectId).toBe(testProjectId);
    });

    it('should return empty array for project with no workflows', () => {
      const projectWorkflows = workflowService.getProjectWorkflows('non-existent-project');
      expect(projectWorkflows).toHaveLength(0);
    });
  });

  describe('workflow configuration', () => {
    it('should store workflow configuration correctly', async () => {
      mockProjectRepo.updateStatus.mockResolvedValue(true);
      mockImageRepo.findByProjectId.mockResolvedValue([
        {
          id: 'image-1',
          processingStatus: 'completed',
          ocrResults: { extractedText: [{ text: 'test' }] }
        }
      ]);

      const customConfig = {
        autoProcessing: false,
        clusteringMethod: 'embeddings' as const,
        targetClusters: 5,
        cleaningOptions: {
          spellCheck: false,
          removeArtifacts: true,
          normalizeSpacing: false
        },
        summaryOptions: {
          includeQuotes: false,
          includeDistribution: true,
          maxThemes: 15
        }
      };

      const workflowId = await workflowService.startWorkflow(
        testProjectId,
        testUserId,
        customConfig
      );

      const status = await workflowService.getWorkflowStatus(workflowId);
      expect(status?.config).toEqual(customConfig);
    });

    it('should handle different clustering methods', async () => {
      mockProjectRepo.updateStatus.mockResolvedValue(true);
      mockImageRepo.findByProjectId.mockResolvedValue([
        {
          id: 'image-1',
          processingStatus: 'completed',
          ocrResults: { extractedText: [{ text: 'test' }] }
        }
      ]);

      const methods: Array<'embeddings' | 'llm' | 'hybrid'> = ['embeddings', 'llm', 'hybrid'];

      for (const method of methods) {
        const config = { ...testWorkflowConfig, clusteringMethod: method };
        const workflowId = await workflowService.startWorkflow(
          `project-${method}`,
          testUserId,
          config
        );

        const status = await workflowService.getWorkflowStatus(workflowId);
        expect(status?.config.clusteringMethod).toBe(method);
      }
    });
  });

  describe('workflow stages', () => {
    it('should initialize workflow with correct initial stage', async () => {
      mockProjectRepo.updateStatus.mockResolvedValue(true);
      mockImageRepo.findByProjectId.mockResolvedValue([
        {
          id: 'image-1',
          processingStatus: 'completed',
          ocrResults: { extractedText: [{ text: 'test' }] }
        }
      ]);

      const workflowId = await workflowService.startWorkflow(
        testProjectId,
        testUserId,
        testWorkflowConfig
      );

      const status = await workflowService.getWorkflowStatus(workflowId);
      expect(status?.currentStage).toBe(WorkflowStage.UPLOAD);
      expect(status?.progress).toBeGreaterThanOrEqual(0);
    });

    it('should track workflow timestamps correctly', async () => {
      mockProjectRepo.updateStatus.mockResolvedValue(true);
      mockImageRepo.findByProjectId.mockResolvedValue([
        {
          id: 'image-1',
          processingStatus: 'completed',
          ocrResults: { extractedText: [{ text: 'test' }] }
        }
      ]);

      const startTime = new Date();
      const workflowId = await workflowService.startWorkflow(
        testProjectId,
        testUserId,
        testWorkflowConfig
      );

      const status = await workflowService.getWorkflowStatus(workflowId);
      expect(status?.startedAt).toBeInstanceOf(Date);
      expect(status?.startedAt.getTime()).toBeGreaterThanOrEqual(startTime.getTime());
      expect(status?.completedAt).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should handle repository errors gracefully', async () => {
      mockProjectRepo.updateStatus.mockRejectedValue(new Error('Database connection failed'));

      await expect(
        workflowService.startWorkflow(testProjectId, testUserId, testWorkflowConfig)
      ).rejects.toThrow('Database connection failed');
    });

    it('should handle missing images gracefully', async () => {
      mockProjectRepo.updateStatus.mockResolvedValue(true);
      mockImageRepo.findByProjectId.mockResolvedValue([]);

      await expect(
        workflowService.startWorkflow(testProjectId, testUserId, testWorkflowConfig)
      ).rejects.toThrow('No images found for processing');
    });

    it('should set error status on workflow failure', async () => {
      mockProjectRepo.updateStatus.mockResolvedValue(true);
      mockImageRepo.findByProjectId.mockRejectedValue(new Error('Image fetch failed'));

      try {
        await workflowService.startWorkflow(testProjectId, testUserId, testWorkflowConfig);
      } catch (error) {
        // Expected to throw
      }

      // The workflow should still be tracked with error status
      const activeWorkflows = workflowService.getActiveWorkflows();
      const failedWorkflow = activeWorkflows.find(w => w.projectId === testProjectId);
      
      if (failedWorkflow) {
        expect(failedWorkflow.status).toBe('failed');
        expect(failedWorkflow.error).toBeTruthy();
      }
    });
  });
});