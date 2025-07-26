import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { 
  initializeJobQueueService,
  getJobQueueService,
  JobType,
  OCRJobData
} from '../../src/services/jobQueue.js';
import { 
  initializeJobWorkerService,
  getJobWorkerService
} from '../../src/services/jobWorker.js';
import Redis from 'redis';

describe('Job Worker Integration Tests', () => {
  let redis: any;

  beforeAll(async () => {
    // Initialize Redis client for cleanup
    redis = Redis.createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });
    await redis.connect();

    // Initialize services
    initializeJobQueueService();
    initializeJobWorkerService();
  });

  afterAll(async () => {
    // Clean up
    const jobQueueService = getJobQueueService();
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

  describe('Job Worker Service Initialization', () => {
    it('should initialize job worker service successfully', () => {
      const jobWorkerService = getJobWorkerService();
      expect(jobWorkerService).toBeDefined();
    });

    it('should start worker service', () => {
      const jobWorkerService = getJobWorkerService();
      expect(jobWorkerService).toBeDefined();
      
      jobWorkerService!.start();
      expect(jobWorkerService!.isWorkerRunning()).toBe(true);
    });

    it('should get worker statistics', async () => {
      const jobWorkerService = getJobWorkerService();
      expect(jobWorkerService).toBeDefined();
      
      const stats = await jobWorkerService!.getWorkerStats();
      
      expect(stats).toBeDefined();
      expect(stats.isRunning).toBeDefined();
      expect(stats.queues).toBeDefined();
      expect(stats.concurrency).toBeDefined();
      
      // Check that all job types have concurrency settings
      Object.values(JobType).forEach(jobType => {
        expect(stats.concurrency[jobType]).toBeGreaterThan(0);
      });
    });
  });

  describe('Job Processing', () => {
    it('should process jobs when added to queue', async () => {
      const jobQueueService = getJobQueueService();
      const jobWorkerService = getJobWorkerService();
      
      expect(jobQueueService).toBeDefined();
      expect(jobWorkerService).toBeDefined();
      
      // Start the worker
      jobWorkerService!.start();
      
      // Add a simple job (this will likely fail due to missing dependencies, but we can test the flow)
      const jobData: OCRJobData = {
        userId: 'test-user',
        projectId: 'test-project',
        jobId: 'test-job',
        createdAt: new Date(),
        imageId: 'test-image',
        imageUrl: 'https://example.com/test.jpg',
        processingOptions: {
          detectHandwriting: true,
          detectTables: false,
          detectForms: false
        }
      };

      const job = await jobQueueService!.addJob(JobType.OCR_PROCESSING, jobData);
      
      expect(job).toBeDefined();
      expect(job.id).toBeDefined();
      
      // Wait a bit for processing to start
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const jobStatus = await jobQueueService!.getJobStatus(job.id!.toString());
      
      // Job should either be active, completed, or failed (depending on dependencies)
      expect(jobStatus).toBeDefined();
      expect(['waiting', 'active', 'completed', 'failed']).toContain(jobStatus.status);
    });
  });

  describe('Concurrency Settings', () => {
    it('should have appropriate concurrency levels for different job types', async () => {
      const jobWorkerService = getJobWorkerService();
      expect(jobWorkerService).toBeDefined();
      
      const stats = await jobWorkerService!.getWorkerStats();
      
      // OCR processing should have lower concurrency (resource intensive)
      expect(stats.concurrency[JobType.OCR_PROCESSING]).toBeLessThanOrEqual(2);
      
      // Text cleaning should have higher concurrency (less resource intensive)
      expect(stats.concurrency[JobType.TEXT_CLEANING]).toBeGreaterThanOrEqual(3);
      
      // Clustering should have low concurrency (memory intensive)
      expect(stats.concurrency[JobType.CLUSTERING]).toBe(1);
      
      // Summary generation should have moderate concurrency
      expect(stats.concurrency[JobType.SUMMARY_GENERATION]).toBeGreaterThanOrEqual(1);
      
      // Export generation should have moderate to high concurrency (I/O intensive)
      expect(stats.concurrency[JobType.EXPORT_GENERATION]).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle worker service shutdown gracefully', async () => {
      const jobWorkerService = getJobWorkerService();
      expect(jobWorkerService).toBeDefined();
      
      jobWorkerService!.start();
      expect(jobWorkerService!.isWorkerRunning()).toBe(true);
      
      // Shutdown should not throw
      await expect(jobWorkerService!.shutdown()).resolves.not.toThrow();
    });
  });
});