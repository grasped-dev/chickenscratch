import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { 
  JobQueueService, 
  JobType, 
  JobPriority, 
  OCRJobData,
  TextCleaningJobData,
  ClusteringJobData,
  initializeJobQueueService,
  getJobQueueService
} from '../../src/services/jobQueue.js';
import Redis from 'redis';

describe('Job Queue Integration Tests', () => {
  let jobQueueService: JobQueueService;
  let redis: any;

  beforeAll(async () => {
    // Initialize Redis client for cleanup
    redis = Redis.createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });
    await redis.connect();

    // Initialize job queue service
    jobQueueService = initializeJobQueueService();
  });

  afterAll(async () => {
    // Clean up
    if (jobQueueService) {
      await jobQueueService.shutdown();
    }
    if (redis) {
      await redis.quit();
    }
  });

  beforeEach(async () => {
    // Clean Redis before each test
    await redis.flushDb();
  });

  describe('Job Queue Service Initialization', () => {
    it('should initialize job queue service successfully', () => {
      expect(jobQueueService).toBeDefined();
      expect(getJobQueueService()).toBe(jobQueueService);
    });

    it('should create queues for all job types', async () => {
      const stats = await jobQueueService.getAllQueueStats();
      
      expect(stats).toBeDefined();
      expect(stats[JobType.OCR_PROCESSING]).toBeDefined();
      expect(stats[JobType.TEXT_CLEANING]).toBeDefined();
      expect(stats[JobType.CLUSTERING]).toBeDefined();
      expect(stats[JobType.SUMMARY_GENERATION]).toBeDefined();
      expect(stats[JobType.EXPORT_GENERATION]).toBeDefined();
    });
  });

  describe('Job Management', () => {
    it('should add OCR job to queue successfully', async () => {
      const jobData: OCRJobData = {
        userId: 'user-123',
        projectId: 'project-456',
        jobId: 'job-789',
        createdAt: new Date(),
        imageId: 'image-123',
        imageUrl: 'https://example.com/image.jpg',
        processingOptions: {
          detectHandwriting: true,
          detectTables: false,
          detectForms: false
        }
      };

      const job = await jobQueueService.addJob(JobType.OCR_PROCESSING, jobData, {
        priority: JobPriority.HIGH
      });

      expect(job).toBeDefined();
      expect(job.id).toBeDefined();
      expect(job.data).toEqual(jobData);
    });

    it('should get job status correctly', async () => {
      const jobData: TextCleaningJobData = {
        userId: 'user-123',
        projectId: 'project-456',
        jobId: 'job-789',
        createdAt: new Date(),
        imageId: 'image-123',
        rawTextBlocks: [
          { text: 'Hello world', confidence: 0.95, boundingBox: { left: 0, top: 0, width: 100, height: 20 } }
        ],
        cleaningOptions: {
          spellCheck: true,
          removeArtifacts: true,
          normalizeSpacing: true
        }
      };

      const job = await jobQueueService.addJob(JobType.TEXT_CLEANING, jobData);
      const jobStatus = await jobQueueService.getJobStatus(job.id!.toString());

      expect(jobStatus).toBeDefined();
      expect(jobStatus.id).toBe(job.id);
      expect(jobStatus.type).toBe(JobType.TEXT_CLEANING);
      expect(jobStatus.data.userId).toBe(jobData.userId);
      expect(jobStatus.data.projectId).toBe(jobData.projectId);
      expect(jobStatus.data.imageId).toBe(jobData.imageId);
    });

    it('should cancel job successfully', async () => {
      const jobData: ClusteringJobData = {
        userId: 'user-123',
        projectId: 'project-456',
        jobId: 'job-789',
        createdAt: new Date(),
        textBlocks: [
          { id: '1', text: 'Hello world', cleanedText: 'Hello world' },
          { id: '2', text: 'Goodbye world', cleanedText: 'Goodbye world' }
        ],
        clusteringMethod: 'embeddings'
      };

      const job = await jobQueueService.addJob(JobType.CLUSTERING, jobData);
      const cancelled = await jobQueueService.cancelJob(job.id!.toString());

      expect(cancelled).toBe(true);

      const jobStatus = await jobQueueService.getJobStatus(job.id!.toString());
      expect(jobStatus).toBeNull();
    });
  });

  describe('Queue Statistics', () => {
    it('should return correct queue statistics', async () => {
      // Add some jobs
      const jobData1: OCRJobData = {
        userId: 'user-123',
        projectId: 'project-456',
        jobId: 'job-1',
        createdAt: new Date(),
        imageId: 'image-1',
        imageUrl: 'https://example.com/image1.jpg',
        processingOptions: {
          detectHandwriting: true,
          detectTables: false,
          detectForms: false
        }
      };

      const jobData2: OCRJobData = {
        userId: 'user-123',
        projectId: 'project-456',
        jobId: 'job-2',
        createdAt: new Date(),
        imageId: 'image-2',
        imageUrl: 'https://example.com/image2.jpg',
        processingOptions: {
          detectHandwriting: true,
          detectTables: false,
          detectForms: false
        }
      };

      await jobQueueService.addJob(JobType.OCR_PROCESSING, jobData1);
      await jobQueueService.addJob(JobType.OCR_PROCESSING, jobData2);

      const stats = await jobQueueService.getQueueStats(JobType.OCR_PROCESSING);
      
      expect(stats).toBeDefined();
      expect(stats.waiting).toBe(2);
      expect(stats.active).toBe(0);
      expect(stats.total).toBe(2);
    });

    it('should return all queue statistics', async () => {
      const allStats = await jobQueueService.getAllQueueStats();
      
      expect(allStats).toBeDefined();
      expect(Object.keys(allStats)).toHaveLength(5);
      
      Object.values(JobType).forEach(jobType => {
        expect(allStats[jobType]).toBeDefined();
        expect(allStats[jobType]).toHaveProperty('waiting');
        expect(allStats[jobType]).toHaveProperty('active');
        expect(allStats[jobType]).toHaveProperty('completed');
        expect(allStats[jobType]).toHaveProperty('failed');
        expect(allStats[jobType]).toHaveProperty('total');
      });
    });
  });

  describe('User and Project Job Queries', () => {
    it('should get user jobs correctly', async () => {
      const userId = 'user-123';
      const jobData: OCRJobData = {
        userId,
        projectId: 'project-456',
        jobId: 'job-789',
        createdAt: new Date(),
        imageId: 'image-123',
        imageUrl: 'https://example.com/image.jpg',
        processingOptions: {
          detectHandwriting: true,
          detectTables: false,
          detectForms: false
        }
      };

      await jobQueueService.addJob(JobType.OCR_PROCESSING, jobData);
      
      // Wait a bit for metadata to be stored
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const userJobs = await jobQueueService.getUserJobs(userId);
      
      expect(userJobs).toBeDefined();
      expect(userJobs.length).toBeGreaterThan(0);
      expect(userJobs[0].data.userId).toBe(userId);
    });

    it('should get project jobs correctly', async () => {
      const projectId = 'project-456';
      const jobData: TextCleaningJobData = {
        userId: 'user-123',
        projectId,
        jobId: 'job-789',
        createdAt: new Date(),
        imageId: 'image-123',
        rawTextBlocks: [
          { text: 'Test text', confidence: 0.9, boundingBox: { left: 0, top: 0, width: 100, height: 20 } }
        ],
        cleaningOptions: {
          spellCheck: true,
          removeArtifacts: true,
          normalizeSpacing: true
        }
      };

      await jobQueueService.addJob(JobType.TEXT_CLEANING, jobData);
      
      // Wait a bit for metadata to be stored
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const projectJobs = await jobQueueService.getProjectJobs(projectId);
      
      expect(projectJobs).toBeDefined();
      expect(projectJobs.length).toBeGreaterThan(0);
      expect(projectJobs[0].data.projectId).toBe(projectId);
    });
  });

  describe('Queue Management', () => {
    it('should pause and resume queue successfully', async () => {
      await jobQueueService.pauseQueue(JobType.OCR_PROCESSING);
      // Note: We can't easily test the paused state without accessing internal queue state
      
      await jobQueueService.resumeQueue(JobType.OCR_PROCESSING);
      // Queue should be resumed
    });

    it('should clean queue successfully', async () => {
      // Add a job first
      const jobData: OCRJobData = {
        userId: 'user-123',
        projectId: 'project-456',
        jobId: 'job-789',
        createdAt: new Date(),
        imageId: 'image-123',
        imageUrl: 'https://example.com/image.jpg',
        processingOptions: {
          detectHandwriting: true,
          detectTables: false,
          detectForms: false
        }
      };

      await jobQueueService.addJob(JobType.OCR_PROCESSING, jobData);
      
      // Clean with very short grace period
      await jobQueueService.cleanQueue(JobType.OCR_PROCESSING, 0);
      
      // Should not throw error
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid job type gracefully', async () => {
      const invalidJobType = 'invalid-job-type' as JobType;
      
      try {
        await jobQueueService.addJob(invalidJobType, {} as any);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('not found');
      }
    });

    it('should return null for non-existent job status', async () => {
      const jobStatus = await jobQueueService.getJobStatus('non-existent-job-id');
      expect(jobStatus).toBeNull();
    });

    it('should return false when cancelling non-existent job', async () => {
      const cancelled = await jobQueueService.cancelJob('non-existent-job-id');
      expect(cancelled).toBe(false);
    });
  });
});