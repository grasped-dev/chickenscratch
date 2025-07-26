import { useState, useEffect, useCallback, useRef } from 'react';
import { workflowService, WorkflowConfig, WorkflowStatus, WorkflowProgress } from '../services/workflowService';
import { useWebSocket } from './useWebSocket';

export interface UseWorkflowOptions {
  projectId?: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export interface UseWorkflowReturn {
  // Workflow management
  startWorkflow: (projectId: string, config?: WorkflowConfig) => Promise<void>;
  cancelWorkflow: (workflowId: string) => Promise<void>;
  restartWorkflow: (workflowId: string) => Promise<void>;
  
  // Status and progress
  currentWorkflow: WorkflowStatus | null;
  workflowProgress: WorkflowProgress | null;
  isLoading: boolean;
  error: string | null;
  
  // Workflow lists
  userWorkflows: WorkflowStatus[];
  projectWorkflows: WorkflowStatus[];
  
  // Refresh functions
  refreshWorkflowStatus: (workflowId: string) => Promise<void>;
  refreshUserWorkflows: () => Promise<void>;
  refreshProjectWorkflows: (projectId: string) => Promise<void>;
  
  // Utilities
  clearError: () => void;
  getStageDisplayName: (stage: string) => string;
  getStatusColor: (status: string) => string;
  getStatusIcon: (status: string) => string;
}

export const useWorkflow = (options: UseWorkflowOptions = {}): UseWorkflowReturn => {
  const { projectId, autoRefresh = false, refreshInterval = 5000 } = options;
  
  // State
  const [currentWorkflow, setCurrentWorkflow] = useState<WorkflowStatus | null>(null);
  const [workflowProgress, setWorkflowProgress] = useState<WorkflowProgress | null>(null);
  const [userWorkflows, setUserWorkflows] = useState<WorkflowStatus[]>([]);
  const [projectWorkflows, setProjectWorkflows] = useState<WorkflowStatus[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Refs for cleanup
  const refreshTimeoutRef = useRef<NodeJS.Timeout>();
  const currentWorkflowIdRef = useRef<string | null>(null);
  
  // WebSocket for real-time updates
  const { socket } = useWebSocket();

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Start workflow
  const startWorkflow = useCallback(async (projectId: string, config?: WorkflowConfig) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const result = await workflowService.startWorkflow(projectId, config);
      
      // Fetch the full workflow status
      const status = await workflowService.getWorkflowStatus(result.workflowId);
      setCurrentWorkflow(status);
      currentWorkflowIdRef.current = result.workflowId;
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start workflow';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Cancel workflow
  const cancelWorkflow = useCallback(async (workflowId: string) => {
    try {
      setIsLoading(true);
      setError(null);
      
      await workflowService.cancelWorkflow(workflowId);
      
      // Refresh workflow status
      await refreshWorkflowStatus(workflowId);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to cancel workflow';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Restart workflow
  const restartWorkflow = useCallback(async (workflowId: string) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const result = await workflowService.restartWorkflow(workflowId);
      
      // Fetch the new workflow status
      const status = await workflowService.getWorkflowStatus(result.newWorkflowId);
      setCurrentWorkflow(status);
      currentWorkflowIdRef.current = result.newWorkflowId;
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to restart workflow';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Refresh workflow status
  const refreshWorkflowStatus = useCallback(async (workflowId: string) => {
    try {
      const status = await workflowService.getWorkflowStatus(workflowId);
      setCurrentWorkflow(status);
      currentWorkflowIdRef.current = workflowId;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to refresh workflow status';
      setError(errorMessage);
    }
  }, []);

  // Refresh user workflows
  const refreshUserWorkflows = useCallback(async () => {
    try {
      const result = await workflowService.getUserWorkflows();
      setUserWorkflows(result.workflows as WorkflowStatus[]);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to refresh user workflows';
      setError(errorMessage);
    }
  }, []);

  // Refresh project workflows
  const refreshProjectWorkflows = useCallback(async (projectId: string) => {
    try {
      const result = await workflowService.getProjectWorkflows(projectId);
      setProjectWorkflows(result.workflows as WorkflowStatus[]);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to refresh project workflows';
      setError(errorMessage);
    }
  }, []);

  // Auto-refresh effect
  useEffect(() => {
    if (!autoRefresh || !currentWorkflowIdRef.current) {
      return;
    }

    const scheduleRefresh = () => {
      refreshTimeoutRef.current = setTimeout(async () => {
        if (currentWorkflowIdRef.current) {
          await refreshWorkflowStatus(currentWorkflowIdRef.current);
          
          // Continue refreshing if workflow is still running
          if (currentWorkflow?.status === 'running' || currentWorkflow?.status === 'pending') {
            scheduleRefresh();
          }
        }
      }, refreshInterval);
    };

    // Only refresh if workflow is active
    if (currentWorkflow?.status === 'running' || currentWorkflow?.status === 'pending') {
      scheduleRefresh();
    }

    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, [autoRefresh, refreshInterval, currentWorkflow?.status, refreshWorkflowStatus]);

  // WebSocket event handlers
  useEffect(() => {
    if (!socket) return;

    const handleWorkflowProgress = (progress: WorkflowProgress) => {
      setWorkflowProgress(progress);
      
      // Update current workflow if it matches
      if (currentWorkflow?.workflowId === progress.workflowId) {
        setCurrentWorkflow(prev => prev ? {
          ...prev,
          currentStage: progress.stage,
          progress: progress.progress
        } : null);
      }
    };

    const handleWorkflowStatus = (status: any) => {
      // Update current workflow if it matches
      if (currentWorkflow?.workflowId === status.workflowId) {
        setCurrentWorkflow(prev => prev ? {
          ...prev,
          status: status.status,
          currentStage: status.currentStage,
          progress: status.progress,
          completedAt: status.completedAt,
          error: status.error
        } : null);
      }
    };

    socket.on('workflow-progress', handleWorkflowProgress);
    socket.on('workflow-status', handleWorkflowStatus);

    return () => {
      socket.off('workflow-progress', handleWorkflowProgress);
      socket.off('workflow-status', handleWorkflowStatus);
    };
  }, [socket, currentWorkflow?.workflowId]);

  // Load initial data
  useEffect(() => {
    if (projectId) {
      refreshProjectWorkflows(projectId);
    }
    refreshUserWorkflows();
  }, [projectId, refreshProjectWorkflows, refreshUserWorkflows]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, []);

  return {
    // Workflow management
    startWorkflow,
    cancelWorkflow,
    restartWorkflow,
    
    // Status and progress
    currentWorkflow,
    workflowProgress,
    isLoading,
    error,
    
    // Workflow lists
    userWorkflows,
    projectWorkflows,
    
    // Refresh functions
    refreshWorkflowStatus,
    refreshUserWorkflows,
    refreshProjectWorkflows,
    
    // Utilities
    clearError,
    getStageDisplayName: workflowService.getStageDisplayName,
    getStatusColor: workflowService.getStatusColor,
    getStatusIcon: workflowService.getStatusIcon
  };
};