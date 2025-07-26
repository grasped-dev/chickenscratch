import { EventEmitter } from 'events';
import { getWorkflowService, WorkflowState, WorkflowStage } from './workflow.js';
import { getWorkflowOrchestrator } from './workflowOrchestrator.js';
import { getJobQueueService } from './jobQueue.js';
import { getWebSocketService } from './websocket.js';
import { logger } from '../utils/logger.js';

export interface WorkflowMetrics {
  totalWorkflows: number;
  activeWorkflows: number;
  completedWorkflows: number;
  failedWorkflows: number;
  cancelledWorkflows: number;
  averageCompletionTime: number;
  averageProcessingTime: number;
  stageDistribution: Record<WorkflowStage, number>;
  errorRate: number;
  throughput: number; // workflows per hour
}

export interface WorkflowAlert {
  id: string;
  type: 'error' | 'warning' | 'info';
  workflowId: string;
  projectId: string;
  userId: string;
  message: string;
  timestamp: Date;
  resolved: boolean;
  metadata?: any;
}

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  checks: {
    workflowService: boolean;
    jobQueue: boolean;
    webSocket: boolean;
    database: boolean;
  };
  metrics: WorkflowMetrics;
  alerts: WorkflowAlert[];
}

export class WorkflowMonitor extends EventEmitter {
  private monitoringInterval: NodeJS.Timeout | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private alerts: Map<string, WorkflowAlert> = new Map();
  private metrics: WorkflowMetrics | null = null;
  private isMonitoring = false;

  // Configuration
  private readonly MONITORING_INTERVAL = 30000; // 30 seconds
  private readonly HEALTH_CHECK_INTERVAL = 60000; // 1 minute
  private readonly STUCK_WORKFLOW_THRESHOLD = 1800000; // 30 minutes
  private readonly HIGH_ERROR_RATE_THRESHOLD = 0.1; // 10%
  private readonly LOW_THROUGHPUT_THRESHOLD = 1; // 1 workflow per hour

  constructor() {
    super();
  }

  /**
   * Start monitoring workflows
   */
  start(): void {
    if (this.isMonitoring) {
      logger.warn('Workflow monitor is already running');
      return;
    }

    this.isMonitoring = true;
    logger.info('Starting workflow monitor');

    // Start monitoring intervals
    this.monitoringInterval = setInterval(() => {
      this.performMonitoringCheck().catch(error => {
        logger.error('Error during monitoring check:', error);
      });
    }, this.MONITORING_INTERVAL);

    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck().catch(error => {
        logger.error('Error during health check:', error);
      });
    }, this.HEALTH_CHECK_INTERVAL);

    // Perform initial checks
    this.performMonitoringCheck();
    this.performHealthCheck();
  }

  /**
   * Stop monitoring workflows
   */
  stop(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    logger.info('Stopping workflow monitor');

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Perform monitoring check
   */
  private async performMonitoringCheck(): Promise<void> {
    try {
      const workflowService = getWorkflowService();
      if (!workflowService) {
        this.createAlert('error', 'system', 'system', 'system', 'Workflow service not available');
        return;
      }

      const activeWorkflows = workflowService.getActiveWorkflows();
      
      // Check for stuck workflows
      await this.checkStuckWorkflows(activeWorkflows);
      
      // Check for failed workflows
      await this.checkFailedWorkflows(activeWorkflows);
      
      // Update metrics
      await this.updateMetrics(activeWorkflows);
      
      // Check system health
      await this.checkSystemHealth();

      this.emit('monitoring-check-completed', {
        timestamp: new Date(),
        activeWorkflows: activeWorkflows.length,
        alerts: this.getActiveAlerts().length
      });

    } catch (error) {
      logger.error('Error during monitoring check:', error);
      this.createAlert('error', 'system', 'system', 'system', `Monitoring check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check for stuck workflows
   */
  private async checkStuckWorkflows(workflows: WorkflowState[]): Promise<void> {
    const now = new Date();
    
    for (const workflow of workflows) {
      if (workflow.status !== 'running') continue;

      const startTime = new Date(workflow.startedAt);
      const duration = now.getTime() - startTime.getTime();

      if (duration > this.STUCK_WORKFLOW_THRESHOLD) {
        const alertId = `stuck-workflow-${workflow.workflowId}`;
        
        if (!this.alerts.has(alertId)) {
          this.createAlert(
            'warning',
            workflow.workflowId,
            workflow.projectId,
            workflow.userId,
            `Workflow has been running for ${Math.round(duration / 60000)} minutes without completion`,
            { duration, stage: workflow.currentStage }
          );

          // Attempt to validate and potentially recover the workflow
          const orchestrator = getWorkflowOrchestrator();
          if (orchestrator) {
            const validation = await orchestrator.validateWorkflowState(workflow.workflowId);
            if (!validation.valid) {
              logger.warn(`Stuck workflow ${workflow.workflowId} has validation issues:`, validation.issues);
              
              // Create additional alert for validation issues
              this.createAlert(
                'error',
                workflow.workflowId,
                workflow.projectId,
                workflow.userId,
                `Workflow validation failed: ${validation.issues.join(', ')}`,
                { validationIssues: validation.issues }
              );
            }
          }
        }
      }
    }
  }

  /**
   * Check for failed workflows
   */
  private async checkFailedWorkflows(workflows: WorkflowState[]): Promise<void> {
    const failedWorkflows = workflows.filter(w => w.status === 'failed');
    
    for (const workflow of failedWorkflows) {
      const alertId = `failed-workflow-${workflow.workflowId}`;
      
      if (!this.alerts.has(alertId)) {
        this.createAlert(
          'error',
          workflow.workflowId,
          workflow.projectId,
          workflow.userId,
          `Workflow failed: ${workflow.error || 'Unknown error'}`,
          { 
            stage: workflow.currentStage,
            error: workflow.error,
            stageResults: workflow.stageResults
          }
        );

        // Emit event for failed workflow
        this.emit('workflow-failed', {
          workflowId: workflow.workflowId,
          projectId: workflow.projectId,
          userId: workflow.userId,
          error: workflow.error,
          stage: workflow.currentStage
        });
      }
    }
  }

  /**
   * Update workflow metrics
   */
  private async updateMetrics(workflows: WorkflowState[]): Promise<void> {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3600000);

    // Calculate basic counts
    const totalWorkflows = workflows.length;
    const activeWorkflows = workflows.filter(w => w.status === 'running' || w.status === 'pending').length;
    const completedWorkflows = workflows.filter(w => w.status === 'completed').length;
    const failedWorkflows = workflows.filter(w => w.status === 'failed').length;
    const cancelledWorkflows = workflows.filter(w => w.status === 'cancelled').length;

    // Calculate completion times
    const completedWithTimes = workflows.filter(w => w.status === 'completed' && w.completedAt);
    const averageCompletionTime = completedWithTimes.length > 0
      ? completedWithTimes.reduce((sum, w) => {
          const duration = new Date(w.completedAt!).getTime() - new Date(w.startedAt).getTime();
          return sum + duration;
        }, 0) / completedWithTimes.length
      : 0;

    // Calculate processing times (for running workflows)
    const runningWorkflows = workflows.filter(w => w.status === 'running');
    const averageProcessingTime = runningWorkflows.length > 0
      ? runningWorkflows.reduce((sum, w) => {
          const duration = now.getTime() - new Date(w.startedAt).getTime();
          return sum + duration;
        }, 0) / runningWorkflows.length
      : 0;

    // Calculate stage distribution
    const stageDistribution: Record<WorkflowStage, number> = {
      [WorkflowStage.UPLOAD]: 0,
      [WorkflowStage.OCR_PROCESSING]: 0,
      [WorkflowStage.TEXT_CLEANING]: 0,
      [WorkflowStage.CLUSTERING]: 0,
      [WorkflowStage.SUMMARY_GENERATION]: 0,
      [WorkflowStage.EXPORT_GENERATION]: 0,
      [WorkflowStage.COMPLETED]: 0
    };

    for (const workflow of workflows) {
      if (workflow.currentStage in stageDistribution) {
        stageDistribution[workflow.currentStage]++;
      }
    }

    // Calculate error rate
    const errorRate = totalWorkflows > 0 ? failedWorkflows / totalWorkflows : 0;

    // Calculate throughput (workflows completed in the last hour)
    const recentCompletions = workflows.filter(w => 
      w.status === 'completed' && 
      w.completedAt && 
      new Date(w.completedAt) > oneHourAgo
    ).length;
    const throughput = recentCompletions; // per hour

    this.metrics = {
      totalWorkflows,
      activeWorkflows,
      completedWorkflows,
      failedWorkflows,
      cancelledWorkflows,
      averageCompletionTime,
      averageProcessingTime,
      stageDistribution,
      errorRate,
      throughput
    };

    // Check for concerning metrics
    if (errorRate > this.HIGH_ERROR_RATE_THRESHOLD) {
      this.createAlert(
        'warning',
        'system',
        'system',
        'system',
        `High error rate detected: ${(errorRate * 100).toFixed(1)}%`,
        { errorRate, threshold: this.HIGH_ERROR_RATE_THRESHOLD }
      );
    }

    if (throughput < this.LOW_THROUGHPUT_THRESHOLD && totalWorkflows > 0) {
      this.createAlert(
        'warning',
        'system',
        'system',
        'system',
        `Low throughput detected: ${throughput} workflows/hour`,
        { throughput, threshold: this.LOW_THROUGHPUT_THRESHOLD }
      );
    }
  }

  /**
   * Check system health
   */
  private async checkSystemHealth(): Promise<void> {
    const workflowService = getWorkflowService();
    const jobQueueService = getJobQueueService();
    const webSocketService = getWebSocketService();

    // Check workflow service
    if (!workflowService) {
      this.createAlert('error', 'system', 'system', 'system', 'Workflow service is not available');
    }

    // Check job queue service
    if (!jobQueueService) {
      this.createAlert('error', 'system', 'system', 'system', 'Job queue service is not available');
    }

    // Check WebSocket service
    if (!webSocketService) {
      this.createAlert('warning', 'system', 'system', 'system', 'WebSocket service is not available');
    }

    // Check job queue health
    if (jobQueueService) {
      try {
        const queueHealth = await jobQueueService.getQueueHealth();
        if (queueHealth.failed > 100) {
          this.createAlert(
            'warning',
            'system',
            'system',
            'system',
            `High number of failed jobs: ${queueHealth.failed}`,
            { queueHealth }
          );
        }
      } catch (error) {
        this.createAlert(
          'error',
          'system',
          'system',
          'system',
          `Failed to check job queue health: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
  }

  /**
   * Perform comprehensive health check
   */
  private async performHealthCheck(): Promise<void> {
    try {
      const workflowService = getWorkflowService();
      const jobQueueService = getJobQueueService();
      const webSocketService = getWebSocketService();

      const checks = {
        workflowService: !!workflowService,
        jobQueue: !!jobQueueService,
        webSocket: !!webSocketService,
        database: true // Assume healthy if we can perform other checks
      };

      // Determine overall health status
      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      
      if (!checks.workflowService || !checks.jobQueue) {
        status = 'unhealthy';
      } else if (!checks.webSocket) {
        status = 'degraded';
      }

      // Consider metrics in health status
      if (this.metrics) {
        if (this.metrics.errorRate > this.HIGH_ERROR_RATE_THRESHOLD * 2) {
          status = 'unhealthy';
        } else if (this.metrics.errorRate > this.HIGH_ERROR_RATE_THRESHOLD) {
          status = status === 'healthy' ? 'degraded' : status;
        }
      }

      const healthResult: HealthCheckResult = {
        status,
        timestamp: new Date(),
        checks,
        metrics: this.metrics || this.getDefaultMetrics(),
        alerts: this.getActiveAlerts()
      };

      this.emit('health-check-completed', healthResult);

      // Log health status changes
      const previousStatus = this.getLastHealthStatus();
      if (previousStatus && previousStatus !== status) {
        logger.info(`Health status changed from ${previousStatus} to ${status}`);
        
        this.createAlert(
          status === 'unhealthy' ? 'error' : 'warning',
          'system',
          'system',
          'system',
          `System health status changed to ${status}`,
          { previousStatus, currentStatus: status, checks }
        );
      }

    } catch (error) {
      logger.error('Error during health check:', error);
      this.createAlert('error', 'system', 'system', 'system', `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create an alert
   */
  private createAlert(
    type: 'error' | 'warning' | 'info',
    workflowId: string,
    projectId: string,
    userId: string,
    message: string,
    metadata?: any
  ): void {
    const alertId = `${type}-${workflowId}-${Date.now()}`;
    
    const alert: WorkflowAlert = {
      id: alertId,
      type,
      workflowId,
      projectId,
      userId,
      message,
      timestamp: new Date(),
      resolved: false,
      metadata
    };

    this.alerts.set(alertId, alert);

    // Emit alert event
    this.emit('alert-created', alert);

    // Send notification via WebSocket if not a system alert
    if (userId !== 'system') {
      const webSocketService = getWebSocketService();
      if (webSocketService) {
        webSocketService.sendNotification(userId, {
          type: type === 'info' ? 'info' : type === 'warning' ? 'warning' : 'error',
          title: 'Workflow Alert',
          message,
          data: { workflowId, projectId, alertId }
        });
      }
    }

    logger.warn(`Workflow alert created: ${type} - ${message}`, { alertId, workflowId, projectId, metadata });
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      this.emit('alert-resolved', alert);
      logger.info(`Alert resolved: ${alertId}`);
      return true;
    }
    return false;
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): WorkflowAlert[] {
    return Array.from(this.alerts.values()).filter(alert => !alert.resolved);
  }

  /**
   * Get all alerts
   */
  getAllAlerts(): WorkflowAlert[] {
    return Array.from(this.alerts.values());
  }

  /**
   * Get current metrics
   */
  getCurrentMetrics(): WorkflowMetrics | null {
    return this.metrics;
  }

  /**
   * Get default metrics
   */
  private getDefaultMetrics(): WorkflowMetrics {
    return {
      totalWorkflows: 0,
      activeWorkflows: 0,
      completedWorkflows: 0,
      failedWorkflows: 0,
      cancelledWorkflows: 0,
      averageCompletionTime: 0,
      averageProcessingTime: 0,
      stageDistribution: {
        [WorkflowStage.UPLOAD]: 0,
        [WorkflowStage.OCR_PROCESSING]: 0,
        [WorkflowStage.TEXT_CLEANING]: 0,
        [WorkflowStage.CLUSTERING]: 0,
        [WorkflowStage.SUMMARY_GENERATION]: 0,
        [WorkflowStage.EXPORT_GENERATION]: 0,
        [WorkflowStage.COMPLETED]: 0
      },
      errorRate: 0,
      throughput: 0
    };
  }

  /**
   * Get last health status (placeholder - would be stored in database in real implementation)
   */
  private getLastHealthStatus(): string | null {
    // In a real implementation, this would be retrieved from persistent storage
    return null;
  }

  /**
   * Clean up old alerts
   */
  cleanupOldAlerts(maxAge: number = 86400000): void { // 24 hours default
    const cutoff = new Date(Date.now() - maxAge);
    
    for (const [alertId, alert] of this.alerts.entries()) {
      if (alert.timestamp < cutoff && alert.resolved) {
        this.alerts.delete(alertId);
      }
    }
  }

  /**
   * Get monitoring status
   */
  isRunning(): boolean {
    return this.isMonitoring;
  }
}

// Singleton instance
let workflowMonitor: WorkflowMonitor | null = null;

export const initializeWorkflowMonitor = (): WorkflowMonitor => {
  if (!workflowMonitor) {
    workflowMonitor = new WorkflowMonitor();
  }
  return workflowMonitor;
};

export const getWorkflowMonitor = (): WorkflowMonitor | null => {
  return workflowMonitor;
};