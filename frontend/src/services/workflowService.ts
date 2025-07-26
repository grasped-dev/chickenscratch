import { apiClient } from '../utils/api';

export interface WorkflowConfig {
  autoProcessing?: boolean;
  clusteringMethod?: 'embeddings' | 'llm' | 'hybrid';
  targetClusters?: number;
  cleaningOptions?: {
    spellCheck?: boolean;
    removeArtifacts?: boolean;
    normalizeSpacing?: boolean;
  };
  summaryOptions?: {
    includeQuotes?: boolean;
    includeDistribution?: boolean;
    maxThemes?: number;
  };
}

export interface WorkflowProgress {
  workflowId: string;
  projectId: string;
  stage: string;
  progress: number;
  message: string;
  stageProgress?: {
    current: number;
    total: number;
    currentItem?: string;
  };
  error?: string;
}

export interface WorkflowStatus {
  workflowId: string;
  projectId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  currentStage: string;
  progress: number;
  startedAt: string;
  completedAt?: string;
  error?: string;
  config: WorkflowConfig;
  stageResults: Record<string, any>;
}

export interface WorkflowSummary {
  workflowId: string;
  projectId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  currentStage: string;
  progress: number;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export class WorkflowService {
  /**
   * Start a new workflow for a project
   */
  async startWorkflow(projectId: string, config: WorkflowConfig = {}): Promise<{
    workflowId: string;
    projectId: string;
    status: string;
    message: string;
  }> {
    const response = await apiClient.post(`/projects/${projectId}/workflow`, config);
    return response.data;
  }

  /**
   * Get workflow status
   */
  async getWorkflowStatus(workflowId: string): Promise<WorkflowStatus> {
    const response = await apiClient.get(`/workflows/${workflowId}`);
    return response.data;
  }

  /**
   * Cancel a workflow
   */
  async cancelWorkflow(workflowId: string): Promise<{ message: string }> {
    const response = await apiClient.delete(`/workflows/${workflowId}`);
    return response.data;
  }

  /**
   * Restart a failed workflow
   */
  async restartWorkflow(workflowId: string): Promise<{
    newWorkflowId: string;
    projectId: string;
    status: string;
    message: string;
  }> {
    const response = await apiClient.post(`/workflows/${workflowId}/restart`);
    return response.data;
  }

  /**
   * Get user's workflows
   */
  async getUserWorkflows(): Promise<{
    workflows: WorkflowSummary[];
    total: number;
  }> {
    const response = await apiClient.get('/workflows');
    return response.data;
  }

  /**
   * Get project's workflows
   */
  async getProjectWorkflows(projectId: string): Promise<{
    projectId: string;
    workflows: WorkflowSummary[];
    total: number;
  }> {
    const response = await apiClient.get(`/projects/${projectId}/workflows`);
    return response.data;
  }

  /**
   * Get default workflow configuration
   */
  getDefaultConfig(): WorkflowConfig {
    return {
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
  }

  /**
   * Validate workflow configuration
   */
  validateConfig(config: WorkflowConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (config.clusteringMethod && !['embeddings', 'llm', 'hybrid'].includes(config.clusteringMethod)) {
      errors.push('Invalid clustering method. Must be one of: embeddings, llm, hybrid');
    }

    if (config.targetClusters !== undefined) {
      if (!Number.isInteger(config.targetClusters) || config.targetClusters < 1 || config.targetClusters > 50) {
        errors.push('Target clusters must be an integer between 1 and 50');
      }
    }

    if (config.summaryOptions?.maxThemes !== undefined) {
      if (!Number.isInteger(config.summaryOptions.maxThemes) || config.summaryOptions.maxThemes < 1 || config.summaryOptions.maxThemes > 20) {
        errors.push('Max themes must be an integer between 1 and 20');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get workflow stage display name
   */
  getStageDisplayName(stage: string): string {
    const stageNames: Record<string, string> = {
      upload: 'Upload Verification',
      ocr_processing: 'OCR Processing',
      text_cleaning: 'Text Cleaning',
      clustering: 'Semantic Clustering',
      summary_generation: 'Summary Generation',
      export_generation: 'Export Generation',
      completed: 'Completed'
    };

    return stageNames[stage] || stage;
  }

  /**
   * Get workflow status color
   */
  getStatusColor(status: string): string {
    const statusColors: Record<string, string> = {
      pending: 'text-yellow-600',
      running: 'text-blue-600',
      completed: 'text-green-600',
      failed: 'text-red-600',
      cancelled: 'text-gray-600'
    };

    return statusColors[status] || 'text-gray-600';
  }

  /**
   * Get workflow status icon
   */
  getStatusIcon(status: string): string {
    const statusIcons: Record<string, string> = {
      pending: '⏳',
      running: '🔄',
      completed: '✅',
      failed: '❌',
      cancelled: '⏹️'
    };

    return statusIcons[status] || '❓';
  }

  /**
   * Format workflow duration
   */
  formatDuration(startedAt: string, completedAt?: string): string {
    const start = new Date(startedAt);
    const end = completedAt ? new Date(completedAt) : new Date();
    const durationMs = end.getTime() - start.getTime();

    const seconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Calculate estimated completion time
   */
  estimateCompletion(progress: number, startedAt: string): string | null {
    if (progress <= 0 || progress >= 100) {
      return null;
    }

    const start = new Date(startedAt);
    const now = new Date();
    const elapsed = now.getTime() - start.getTime();
    
    // Estimate total time based on current progress
    const estimatedTotal = (elapsed / progress) * 100;
    const remaining = estimatedTotal - elapsed;

    if (remaining <= 0) {
      return 'Soon';
    }

    const remainingMinutes = Math.ceil(remaining / (1000 * 60));
    
    if (remainingMinutes < 1) {
      return 'Less than 1 minute';
    } else if (remainingMinutes === 1) {
      return '1 minute';
    } else if (remainingMinutes < 60) {
      return `${remainingMinutes} minutes`;
    } else {
      const hours = Math.floor(remainingMinutes / 60);
      const mins = remainingMinutes % 60;
      return `${hours}h ${mins}m`;
    }
  }
}

export const workflowService = new WorkflowService();