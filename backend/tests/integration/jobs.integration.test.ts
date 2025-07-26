import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { initializeJobQueueService, getJobQueueService, JobType, OCRJobData } from '../../src/services/jobQueue.js';
import jobRoutes from '../../src/routes/jobs.js';
import { authenticateToken } from '../../src/middleware/auth.js';
import jwt from 'jsonwebtoken';
import { config } from '../../src/config/index.js';
import Redis from 'redis';

// Mock authentication middleware for testing
const mockAuthMiddleware = (req: any, res: any, next: any) => {
  req.user = {
    userId: 'test-user-123',
    email: 'test@example.com',
    name: 'Test User'
  };
  next();
};

describe('Jobs API Integration Tests', () => {
  let app: express.Application;
  let redis: any;
  let authToken: string;

  beforeAll(async () => {
    // Initialize Redis client for cleanup
    redis = Redis.createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });
    await redis.connect();

    // Initialize job queue service
    initializeJobQueueService();

    // Create Express app for testing
    app = express();
    app.use(express.json());
    
    // Replace auth middleware with mock for testing
    app.use('/api/jobs', mockAuthMiddleware, jobRoutes);

    // Generate test JWT token
    authToken = jwt.sign(
      { userId: 'test-user-123', email: 'test@example.com', name: 'Test User' },
      config.jwtSecret,
      { expiresIn: '1h' }
    );
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

  describe('GET /api/jobs/:jobId', () => {
    it('should get job status successfully', async () => {
      const jobQueueService = getJobQueueService();
      expect(jobQueueService).toBeDefined();

      // Add a job first
      const jobData: OCRJobData = {
        userId: 'test-user-123',
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

      const response = await request(app)
        .get(`/api/jobs/${job.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.id).toBe(job.id);
      expect(response.body.data.type).toBe(JobType.OCR_PROCESSING);
    });

    it('should return 404 for non-existent job', async () => {
      const response = await request(app)
        .get('/api/jobs/non-existent-job')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.error).toBe('Job not found');
    });
  });

  describe('DELETE /api/jobs/:jobId', () => {
    it('should cancel job successfully', async () => {
      const jobQueueService = getJobQueueService();
      expect(jobQueueService).toBeDefined();

      // Add a job first
      const jobData: OCRJobData = {
        userId: 'test-user-123',
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

      const response = await request(app)
        .delete(`/api/jobs/${job.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Job cancelled successfully');
    });

    it('should return 404 for non-existent job', async () => {
      const response = await request(app)
        .delete('/api/jobs/non-existent-job')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.error).toBe('Job not found');
    });
  });

  describe('GET /api/jobs/user/jobs', () => {
    it('should get user jobs successfully', async () => {
      const jobQueueService = getJobQueueService();
      expect(jobQueueService).toBeDefined();

      // Add a job first
      const jobData: OCRJobData = {
        userId: 'test-user-123',
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

      await jobQueueService!.addJob(JobType.OCR_PROCESSING, jobData);

      // Wait a bit for metadata to be stored
      await new Promise(resolve => setTimeout(resolve, 100));

      const response = await request(app)
        .get('/api/jobs/user/jobs')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.jobs).toBeDefined();
      expect(Array.isArray(response.body.data.jobs)).toBe(true);
    });
  });

  describe('GET /api/jobs/project/:projectId/jobs', () => {
    it('should get project jobs successfully', async () => {
      const jobQueueService = getJobQueueService();
      expect(jobQueueService).toBeDefined();

      const projectId = 'test-project-456';

      // Add a job first
      const jobData: OCRJobData = {
        userId: 'test-user-123',
        projectId,
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

      await jobQueueService!.addJob(JobType.OCR_PROCESSING, jobData);

      // Wait a bit for metadata to be stored
      await new Promise(resolve => setTimeout(resolve, 100));

      const response = await request(app)
        .get(`/api/jobs/project/${projectId}/jobs`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.projectId).toBe(projectId);
      expect(response.body.data.jobs).toBeDefined();
      expect(Array.isArray(response.body.data.jobs)).toBe(true);
    });
  });

  describe('GET /api/jobs/admin/stats', () => {
    it('should get queue statistics successfully', async () => {
      const response = await request(app)
        .get('/api/jobs/admin/stats')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      
      // Check that all job types have statistics
      Object.values(JobType).forEach(jobType => {
        expect(response.body.data[jobType]).toBeDefined();
        expect(response.body.data[jobType]).toHaveProperty('waiting');
        expect(response.body.data[jobType]).toHaveProperty('active');
        expect(response.body.data[jobType]).toHaveProperty('completed');
        expect(response.body.data[jobType]).toHaveProperty('failed');
        expect(response.body.data[jobType]).toHaveProperty('total');
      });
    });
  });

  describe('POST /api/jobs/admin/queue/:jobType/pause', () => {
    it('should pause queue successfully', async () => {
      const response = await request(app)
        .post(`/api/jobs/admin/queue/${JobType.OCR_PROCESSING}/pause`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('paused successfully');
    });

    it('should return 400 for invalid job type', async () => {
      const response = await request(app)
        .post('/api/jobs/admin/queue/invalid-job-type/pause')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.error).toBe('Invalid job type');
    });
  });

  describe('POST /api/jobs/admin/queue/:jobType/resume', () => {
    it('should resume queue successfully', async () => {
      const response = await request(app)
        .post(`/api/jobs/admin/queue/${JobType.OCR_PROCESSING}/resume`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('resumed successfully');
    });
  });

  describe('POST /api/jobs/admin/queue/:jobType/clean', () => {
    it('should clean queue successfully', async () => {
      const response = await request(app)
        .post(`/api/jobs/admin/queue/${JobType.OCR_PROCESSING}/clean`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('cleaned successfully');
    });
  });

  describe('Error Handling', () => {
    it('should handle missing authorization', async () => {
      const response = await request(app)
        .get('/api/jobs/test-job')
        .expect(401);

      // The exact error message depends on the auth middleware implementation
      expect(response.status).toBe(401);
    });
  });
});