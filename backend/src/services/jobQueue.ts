import Bull, { Job, Queue, JobOptions } from 'bull';
import Redis from 'redis';
import { config } from '../config/index.js';
import { getWebSocketService } from './websocket.js';

// Job types
export enum JobType {
  OCR_PROCESSING = 'ocr-processing',
  TEXT_CLEANING = 'text-cleaning',
  CLUSTERING = 'clustering',
  SUMMARY_GENERATION = 'summary-generation',
  EXPORT_GENERATION = 'export-generation'
}

// Job priorities
export enum JobPriority {
  LOW = 1,
  NORMAL = 5,
  HIGH = 10,
  CRITICAL = 15
}

// Job status
export enum JobStatus {
  WAITING = 'waiting',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  FAILED = 'failed',
  DELAYED = 'delayed',
  PAUSED = 'paused'
}

// Job data interfaces
export interface BaseJobData {
  userId: string;
  projectId: string;
  jobId: string;
  createdAt: Date;
}

export interface OCRJobData extends BaseJobData {
  imageId: string;
  imageUrl: string;
  processingOptions: {
    detectHandwriting: boolean;
    detectTables: boolean;
    detectForms: boolean;
  };
}

export interface TextCleaningJobData extends BaseJobData {
  imageId: string;
  rawTextBlocks: any[];
  cleaningOptions: {
    spellCheck: boolean;
    removeArtifacts: boolean;
    normalizeSpacing: boolean;
  };
}

export interface ClusteringJobData extends BaseJobData {
  textBlocks: any[];
  clusteringMethod: 'embeddings' | 'llm' | 'hybrid';
  targetClusters?: number;
}

export interface SummaryJobData extends BaseJobData {
  clusters: any[];
  summaryOptions: {
    includeQuotes: boolean;
    includeDistribution: boolean;
    maxThemes: number;
  };
}

export interface ExportJobData extends BaseJobData {
  format: 'pdf' | 'csv';
  exportOptions: {
    includeSummary: boolean;
    includeOriginalText: boolean;
    includeImages: boolean;
    customTemplate?: string;
  };
}

export type JobData = OCRJobData | TextCleaningJobData | ClusteringJobData | SummaryJobData | ExportJobData;

// Job progress interface
export interface JobProgress {
  percentage: number;
  message: string;
  stage: string;
  data?: any;
}

// Job result interface
export interface JobResult {
  success: boolean;
  data?: any;
  error?: string;
  processingTime: number;
  completedAt: Date;
}

export class JobQueueService {
  private queues: Map<JobType, Queue> = new Map();
  private redis: Redis.RedisClientType;

  constructor() {
    this.initializeRedis();
    this.initializeQueues();
  }

  private async initializeRedis() {
    this.redis = Redis.createClient({
      url: config.redisUrl
    });

    this.redis.on('error', (err) => {
      console.error('Redis connection error:', err);
    });

    this.redis.on('connect', () => {
      console.log('Connected to Redis');
    });

    await this.redis.connect();
  }

  private initializeQueues() {
    // Create queues for each job type
    Object.values(JobType).forEach(jobType => {
      const queue = new Bull(jobType, config.redisUrl, {
        defaultJobOptions: {
          removeOnComplete: 100, // Keep last 100 completed jobs
          removeOnFail: 50,      // Keep last 50 failed jobs
          attempts: 3,           // Retry failed jobs 3 times
          backoff: {
            type: 'exponential',
            delay: 2000,         // Start with 2 second delay
          },
        },
        settings: {
          stalledInterval: 30 * 1000,    // Check for stalled jobs every 30 seconds
          maxStalledCount: 1,            // Max number of times a job can be stalled
        }
      });

      // Set up job event handlers
      this.setupJobEventHandlers(queue, jobType);
      
      this.queues.set(jobType, queue);
    });

    console.log(`Initialized ${this.queues.size} job queues`);
  }

  private setupJobEventHandlers(queue: Queue, jobType: JobType) {
    // Job started
    queue.on('active', (job: Job) => {
      console.log(`Job ${job.id} (${jobType}) started processing`);
      this.notifyJobStatus(job, JobStatus.ACTIVE);
    });

    // Job completed
    queue.on('completed', (job: Job, result: JobResult) => {
      console.log(`Job ${job.id} (${jobType}) completed successfully`);
      this.notifyJobStatus(job, JobStatus.COMPLETED, result);
    });

    // Job failed
    queue.on('failed', (job: Job, err: Error) => {
      console.error(`Job ${job.id} (${jobType}) failed:`, err.message);
      this.notifyJobStatus(job, JobStatus.FAILED, { error: err.message });
    });

    // Job progress
    queue.on('progress', (job: Job, progress: JobProgress) => {
      console.log(`Job ${job.id} (${jobType}) progress: ${progress.percentage}%`);
      this.notifyJobProgress(job, progress);
    });

    // Job stalled
    queue.on('stalled', (job: Job) => {
      console.warn(`Job ${job.id} (${jobType}) stalled`);
      this.notifyJobStatus(job, JobStatus.FAILED, { error: 'Job stalled' });
    });
  }

  /**
   * Add a job to the queue
   */
  async addJob(
    jobType: JobType,
    data: JobData,
    options: JobOptions = {}
  ): Promise<Job> {
    const queue = this.queues.get(jobType);
    if (!queue) {
      throw new Error(`Queue for job type ${jobType} not found`);
    }

    // Set default priority if not specified
    if (!options.priority) {
      options.priority = JobPriority.NORMAL;
    }

    // Add delay for retry jobs
    if (options.delay) {
      options.delay = Math.min(options.delay, 300000); // Max 5 minutes delay
    }

    const job = await queue.add(data, options);
    
    console.log(`Added job ${job.id} (${jobType}) to queue with priority ${options.priority}`);
    
    // Store job metadata in Redis for tracking
    await this.storeJobMetadata(job.id!.toString(), {
      jobType,
      userId: data.userId,
      projectId: data.projectId,
      status: JobStatus.WAITING,
      createdAt: new Date(),
      priority: options.priority || JobPriority.NORMAL
    });

    return job;
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string): Promise<any> {
    const metadata = await this.getJobMetadata(jobId);
    if (!metadata) {
      return null;
    }

    const queue = this.queues.get(metadata.jobType);
    if (!queue) {
      return null;
    }

    const job = await queue.getJob(jobId);
    if (!job) {
      return null;
    }

    return {
      id: job.id,
      type: metadata.jobType,
      status: await job.getState(),
      progress: job.progress(),
      data: job.data,
      result: job.returnvalue,
      failedReason: job.failedReason,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      attempts: job.attemptsMade,
      priority: metadata.priority,
      createdAt: metadata.createdAt
    };
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    const metadata = await this.getJobMetadata(jobId);
    if (!metadata) {
      return false;
    }

    const queue = this.queues.get(metadata.jobType);
    if (!queue) {
      return false;
    }

    const job = await queue.getJob(jobId);
    if (!job) {
      return false;
    }

    try {
      await job.remove();
      await this.removeJobMetadata(jobId);
      console.log(`Cancelled job ${jobId}`);
      return true;
    } catch (error) {
      console.error(`Failed to cancel job ${jobId}:`, error);
      return false;
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(jobType: JobType): Promise<any> {
    const queue = this.queues.get(jobType);
    if (!queue) {
      return null;
    }

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaiting(),
      queue.getActive(),
      queue.getCompleted(),
      queue.getFailed(),
      queue.getDelayed()
    ]);
    
    // Get paused status
    const isPaused = await queue.isPaused();

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
      paused: isPaused ? 1 : 0,
      total: waiting.length + active.length + completed.length + failed.length + delayed.length
    };
  }

  /**
   * Get all queue statistics
   */
  async getAllQueueStats(): Promise<Record<JobType, any>> {
    const stats: Record<string, any> = {};
    
    for (const jobType of Object.values(JobType)) {
      stats[jobType] = await this.getQueueStats(jobType);
    }
    
    return stats;
  }

  /**
   * Get user's jobs
   */
  async getUserJobs(userId: string, limit: number = 50): Promise<any[]> {
    const pattern = `job:*`;
    const keys = await this.redis.keys(pattern);
    const jobs = [];

    for (const key of keys) {
      const metadata = await this.redis.hGetAll(key);
      if (metadata.userId === userId) {
        const jobId = key.split(':')[1];
        const jobStatus = await this.getJobStatus(jobId);
        if (jobStatus) {
          jobs.push(jobStatus);
        }
      }
    }

    // Sort by creation date (newest first) and limit
    return jobs
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  /**
   * Get project's jobs
   */
  async getProjectJobs(projectId: string, limit: number = 50): Promise<any[]> {
    const pattern = `job:*`;
    const keys = await this.redis.keys(pattern);
    const jobs = [];

    for (const key of keys) {
      const metadata = await this.redis.hGetAll(key);
      if (metadata.projectId === projectId) {
        const jobId = key.split(':')[1];
        const jobStatus = await this.getJobStatus(jobId);
        if (jobStatus) {
          jobs.push(jobStatus);
        }
      }
    }

    // Sort by creation date (newest first) and limit
    return jobs
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  /**
   * Pause a queue
   */
  async pauseQueue(jobType: JobType): Promise<void> {
    const queue = this.queues.get(jobType);
    if (queue) {
      await queue.pause();
      console.log(`Paused queue: ${jobType}`);
    }
  }

  /**
   * Resume a queue
   */
  async resumeQueue(jobType: JobType): Promise<void> {
    const queue = this.queues.get(jobType);
    if (queue) {
      await queue.resume();
      console.log(`Resumed queue: ${jobType}`);
    }
  }

  /**
   * Clean completed jobs
   */
  async cleanQueue(jobType: JobType, grace: number = 3600000): Promise<void> {
    const queue = this.queues.get(jobType);
    if (queue) {
      await queue.clean(grace, 'completed');
      await queue.clean(grace, 'failed');
      console.log(`Cleaned queue: ${jobType}`);
    }
  }

  private async storeJobMetadata(jobId: string, metadata: any): Promise<void> {
    const key = `job:${jobId}`;
    await this.redis.hSet(key, {
      ...metadata,
      createdAt: metadata.createdAt.toISOString()
    });
    // Set expiration for 7 days
    await this.redis.expire(key, 7 * 24 * 60 * 60);
  }

  private async getJobMetadata(jobId: string): Promise<any> {
    const key = `job:${jobId}`;
    const metadata = await this.redis.hGetAll(key);
    
    if (Object.keys(metadata).length === 0) {
      return null;
    }

    return {
      ...metadata,
      createdAt: new Date(metadata.createdAt),
      priority: parseInt(metadata.priority)
    };
  }

  private async removeJobMetadata(jobId: string): Promise<void> {
    const key = `job:${jobId}`;
    await this.redis.del(key);
  }

  private notifyJobStatus(job: Job, status: JobStatus, result?: any): void {
    const webSocketService = getWebSocketService();
    if (!webSocketService) return;

    const data = job.data as BaseJobData;
    
    // Notify user
    webSocketService.sendNotification(data.userId, {
      type: status === JobStatus.COMPLETED ? 'success' : 
            status === JobStatus.FAILED ? 'error' : 'info',
      title: `Job ${status}`,
      message: `${job.name} ${status}`,
      data: {
        jobId: job.id,
        jobType: job.name,
        status,
        result
      }
    });

    // Notify project room
    webSocketService.sendProjectProcessingStatus(data.projectId, {
      fileId: job.id!.toString(),
      status: status === JobStatus.ACTIVE ? 'processing' :
              status === JobStatus.COMPLETED ? 'completed' :
              status === JobStatus.FAILED ? 'failed' : 'pending',
      progress: status === JobStatus.COMPLETED ? 100 : 
                status === JobStatus.FAILED ? 0 : 50,
      message: `${job.name} ${status}`,
      error: result?.error
    });
  }

  private notifyJobProgress(job: Job, progress: JobProgress): void {
    const webSocketService = getWebSocketService();
    if (!webSocketService) return;

    const data = job.data as BaseJobData;
    
    // Notify project room
    webSocketService.sendProjectProcessingStatus(data.projectId, {
      fileId: job.id!.toString(),
      status: 'processing',
      progress: progress.percentage,
      message: progress.message
    });
  }

  /**
   * Shutdown all queues gracefully
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down job queues...');
    
    const shutdownPromises = Array.from(this.queues.values()).map(queue => 
      queue.close()
    );
    
    await Promise.all(shutdownPromises);
    await this.redis.quit();
    
    console.log('Job queues shut down successfully');
  }
}

// Singleton instance
let jobQueueService: JobQueueService | null = null;

export const initializeJobQueueService = (): JobQueueService => {
  if (!jobQueueService) {
    jobQueueService = new JobQueueService();
  }
  return jobQueueService;
};

export const getJobQueueService = (): JobQueueService | null => {
  return jobQueueService;
};