import { Request, Response } from 'express';
import { getJobQueueService, JobType } from '../services/jobQueue.js';
import { getJobWorkerService } from '../services/jobWorker.js';

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
    name: string;
  };
}

export class JobController {
  /**
   * Get job status
   */
  async getJobStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { jobId } = req.params;
      const jobQueueService = getJobQueueService();

      if (!jobQueueService) {
        res.status(503).json({ error: 'Job queue service not available' });
        return;
      }

      const jobStatus = await jobQueueService.getJobStatus(jobId);
      
      if (!jobStatus) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      res.json({
        success: true,
        data: jobStatus
      });
    } catch (error) {
      console.error('Error getting job status:', error);
      res.status(500).json({ 
        error: 'Failed to get job status',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Cancel a job
   */
  async cancelJob(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { jobId } = req.params;
      const jobQueueService = getJobQueueService();

      if (!jobQueueService) {
        res.status(503).json({ error: 'Job queue service not available' });
        return;
      }

      // First check if job exists and user has permission
      const jobStatus = await jobQueueService.getJobStatus(jobId);
      if (!jobStatus) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      // Check if user owns the job (basic authorization)
      if (jobStatus.data.userId !== req.user?.userId) {
        res.status(403).json({ error: 'Not authorized to cancel this job' });
        return;
      }

      const cancelled = await jobQueueService.cancelJob(jobId);
      
      if (cancelled) {
        res.json({
          success: true,
          message: 'Job cancelled successfully'
        });
      } else {
        res.status(400).json({ error: 'Failed to cancel job' });
      }
    } catch (error) {
      console.error('Error cancelling job:', error);
      res.status(500).json({ 
        error: 'Failed to cancel job',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get user's jobs
   */
  async getUserJobs(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const limit = parseInt(req.query.limit as string) || 50;
      
      if (!userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const jobQueueService = getJobQueueService();
      if (!jobQueueService) {
        res.status(503).json({ error: 'Job queue service not available' });
        return;
      }

      const jobs = await jobQueueService.getUserJobs(userId, limit);
      
      res.json({
        success: true,
        data: {
          jobs,
          total: jobs.length
        }
      });
    } catch (error) {
      console.error('Error getting user jobs:', error);
      res.status(500).json({ 
        error: 'Failed to get user jobs',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get project's jobs
   */
  async getProjectJobs(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;
      
      const jobQueueService = getJobQueueService();
      if (!jobQueueService) {
        res.status(503).json({ error: 'Job queue service not available' });
        return;
      }

      const jobs = await jobQueueService.getProjectJobs(projectId, limit);
      
      res.json({
        success: true,
        data: {
          projectId,
          jobs,
          total: jobs.length
        }
      });
    } catch (error) {
      console.error('Error getting project jobs:', error);
      res.status(500).json({ 
        error: 'Failed to get project jobs',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get queue statistics (admin only)
   */
  async getQueueStats(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      // TODO: Add admin role check
      const jobQueueService = getJobQueueService();
      if (!jobQueueService) {
        res.status(503).json({ error: 'Job queue service not available' });
        return;
      }

      const stats = await jobQueueService.getAllQueueStats();
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error getting queue stats:', error);
      res.status(500).json({ 
        error: 'Failed to get queue statistics',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get worker statistics (admin only)
   */
  async getWorkerStats(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      // TODO: Add admin role check
      const jobWorkerService = getJobWorkerService();
      if (!jobWorkerService) {
        res.status(503).json({ error: 'Job worker service not available' });
        return;
      }

      const stats = await jobWorkerService.getWorkerStats();
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error getting worker stats:', error);
      res.status(500).json({ 
        error: 'Failed to get worker statistics',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Pause queue (admin only)
   */
  async pauseQueue(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      // TODO: Add admin role check
      const { jobType } = req.params;
      
      if (!Object.values(JobType).includes(jobType as JobType)) {
        res.status(400).json({ error: 'Invalid job type' });
        return;
      }

      const jobQueueService = getJobQueueService();
      if (!jobQueueService) {
        res.status(503).json({ error: 'Job queue service not available' });
        return;
      }

      await jobQueueService.pauseQueue(jobType as JobType);
      
      res.json({
        success: true,
        message: `Queue ${jobType} paused successfully`
      });
    } catch (error) {
      console.error('Error pausing queue:', error);
      res.status(500).json({ 
        error: 'Failed to pause queue',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Resume queue (admin only)
   */
  async resumeQueue(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      // TODO: Add admin role check
      const { jobType } = req.params;
      
      if (!Object.values(JobType).includes(jobType as JobType)) {
        res.status(400).json({ error: 'Invalid job type' });
        return;
      }

      const jobQueueService = getJobQueueService();
      if (!jobQueueService) {
        res.status(503).json({ error: 'Job queue service not available' });
        return;
      }

      await jobQueueService.resumeQueue(jobType as JobType);
      
      res.json({
        success: true,
        message: `Queue ${jobType} resumed successfully`
      });
    } catch (error) {
      console.error('Error resuming queue:', error);
      res.status(500).json({ 
        error: 'Failed to resume queue',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Clean queue (admin only)
   */
  async cleanQueue(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      // TODO: Add admin role check
      const { jobType } = req.params;
      const grace = parseInt(req.query.grace as string) || 3600000; // 1 hour default
      
      if (!Object.values(JobType).includes(jobType as JobType)) {
        res.status(400).json({ error: 'Invalid job type' });
        return;
      }

      const jobQueueService = getJobQueueService();
      if (!jobQueueService) {
        res.status(503).json({ error: 'Job queue service not available' });
        return;
      }

      await jobQueueService.cleanQueue(jobType as JobType, grace);
      
      res.json({
        success: true,
        message: `Queue ${jobType} cleaned successfully`
      });
    } catch (error) {
      console.error('Error cleaning queue:', error);
      res.status(500).json({ 
        error: 'Failed to clean queue',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

export const jobController = new JobController();