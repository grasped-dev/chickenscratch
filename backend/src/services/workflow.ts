import { v4 as uuidv4 } from 'uuid';
import { getJobQueueService, JobType, JobPriority } from './jobQueue.js';
import { ProjectRepository } from '../models/ProjectRepository.js';
import { ProcessedImageRepository } from '../models/ProcessedImageRepository.js';
import { NoteRepository } from '../models/NoteRepository.js';
import { ClusterRepository } from '../models/ClusterRepository.js';
import { getWebSocketService } from './websocket.js';
import { ErrorHandler } from '../utils/errorHandler.js';
import { logger } from '../utils/logger.js';
import type { Project, ProcessedImage } from 'chicken-scratch-shared';

export interface WorkflowConfig {
  autoProcessing: boolean;
  clusteringMethod: 'embeddings' | 'llm' | 'hybrid';
  targetClusters?: number;
  cleaningOptions: {
    spellCheck: boolean;
    removeArtifacts: boolean;
    normalizeSpacing: boolean;
  };
  summaryOptions: {
    includeQuotes: boolean;
    includeDistribution: boolean;
    maxThemes: number;
  };
}

export interface WorkflowState {
  workflowId: string;
  projectId: string;
  userId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  currentStage: WorkflowStage;
  progress: number;
  startedAt: Date;
  completedAt?: Date;
  error?: string;
  config: WorkflowConfig;
  stageResults: Record<WorkflowStage, any>;
  jobIds: Record<WorkflowStage, string[]>;
}

export enum WorkflowStage {
  UPLOAD = 'upload',
  OCR_PROCESSING = 'ocr_processing',
  TEXT_CLEANING = 'text_cleaning',
  CLUSTERING = 'clustering',
  SUMMARY_GENERATION = 'summary_generation',
  EXPORT_GENERATION = 'export_generation',
  COMPLETED = 'completed'
}

export interface WorkflowProgress {
  workflowId: string;
  projectId: string;
  stage: WorkflowStage;
  progress: number;
  message: string;
  stageProgress?: {
    current: number;
    total: number;
    currentItem?: string;
  };
  error?: string;
}

export class WorkflowService {
  private projectRepo: ProjectRepository;
  private imageRepo: ProcessedImageRepository;
  private noteRepo: NoteRepository;
  private clusterRepo: ClusterRepository;
  private activeWorkflows: Map<string, WorkflowState> = new Map();

  constructor() {
    this.projectRepo = new ProjectRepository();
    this.imageRepo = new ProcessedImageRepository();
    this.noteRepo = new NoteRepository();
    this.clusterRepo = new ClusterRepository();
  }

  /**
   * Start a complete processing workflow for a project
   */
  async startWorkflow(
    projectId: string,
    userId: string,
    config: WorkflowConfig
  ): Promise<string> {
    const workflowId = uuidv4();
    
    try {
      // Initialize workflow state
      const workflowState: WorkflowState = {
        workflowId,
        projectId,
        userId,
        status: 'pending',
        currentStage: WorkflowStage.UPLOAD,
        progress: 0,
        startedAt: new Date(),
        config,
        stageResults: {} as Record<WorkflowStage, any>,
        jobIds: {} as Record<WorkflowStage, string[]>
      };

      this.activeWorkflows.set(workflowId, workflowState);

      // Update project status
      await this.projectRepo.updateStatus(projectId, 'processing');

      // Start the workflow
      await this.executeWorkflow(workflowId);

      logger.info(`Workflow ${workflowId} started for project ${projectId}`);
      return workflowId;

    } catch (error) {
      logger.error(`Failed to start workflow for project ${projectId}:`, error);
      await this.handleWorkflowError(workflowId, error);
      throw error;
    }
  }

  /**
   * Execute the complete workflow
   */
  private async executeWorkflow(workflowId: string): Promise<void> {
    const workflow = this.activeWorkflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    try {
      workflow.status = 'running';
      await this.notifyProgress(workflow, 'Workflow started', 5);

      // Stage 1: Check uploaded images
      await this.executeUploadStage(workflow);

      // Stage 2: OCR Processing
      await this.executeOCRStage(workflow);

      // Stage 3: Text Cleaning
      await this.executeTextCleaningStage(workflow);

      // Stage 4: Clustering
      await this.executeClusteringStage(workflow);

      // Stage 5: Summary Generation
      await this.executeSummaryStage(workflow);

      // Stage 6: Export Generation (optional)
      if (workflow.config.autoProcessing) {
        await this.executeExportStage(workflow);
      }

      // Complete workflow
      await this.completeWorkflow(workflow);

    } catch (error) {
      await this.handleWorkflowError(workflowId, error);
    }
  }

  /**
   * Execute upload stage - verify uploaded images
   */
  private async executeUploadStage(workflow: WorkflowState): Promise<void> {
    workflow.currentStage = WorkflowStage.UPLOAD;
    await this.notifyProgress(workflow, 'Checking uploaded images', 10);

    const images = await this.imageRepo.findByProjectId(workflow.projectId);
    
    if (images.length === 0) {
      throw new Error('No images found for processing');
    }

    // Check if any images are still uploading
    const pendingImages = images.filter(img => img.processingStatus === 'pending');
    if (pendingImages.length > 0) {
      await this.notifyProgress(workflow, `Waiting for ${pendingImages.length} images to finish uploading`, 15);
      
      // Wait for uploads to complete (with timeout)
      await this.waitForUploads(workflow.projectId, 300000); // 5 minutes timeout
    }

    workflow.stageResults[WorkflowStage.UPLOAD] = {
      totalImages: images.length,
      readyForProcessing: images.filter(img => img.processingStatus !== 'failed').length
    };

    await this.notifyProgress(workflow, `Found ${images.length} images ready for processing`, 20);
  }

  /**
   * Execute OCR processing stage
   */
  private async executeOCRStage(workflow: WorkflowState): Promise<void> {
    workflow.currentStage = WorkflowStage.OCR_PROCESSING;
    await this.notifyProgress(workflow, 'Starting OCR processing', 25);

    const images = await this.imageRepo.findByProjectId(workflow.projectId);
    const imagesToProcess = images.filter(img => 
      img.processingStatus !== 'failed' && !img.ocrResults
    );

    if (imagesToProcess.length === 0) {
      workflow.stageResults[WorkflowStage.OCR_PROCESSING] = { message: 'No images need OCR processing' };
      await this.notifyProgress(workflow, 'OCR processing skipped - already completed', 35);
      return;
    }

    const jobQueueService = getJobQueueService();
    if (!jobQueueService) {
      throw new Error('Job queue service not available');
    }

    const jobIds: string[] = [];

    // Submit OCR jobs for each image
    for (const image of imagesToProcess) {
      const jobData = {
        userId: workflow.userId,
        projectId: workflow.projectId,
        jobId: uuidv4(),
        createdAt: new Date(),
        imageId: image.id,
        imageUrl: image.originalUrl,
        processingOptions: {
          detectHandwriting: true,
          detectTables: false,
          detectForms: false
        }
      };

      const job = await jobQueueService.addJob(
        JobType.OCR_PROCESSING,
        jobData,
        { priority: JobPriority.HIGH }
      );

      jobIds.push(job.id!.toString());
    }

    workflow.jobIds[WorkflowStage.OCR_PROCESSING] = jobIds;

    // Wait for all OCR jobs to complete
    await this.waitForJobs(jobIds, workflow, 'OCR processing', 25, 35);

    workflow.stageResults[WorkflowStage.OCR_PROCESSING] = {
      processedImages: imagesToProcess.length,
      jobIds
    };
  }

  /**
   * Execute text cleaning stage
   */
  private async executeTextCleaningStage(workflow: WorkflowState): Promise<void> {
    workflow.currentStage = WorkflowStage.TEXT_CLEANING;
    await this.notifyProgress(workflow, 'Starting text cleaning', 40);

    const images = await this.imageRepo.findByProjectId(workflow.projectId);
    const imagesWithOCR = images.filter(img => img.ocrResults);

    if (imagesWithOCR.length === 0) {
      throw new Error('No OCR results found for text cleaning');
    }

    const jobQueueService = getJobQueueService();
    if (!jobQueueService) {
      throw new Error('Job queue service not available');
    }

    const jobIds: string[] = [];

    // Submit text cleaning jobs for each image with OCR results
    for (const image of imagesWithOCR) {
      if (!image.ocrResults?.extractedText) continue;

      const jobData = {
        userId: workflow.userId,
        projectId: workflow.projectId,
        jobId: uuidv4(),
        createdAt: new Date(),
        imageId: image.id,
        rawTextBlocks: image.ocrResults.extractedText,
        cleaningOptions: workflow.config.cleaningOptions
      };

      const job = await jobQueueService.addJob(
        JobType.TEXT_CLEANING,
        jobData,
        { priority: JobPriority.HIGH }
      );

      jobIds.push(job.id!.toString());
    }

    workflow.jobIds[WorkflowStage.TEXT_CLEANING] = jobIds;

    // Wait for all text cleaning jobs to complete
    await this.waitForJobs(jobIds, workflow, 'Text cleaning', 40, 55);

    workflow.stageResults[WorkflowStage.TEXT_CLEANING] = {
      processedImages: imagesWithOCR.length,
      jobIds
    };
  }

  /**
   * Execute clustering stage
   */
  private async executeClusteringStage(workflow: WorkflowState): Promise<void> {
    workflow.currentStage = WorkflowStage.CLUSTERING;
    await this.notifyProgress(workflow, 'Starting semantic clustering', 60);

    // Get all cleaned notes for the project
    const notes = await this.noteRepo.findByProjectId(workflow.projectId);
    
    if (notes.length === 0) {
      throw new Error('No cleaned text found for clustering');
    }

    const jobQueueService = getJobQueueService();
    if (!jobQueueService) {
      throw new Error('Job queue service not available');
    }

    // Prepare text blocks for clustering
    const textBlocks = notes.map(note => ({
      originalId: note.id,
      cleanedText: note.cleanedText,
      corrections: [], // This would come from the cleaning stage
      confidence: note.confidence
    }));

    const jobData = {
      userId: workflow.userId,
      projectId: workflow.projectId,
      jobId: uuidv4(),
      createdAt: new Date(),
      textBlocks,
      clusteringMethod: workflow.config.clusteringMethod,
      targetClusters: workflow.config.targetClusters
    };

    const job = await jobQueueService.addJob(
      JobType.CLUSTERING,
      jobData,
      { priority: JobPriority.HIGH }
    );

    workflow.jobIds[WorkflowStage.CLUSTERING] = [job.id!.toString()];

    // Wait for clustering job to complete
    await this.waitForJobs([job.id!.toString()], workflow, 'Clustering', 60, 75);

    workflow.stageResults[WorkflowStage.CLUSTERING] = {
      totalNotes: notes.length,
      jobId: job.id!.toString()
    };
  }

  /**
   * Execute summary generation stage
   */
  private async executeSummaryStage(workflow: WorkflowState): Promise<void> {
    workflow.currentStage = WorkflowStage.SUMMARY_GENERATION;
    await this.notifyProgress(workflow, 'Generating summary', 80);

    // Get clusters for the project
    const clusters = await this.clusterRepo.findByProjectId(workflow.projectId);
    
    if (clusters.length === 0) {
      throw new Error('No clusters found for summary generation');
    }

    const jobQueueService = getJobQueueService();
    if (!jobQueueService) {
      throw new Error('Job queue service not available');
    }

    const jobData = {
      userId: workflow.userId,
      projectId: workflow.projectId,
      jobId: uuidv4(),
      createdAt: new Date(),
      clusters,
      summaryOptions: workflow.config.summaryOptions
    };

    const job = await jobQueueService.addJob(
      JobType.SUMMARY_GENERATION,
      jobData,
      { priority: JobPriority.HIGH }
    );

    workflow.jobIds[WorkflowStage.SUMMARY_GENERATION] = [job.id!.toString()];

    // Wait for summary job to complete
    await this.waitForJobs([job.id!.toString()], workflow, 'Summary generation', 80, 90);

    workflow.stageResults[WorkflowStage.SUMMARY_GENERATION] = {
      clustersProcessed: clusters.length,
      jobId: job.id!.toString()
    };
  }

  /**
   * Execute export generation stage
   */
  private async executeExportStage(workflow: WorkflowState): Promise<void> {
    workflow.currentStage = WorkflowStage.EXPORT_GENERATION;
    await this.notifyProgress(workflow, 'Generating exports', 92);

    const jobQueueService = getJobQueueService();
    if (!jobQueueService) {
      throw new Error('Job queue service not available');
    }

    const jobIds: string[] = [];

    // Generate PDF export
    const pdfJobData = {
      userId: workflow.userId,
      projectId: workflow.projectId,
      jobId: uuidv4(),
      createdAt: new Date(),
      format: 'pdf' as const,
      exportOptions: {
        includeSummary: true,
        includeOriginalText: true,
        includeImages: true
      }
    };

    const pdfJob = await jobQueueService.addJob(
      JobType.EXPORT_GENERATION,
      pdfJobData,
      { priority: JobPriority.NORMAL }
    );

    jobIds.push(pdfJob.id!.toString());

    // Generate CSV export
    const csvJobData = {
      userId: workflow.userId,
      projectId: workflow.projectId,
      jobId: uuidv4(),
      createdAt: new Date(),
      format: 'csv' as const,
      exportOptions: {
        includeSummary: true,
        includeOriginalText: true,
        includeImages: false
      }
    };

    const csvJob = await jobQueueService.addJob(
      JobType.EXPORT_GENERATION,
      csvJobData,
      { priority: JobPriority.NORMAL }
    );

    jobIds.push(csvJob.id!.toString());

    workflow.jobIds[WorkflowStage.EXPORT_GENERATION] = jobIds;

    // Wait for export jobs to complete
    await this.waitForJobs(jobIds, workflow, 'Export generation', 92, 98);

    workflow.stageResults[WorkflowStage.EXPORT_GENERATION] = {
      exportsGenerated: ['pdf', 'csv'],
      jobIds
    };
  }

  /**
   * Complete the workflow
   */
  private async completeWorkflow(workflow: WorkflowState): Promise<void> {
    workflow.currentStage = WorkflowStage.COMPLETED;
    workflow.status = 'completed';
    workflow.progress = 100;
    workflow.completedAt = new Date();

    // Update project status
    await this.projectRepo.updateStatus(workflow.projectId, 'completed');

    await this.notifyProgress(workflow, 'Workflow completed successfully', 100);

    logger.info(`Workflow ${workflow.workflowId} completed successfully for project ${workflow.projectId}`);

    // Clean up workflow state after a delay
    setTimeout(() => {
      this.activeWorkflows.delete(workflow.workflowId);
    }, 300000); // 5 minutes
  }

  /**
   * Handle workflow errors
   */
  private async handleWorkflowError(workflowId: string, error: any): Promise<void> {
    const workflow = this.activeWorkflows.get(workflowId);
    
    if (workflow) {
      // Try to get orchestrator for advanced error handling
      try {
        const { getWorkflowOrchestrator } = await import('./workflowOrchestrator.js');
        const orchestrator = getWorkflowOrchestrator();
        
        if (orchestrator) {
          // Let orchestrator handle the failure (includes rollback logic)
          await orchestrator.handleWorkflowFailure(
            workflowId, 
            error instanceof Error ? error : new Error('Unknown error'),
            workflow.currentStage
          );
          return;
        }
      } catch (orchestratorError) {
        logger.error('Failed to use orchestrator for error handling:', orchestratorError);
      }

      // Fallback to basic error handling
      workflow.status = 'failed';
      workflow.error = error instanceof Error ? error.message : 'Unknown error';
      workflow.completedAt = new Date();

      // Update project status
      await this.projectRepo.updateStatus(workflow.projectId, 'failed');

      await this.notifyProgress(workflow, `Workflow failed: ${workflow.error}`, workflow.progress);
    }

    logger.error(`Workflow ${workflowId} failed:`, error);
  }

  /**
   * Wait for upload completion
   */
  private async waitForUploads(projectId: string, timeout: number): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const images = await this.imageRepo.findByProjectId(projectId);
      const pendingImages = images.filter(img => img.processingStatus === 'pending');
      
      if (pendingImages.length === 0) {
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
    }

    throw new Error('Timeout waiting for uploads to complete');
  }

  /**
   * Wait for jobs to complete
   */
  private async waitForJobs(
    jobIds: string[],
    workflow: WorkflowState,
    stageName: string,
    startProgress: number,
    endProgress: number
  ): Promise<void> {
    const jobQueueService = getJobQueueService();
    if (!jobQueueService) {
      throw new Error('Job queue service not available');
    }

    const timeout = 1800000; // 30 minutes
    const startTime = Date.now();
    const progressRange = endProgress - startProgress;

    while (Date.now() - startTime < timeout) {
      const jobStatuses = await Promise.all(
        jobIds.map(jobId => jobQueueService.getJobStatus(jobId))
      );

      const completedJobs = jobStatuses.filter(status => 
        status && (status.status === 'completed' || status.status === 'failed')
      );

      const failedJobs = jobStatuses.filter(status => 
        status && status.status === 'failed'
      );

      if (failedJobs.length > 0) {
        const failedReasons = failedJobs.map(job => job.failedReason).join(', ');
        throw new Error(`${stageName} jobs failed: ${failedReasons}`);
      }

      if (completedJobs.length === jobIds.length) {
        await this.notifyProgress(workflow, `${stageName} completed`, endProgress);
        return;
      }

      // Update progress based on completed jobs
      const progressPercent = (completedJobs.length / jobIds.length) * progressRange + startProgress;
      await this.notifyProgress(
        workflow, 
        `${stageName}: ${completedJobs.length}/${jobIds.length} completed`, 
        Math.floor(progressPercent)
      );

      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
    }

    throw new Error(`Timeout waiting for ${stageName} jobs to complete`);
  }

  /**
   * Send progress notification
   */
  private async notifyProgress(
    workflow: WorkflowState,
    message: string,
    progress: number
  ): Promise<void> {
    workflow.progress = progress;

    const progressData: WorkflowProgress = {
      workflowId: workflow.workflowId,
      projectId: workflow.projectId,
      stage: workflow.currentStage,
      progress,
      message,
      error: workflow.error
    };

    const wsService = getWebSocketService();
    if (wsService) {
      wsService.sendWorkflowProgress(workflow.userId, progressData);
      wsService.sendProjectWorkflowProgress(workflow.projectId, progressData);
    }

    logger.info(`Workflow ${workflow.workflowId} progress: ${progress}% - ${message}`);
  }

  /**
   * Get workflow status
   */
  async getWorkflowStatus(workflowId: string): Promise<WorkflowState | null> {
    return this.activeWorkflows.get(workflowId) || null;
  }

  /**
   * Cancel workflow
   */
  async cancelWorkflow(workflowId: string): Promise<boolean> {
    const workflow = this.activeWorkflows.get(workflowId);
    if (!workflow) {
      return false;
    }

    try {
      workflow.status = 'cancelled';
      workflow.completedAt = new Date();

      // Cancel all active jobs
      const jobQueueService = getJobQueueService();
      if (jobQueueService) {
        for (const stageJobIds of Object.values(workflow.jobIds)) {
          for (const jobId of stageJobIds) {
            await jobQueueService.cancelJob(jobId);
          }
        }
      }

      // Update project status
      await this.projectRepo.updateStatus(workflow.projectId, 'failed');

      await this.notifyProgress(workflow, 'Workflow cancelled', workflow.progress);

      logger.info(`Workflow ${workflowId} cancelled`);
      return true;

    } catch (error) {
      logger.error(`Failed to cancel workflow ${workflowId}:`, error);
      return false;
    }
  }

  /**
   * Get all active workflows
   */
  getActiveWorkflows(): WorkflowState[] {
    return Array.from(this.activeWorkflows.values());
  }

  /**
   * Get workflows for a user
   */
  getUserWorkflows(userId: string): WorkflowState[] {
    return Array.from(this.activeWorkflows.values())
      .filter(workflow => workflow.userId === userId);
  }

  /**
   * Get workflows for a project
   */
  getProjectWorkflows(projectId: string): WorkflowState[] {
    return Array.from(this.activeWorkflows.values())
      .filter(workflow => workflow.projectId === projectId);
  }
}

// Singleton instance
let workflowService: WorkflowService | null = null;

export const initializeWorkflowService = (): WorkflowService => {
  if (!workflowService) {
    workflowService = new WorkflowService();
    
    // Initialize orchestrator and monitor when workflow service is created
    setTimeout(async () => {
      try {
        const { initializeWorkflowOrchestrator } = await import('./workflowOrchestrator.js');
        const { initializeWorkflowMonitor } = await import('./workflowMonitor.js');
        
        initializeWorkflowOrchestrator(workflowService!);
        const monitor = initializeWorkflowMonitor();
        monitor.start();
        
        logger.info('Workflow orchestrator and monitor initialized');
      } catch (error) {
        logger.error('Failed to initialize workflow orchestrator and monitor:', error);
      }
    }, 1000);
  }
  return workflowService;
};

export const getWorkflowService = (): WorkflowService | null => {
  return workflowService;
};