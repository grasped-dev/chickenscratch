import { v4 as uuidv4 } from 'uuid';
import { WorkflowService, WorkflowState, WorkflowStage } from './workflow.js';
import { getJobQueueService } from './jobQueue.js';
import { ProjectRepository } from '../models/ProjectRepository.js';
import { ProcessedImageRepository } from '../models/ProcessedImageRepository.js';
import { NoteRepository } from '../models/NoteRepository.js';
import { ClusterRepository } from '../models/ClusterRepository.js';
import { getWebSocketService } from './websocket.js';
import { logger } from '../utils/logger.js';

export interface RollbackAction {
  stage: WorkflowStage;
  action: 'delete' | 'update' | 'restore';
  entityType: 'project' | 'image' | 'note' | 'cluster';
  entityId: string;
  previousState?: any;
  rollbackData?: any;
}

export interface WorkflowCheckpoint {
  workflowId: string;
  stage: WorkflowStage;
  timestamp: Date;
  projectState: any;
  rollbackActions: RollbackAction[];
}

export class WorkflowOrchestrator {
  private workflowService: WorkflowService;
  private projectRepo: ProjectRepository;
  private imageRepo: ProcessedImageRepository;
  private noteRepo: NoteRepository;
  private clusterRepo: ClusterRepository;
  private checkpoints: Map<string, WorkflowCheckpoint[]> = new Map();

  constructor(workflowService: WorkflowService) {
    this.workflowService = workflowService;
    this.projectRepo = new ProjectRepository();
    this.imageRepo = new ProcessedImageRepository();
    this.noteRepo = new NoteRepository();
    this.clusterRepo = new ClusterRepository();
  }

  /**
   * Create a checkpoint before starting a workflow stage
   */
  async createCheckpoint(
    workflowId: string,
    stage: WorkflowStage,
    rollbackActions: RollbackAction[] = []
  ): Promise<void> {
    try {
      const workflow = await this.workflowService.getWorkflowStatus(workflowId);
      if (!workflow) {
        throw new Error(`Workflow ${workflowId} not found`);
      }

      // Get current project state
      const project = await this.projectRepo.findById(workflow.projectId);
      const images = await this.imageRepo.findByProjectId(workflow.projectId);
      const notes = await this.noteRepo.findByProjectId(workflow.projectId);
      const clusters = await this.clusterRepo.findByProjectId(workflow.projectId);

      const checkpoint: WorkflowCheckpoint = {
        workflowId,
        stage,
        timestamp: new Date(),
        projectState: {
          project,
          images,
          notes,
          clusters
        },
        rollbackActions
      };

      // Store checkpoint
      const workflowCheckpoints = this.checkpoints.get(workflowId) || [];
      workflowCheckpoints.push(checkpoint);
      this.checkpoints.set(workflowId, workflowCheckpoints);

      logger.info(`Created checkpoint for workflow ${workflowId} at stage ${stage}`);

    } catch (error) {
      logger.error(`Failed to create checkpoint for workflow ${workflowId}:`, error);
      throw error;
    }
  }

  /**
   * Rollback workflow to a specific stage
   */
  async rollbackToStage(workflowId: string, targetStage: WorkflowStage): Promise<void> {
    try {
      const checkpoints = this.checkpoints.get(workflowId);
      if (!checkpoints || checkpoints.length === 0) {
        throw new Error(`No checkpoints found for workflow ${workflowId}`);
      }

      // Find the checkpoint for the target stage
      const targetCheckpoint = checkpoints
        .reverse()
        .find(cp => cp.stage === targetStage);

      if (!targetCheckpoint) {
        throw new Error(`No checkpoint found for stage ${targetStage} in workflow ${workflowId}`);
      }

      logger.info(`Starting rollback for workflow ${workflowId} to stage ${targetStage}`);

      // Execute rollback actions in reverse order
      const rollbackActions = checkpoints
        .filter(cp => cp.timestamp > targetCheckpoint.timestamp)
        .flatMap(cp => cp.rollbackActions)
        .reverse();

      for (const action of rollbackActions) {
        await this.executeRollbackAction(action);
      }

      // Restore project state
      await this.restoreProjectState(workflowId, targetCheckpoint.projectState);

      // Update workflow state
      const workflow = await this.workflowService.getWorkflowStatus(workflowId);
      if (workflow) {
        workflow.currentStage = targetStage;
        workflow.status = 'running';
        workflow.error = undefined;
        
        // Recalculate progress based on stage
        workflow.progress = this.getStageProgress(targetStage);
      }

      // Remove checkpoints after the target stage
      const remainingCheckpoints = checkpoints.filter(cp => cp.timestamp <= targetCheckpoint.timestamp);
      this.checkpoints.set(workflowId, remainingCheckpoints);

      // Notify about rollback
      const wsService = getWebSocketService();
      if (wsService && workflow) {
        wsService.sendWorkflowProgress(workflow.userId, {
          workflowId,
          projectId: workflow.projectId,
          stage: targetStage,
          progress: workflow.progress,
          message: `Rolled back to ${targetStage}`,
          error: undefined
        });
      }

      logger.info(`Successfully rolled back workflow ${workflowId} to stage ${targetStage}`);

    } catch (error) {
      logger.error(`Failed to rollback workflow ${workflowId} to stage ${targetStage}:`, error);
      throw error;
    }
  }

  /**
   * Execute a single rollback action
   */
  private async executeRollbackAction(action: RollbackAction): Promise<void> {
    try {
      switch (action.entityType) {
        case 'project':
          await this.rollbackProject(action);
          break;
        case 'image':
          await this.rollbackImage(action);
          break;
        case 'note':
          await this.rollbackNote(action);
          break;
        case 'cluster':
          await this.rollbackCluster(action);
          break;
        default:
          logger.warn(`Unknown entity type for rollback: ${action.entityType}`);
      }
    } catch (error) {
      logger.error(`Failed to execute rollback action:`, action, error);
      throw error;
    }
  }

  /**
   * Rollback project changes
   */
  private async rollbackProject(action: RollbackAction): Promise<void> {
    switch (action.action) {
      case 'update':
        if (action.previousState) {
          await this.projectRepo.update(action.entityId, action.previousState);
        }
        break;
      case 'delete':
        // Projects are typically not deleted during workflow, so this might not be needed
        break;
      case 'restore':
        if (action.rollbackData) {
          await this.projectRepo.update(action.entityId, action.rollbackData);
        }
        break;
    }
  }

  /**
   * Rollback image changes
   */
  private async rollbackImage(action: RollbackAction): Promise<void> {
    switch (action.action) {
      case 'update':
        if (action.previousState) {
          await this.imageRepo.update(action.entityId, action.previousState);
        }
        break;
      case 'delete':
        if (action.rollbackData) {
          await this.imageRepo.create(action.rollbackData);
        }
        break;
      case 'restore':
        if (action.rollbackData) {
          await this.imageRepo.update(action.entityId, action.rollbackData);
        }
        break;
    }
  }

  /**
   * Rollback note changes
   */
  private async rollbackNote(action: RollbackAction): Promise<void> {
    switch (action.action) {
      case 'update':
        if (action.previousState) {
          await this.noteRepo.update(action.entityId, action.previousState);
        }
        break;
      case 'delete':
        if (action.rollbackData) {
          await this.noteRepo.create(action.rollbackData);
        }
        break;
      case 'restore':
        if (action.rollbackData) {
          await this.noteRepo.update(action.entityId, action.rollbackData);
        }
        break;
    }
  }

  /**
   * Rollback cluster changes
   */
  private async rollbackCluster(action: RollbackAction): Promise<void> {
    switch (action.action) {
      case 'update':
        if (action.previousState) {
          await this.clusterRepo.update(action.entityId, action.previousState);
        }
        break;
      case 'delete':
        await this.clusterRepo.deleteById(action.entityId);
        break;
      case 'restore':
        if (action.rollbackData) {
          await this.clusterRepo.create(action.rollbackData);
        }
        break;
    }
  }

  /**
   * Restore project state from checkpoint
   */
  private async restoreProjectState(workflowId: string, projectState: any): Promise<void> {
    try {
      // This is a simplified version - in a real implementation,
      // you might want to be more selective about what gets restored
      
      if (projectState.project) {
        await this.projectRepo.update(projectState.project.id, {
          status: projectState.project.status,
          summary: projectState.project.summary,
          updatedAt: new Date()
        });
      }

      logger.info(`Restored project state for workflow ${workflowId}`);

    } catch (error) {
      logger.error(`Failed to restore project state for workflow ${workflowId}:`, error);
      throw error;
    }
  }

  /**
   * Get progress percentage for a given stage
   */
  private getStageProgress(stage: WorkflowStage): number {
    const stageProgress: Record<WorkflowStage, number> = {
      [WorkflowStage.UPLOAD]: 20,
      [WorkflowStage.OCR_PROCESSING]: 35,
      [WorkflowStage.TEXT_CLEANING]: 55,
      [WorkflowStage.CLUSTERING]: 75,
      [WorkflowStage.SUMMARY_GENERATION]: 90,
      [WorkflowStage.EXPORT_GENERATION]: 98,
      [WorkflowStage.COMPLETED]: 100
    };

    return stageProgress[stage] || 0;
  }

  /**
   * Handle workflow failure with automatic rollback
   */
  async handleWorkflowFailure(
    workflowId: string,
    error: Error,
    currentStage: WorkflowStage
  ): Promise<void> {
    try {
      logger.error(`Workflow ${workflowId} failed at stage ${currentStage}:`, error);

      const workflow = await this.workflowService.getWorkflowStatus(workflowId);
      if (!workflow) {
        throw new Error(`Workflow ${workflowId} not found`);
      }

      // Determine rollback strategy based on stage and error type
      const rollbackStage = this.determineRollbackStage(currentStage, error);

      if (rollbackStage && rollbackStage !== currentStage) {
        logger.info(`Attempting automatic rollback to stage ${rollbackStage}`);
        await this.rollbackToStage(workflowId, rollbackStage);

        // Notify about rollback attempt
        const wsService = getWebSocketService();
        if (wsService) {
          wsService.sendWorkflowProgress(workflow.userId, {
            workflowId,
            projectId: workflow.projectId,
            stage: rollbackStage,
            progress: this.getStageProgress(rollbackStage),
            message: `Automatic rollback to ${rollbackStage} due to error`,
            error: error.message
          });
        }
      } else {
        // Mark workflow as failed
        workflow.status = 'failed';
        workflow.error = error.message;
        workflow.completedAt = new Date();

        // Update project status
        await this.projectRepo.updateStatus(workflow.projectId, 'failed');

        // Notify about failure
        const wsService = getWebSocketService();
        if (wsService) {
          wsService.sendWorkflowStatus(workflow.userId, {
            workflowId,
            projectId: workflow.projectId,
            status: 'failed',
            currentStage,
            progress: workflow.progress,
            startedAt: workflow.startedAt,
            completedAt: workflow.completedAt,
            error: error.message
          });
        }
      }

    } catch (rollbackError) {
      logger.error(`Failed to handle workflow failure for ${workflowId}:`, rollbackError);
      
      // Mark workflow as failed if rollback also fails
      const workflow = await this.workflowService.getWorkflowStatus(workflowId);
      if (workflow) {
        workflow.status = 'failed';
        workflow.error = `Original error: ${error.message}. Rollback error: ${rollbackError instanceof Error ? rollbackError.message : 'Unknown error'}`;
        workflow.completedAt = new Date();
      }
    }
  }

  /**
   * Determine appropriate rollback stage based on error and current stage
   */
  private determineRollbackStage(currentStage: WorkflowStage, error: Error): WorkflowStage | null {
    const errorMessage = error.message.toLowerCase();

    // Define rollback strategies based on error patterns
    if (errorMessage.includes('timeout') || errorMessage.includes('network')) {
      // For network/timeout errors, retry from the same stage
      return currentStage;
    }

    if (errorMessage.includes('invalid') || errorMessage.includes('malformed')) {
      // For data validation errors, go back to previous stage
      switch (currentStage) {
        case WorkflowStage.TEXT_CLEANING:
          return WorkflowStage.OCR_PROCESSING;
        case WorkflowStage.CLUSTERING:
          return WorkflowStage.TEXT_CLEANING;
        case WorkflowStage.SUMMARY_GENERATION:
          return WorkflowStage.CLUSTERING;
        case WorkflowStage.EXPORT_GENERATION:
          return WorkflowStage.SUMMARY_GENERATION;
        default:
          return null;
      }
    }

    if (errorMessage.includes('quota') || errorMessage.includes('rate limit')) {
      // For quota/rate limit errors, wait and retry from same stage
      return currentStage;
    }

    // For unknown errors, don't attempt automatic rollback
    return null;
  }

  /**
   * Clean up checkpoints for completed or failed workflows
   */
  async cleanupCheckpoints(workflowId: string): Promise<void> {
    this.checkpoints.delete(workflowId);
    logger.info(`Cleaned up checkpoints for workflow ${workflowId}`);
  }

  /**
   * Get checkpoint history for a workflow
   */
  getCheckpointHistory(workflowId: string): WorkflowCheckpoint[] {
    return this.checkpoints.get(workflowId) || [];
  }

  /**
   * Validate workflow state consistency
   */
  async validateWorkflowState(workflowId: string): Promise<{
    valid: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];

    try {
      const workflow = await this.workflowService.getWorkflowStatus(workflowId);
      if (!workflow) {
        issues.push('Workflow not found');
        return { valid: false, issues };
      }

      // Check project exists
      const project = await this.projectRepo.findById(workflow.projectId);
      if (!project) {
        issues.push('Associated project not found');
      }

      // Check images exist if past upload stage
      if (workflow.currentStage !== WorkflowStage.UPLOAD) {
        const images = await this.imageRepo.findByProjectId(workflow.projectId);
        if (images.length === 0) {
          issues.push('No images found for project');
        }
      }

      // Check notes exist if past OCR stage
      if ([
        WorkflowStage.TEXT_CLEANING,
        WorkflowStage.CLUSTERING,
        WorkflowStage.SUMMARY_GENERATION,
        WorkflowStage.EXPORT_GENERATION,
        WorkflowStage.COMPLETED
      ].includes(workflow.currentStage)) {
        const notes = await this.noteRepo.findByProjectId(workflow.projectId);
        if (notes.length === 0) {
          issues.push('No notes found for project');
        }
      }

      // Check clusters exist if past clustering stage
      if ([
        WorkflowStage.SUMMARY_GENERATION,
        WorkflowStage.EXPORT_GENERATION,
        WorkflowStage.COMPLETED
      ].includes(workflow.currentStage)) {
        const clusters = await this.clusterRepo.findByProjectId(workflow.projectId);
        if (clusters.length === 0) {
          issues.push('No clusters found for project');
        }
      }

      return {
        valid: issues.length === 0,
        issues
      };

    } catch (error) {
      issues.push(`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return { valid: false, issues };
    }
  }

  /**
   * Get workflow health status
   */
  async getWorkflowHealth(): Promise<{
    activeWorkflows: number;
    failedWorkflows: number;
    averageProcessingTime: number;
    checkpointCount: number;
  }> {
    const activeWorkflows = this.workflowService.getActiveWorkflows();
    
    const failedWorkflows = activeWorkflows.filter(w => w.status === 'failed').length;
    
    const completedWorkflows = activeWorkflows.filter(w => w.status === 'completed');
    const averageProcessingTime = completedWorkflows.length > 0
      ? completedWorkflows.reduce((sum, w) => {
          const duration = w.completedAt 
            ? new Date(w.completedAt).getTime() - new Date(w.startedAt).getTime()
            : 0;
          return sum + duration;
        }, 0) / completedWorkflows.length
      : 0;

    const checkpointCount = Array.from(this.checkpoints.values())
      .reduce((sum, checkpoints) => sum + checkpoints.length, 0);

    return {
      activeWorkflows: activeWorkflows.length,
      failedWorkflows,
      averageProcessingTime,
      checkpointCount
    };
  }
}

// Singleton instance
let workflowOrchestrator: WorkflowOrchestrator | null = null;

export const initializeWorkflowOrchestrator = (workflowService: WorkflowService): WorkflowOrchestrator => {
  if (!workflowOrchestrator) {
    workflowOrchestrator = new WorkflowOrchestrator(workflowService);
  }
  return workflowOrchestrator;
};

export const getWorkflowOrchestrator = (): WorkflowOrchestrator | null => {
  return workflowOrchestrator;
};