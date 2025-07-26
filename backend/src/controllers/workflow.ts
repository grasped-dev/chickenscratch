import { Request, Response } from 'express';
import { getWorkflowService, WorkflowConfig } from '../services/workflow.js';
import { ProjectRepository } from '../models/ProjectRepository.js';
import { ErrorHandler } from '../utils/errorHandler.js';

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
    name: string;
  };
}

export class WorkflowController {
  private projectRepo: ProjectRepository;

  constructor() {
    this.projectRepo = new ProjectRepository();
  }

  /**
   * Start a new workflow for a project
   */
  async startWorkflow(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      // Verify project ownership
      const project = await this.projectRepo.findById(projectId);
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      if (project.userId !== userId) {
        res.status(403).json({ error: 'Not authorized to access this project' });
        return;
      }

      // Check if project is already being processed
      if (project.status === 'processing') {
        res.status(409).json({ error: 'Project is already being processed' });
        return;
      }

      const workflowService = getWorkflowService();
      if (!workflowService) {
        res.status(503).json({ error: 'Workflow service not available' });
        return;
      }

      // Parse workflow configuration from request body
      const config: WorkflowConfig = {
        autoProcessing: req.body.autoProcessing ?? true,
        clusteringMethod: req.body.clusteringMethod ?? 'hybrid',
        targetClusters: req.body.targetClusters,
        cleaningOptions: {
          spellCheck: req.body.cleaningOptions?.spellCheck ?? true,
          removeArtifacts: req.body.cleaningOptions?.removeArtifacts ?? true,
          normalizeSpacing: req.body.cleaningOptions?.normalizeSpacing ?? true
        },
        summaryOptions: {
          includeQuotes: req.body.summaryOptions?.includeQuotes ?? true,
          includeDistribution: req.body.summaryOptions?.includeDistribution ?? true,
          maxThemes: req.body.summaryOptions?.maxThemes ?? 10
        }
      };

      // Start the workflow
      const workflowId = await workflowService.startWorkflow(projectId, userId, config);

      res.json({
        success: true,
        data: {
          workflowId,
          projectId,
          status: 'started',
          message: 'Workflow started successfully'
        }
      });

    } catch (error) {
      console.error('Error starting workflow:', error);
      res.status(500).json({
        error: 'Failed to start workflow',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get workflow status
   */
  async getWorkflowStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { workflowId } = req.params;
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const workflowService = getWorkflowService();
      if (!workflowService) {
        res.status(503).json({ error: 'Workflow service not available' });
        return;
      }

      const workflow = await workflowService.getWorkflowStatus(workflowId);
      
      if (!workflow) {
        res.status(404).json({ error: 'Workflow not found' });
        return;
      }

      // Check if user owns the workflow
      if (workflow.userId !== userId) {
        res.status(403).json({ error: 'Not authorized to access this workflow' });
        return;
      }

      res.json({
        success: true,
        data: {
          workflowId: workflow.workflowId,
          projectId: workflow.projectId,
          status: workflow.status,
          currentStage: workflow.currentStage,
          progress: workflow.progress,
          startedAt: workflow.startedAt,
          completedAt: workflow.completedAt,
          error: workflow.error,
          config: workflow.config,
          stageResults: workflow.stageResults
        }
      });

    } catch (error) {
      console.error('Error getting workflow status:', error);
      res.status(500).json({
        error: 'Failed to get workflow status',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Cancel a workflow
   */
  async cancelWorkflow(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { workflowId } = req.params;
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const workflowService = getWorkflowService();
      if (!workflowService) {
        res.status(503).json({ error: 'Workflow service not available' });
        return;
      }

      const workflow = await workflowService.getWorkflowStatus(workflowId);
      
      if (!workflow) {
        res.status(404).json({ error: 'Workflow not found' });
        return;
      }

      // Check if user owns the workflow
      if (workflow.userId !== userId) {
        res.status(403).json({ error: 'Not authorized to cancel this workflow' });
        return;
      }

      // Check if workflow can be cancelled
      if (workflow.status === 'completed' || workflow.status === 'failed' || workflow.status === 'cancelled') {
        res.status(400).json({ error: 'Workflow cannot be cancelled in current state' });
        return;
      }

      const cancelled = await workflowService.cancelWorkflow(workflowId);
      
      if (cancelled) {
        res.json({
          success: true,
          message: 'Workflow cancelled successfully'
        });
      } else {
        res.status(500).json({ error: 'Failed to cancel workflow' });
      }

    } catch (error) {
      console.error('Error cancelling workflow:', error);
      res.status(500).json({
        error: 'Failed to cancel workflow',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get user's workflows
   */
  async getUserWorkflows(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const workflowService = getWorkflowService();
      if (!workflowService) {
        res.status(503).json({ error: 'Workflow service not available' });
        return;
      }

      const workflows = workflowService.getUserWorkflows(userId);

      res.json({
        success: true,
        data: {
          workflows: workflows.map(workflow => ({
            workflowId: workflow.workflowId,
            projectId: workflow.projectId,
            status: workflow.status,
            currentStage: workflow.currentStage,
            progress: workflow.progress,
            startedAt: workflow.startedAt,
            completedAt: workflow.completedAt,
            error: workflow.error
          })),
          total: workflows.length
        }
      });

    } catch (error) {
      console.error('Error getting user workflows:', error);
      res.status(500).json({
        error: 'Failed to get user workflows',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get project's workflows
   */
  async getProjectWorkflows(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      // Verify project ownership
      const project = await this.projectRepo.findById(projectId);
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      if (project.userId !== userId) {
        res.status(403).json({ error: 'Not authorized to access this project' });
        return;
      }

      const workflowService = getWorkflowService();
      if (!workflowService) {
        res.status(503).json({ error: 'Workflow service not available' });
        return;
      }

      const workflows = workflowService.getProjectWorkflows(projectId);

      res.json({
        success: true,
        data: {
          projectId,
          workflows: workflows.map(workflow => ({
            workflowId: workflow.workflowId,
            status: workflow.status,
            currentStage: workflow.currentStage,
            progress: workflow.progress,
            startedAt: workflow.startedAt,
            completedAt: workflow.completedAt,
            error: workflow.error
          })),
          total: workflows.length
        }
      });

    } catch (error) {
      console.error('Error getting project workflows:', error);
      res.status(500).json({
        error: 'Failed to get project workflows',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Restart a failed workflow
   */
  async restartWorkflow(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { workflowId } = req.params;
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const workflowService = getWorkflowService();
      if (!workflowService) {
        res.status(503).json({ error: 'Workflow service not available' });
        return;
      }

      const workflow = await workflowService.getWorkflowStatus(workflowId);
      
      if (!workflow) {
        res.status(404).json({ error: 'Workflow not found' });
        return;
      }

      // Check if user owns the workflow
      if (workflow.userId !== userId) {
        res.status(403).json({ error: 'Not authorized to restart this workflow' });
        return;
      }

      // Check if workflow can be restarted
      if (workflow.status !== 'failed') {
        res.status(400).json({ error: 'Only failed workflows can be restarted' });
        return;
      }

      // Start a new workflow with the same configuration
      const newWorkflowId = await workflowService.startWorkflow(
        workflow.projectId,
        workflow.userId,
        workflow.config
      );

      res.json({
        success: true,
        data: {
          newWorkflowId,
          projectId: workflow.projectId,
          status: 'restarted',
          message: 'Workflow restarted successfully'
        }
      });

    } catch (error) {
      console.error('Error restarting workflow:', error);
      res.status(500).json({
        error: 'Failed to restart workflow',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

export const workflowController = new WorkflowController();