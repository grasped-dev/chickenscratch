import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { performance } from 'perf_hooks';
import { createPool, closePool } from '../config/database.js';
import { app } from '../server.js';

describe('Performance Tests', () => {
  beforeAll(async () => {
    createPool();
  });

  afterAll(async () => {
    await closePool();
  });

  describe('API Response Times', () => {
    it('should handle authentication within performance thresholds', async () => {
      const iterations = 100;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        
        await request(app)
          .post('/api/auth/login')
          .send({
            email: 'test@example.com',
            password: 'testpassword123'
          });
        
        const end = performance.now();
        times.push(end - start);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const p95Time = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)];

      expect(avgTime).toBeLessThan(100); // Average response time < 100ms
      expect(p95Time).toBeLessThan(200); // 95th percentile < 200ms
    });

    it('should handle project listing within performance thresholds', async () => {
      // Create test user and login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'testpassword123'
        });

      const token = loginResponse.body.data.token;
      const iterations = 50;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        
        await request(app)
          .get('/api/projects')
          .set('Authorization', `Bearer ${token}`);
        
        const end = performance.now();
        times.push(end - start);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const p95Time = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)];

      expect(avgTime).toBeLessThan(150); // Average response time < 150ms
      expect(p95Time).toBeLessThan(300); // 95th percentile < 300ms
    });

    it('should handle concurrent requests efficiently', async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'testpassword123'
        });

      const token = loginResponse.body.data.token;
      const concurrentRequests = 20;
      
      const start = performance.now();
      
      const promises = Array.from({ length: concurrentRequests }, () =>
        request(app)
          .get('/api/projects')
          .set('Authorization', `Bearer ${token}`)
      );

      const responses = await Promise.all(promises);
      const end = performance.now();

      const totalTime = end - start;
      const avgTimePerRequest = totalTime / concurrentRequests;

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Average time per concurrent request should be reasonable
      expect(avgTimePerRequest).toBeLessThan(500);
    });
  });

  describe('Database Performance', () => {
    it('should handle large dataset queries efficiently', async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'testpassword123'
        });

      const token = loginResponse.body.data.token;

      // Test with large page size
      const start = performance.now();
      
      const response = await request(app)
        .get('/api/projects?limit=100')
        .set('Authorization', `Bearer ${token}`);
      
      const end = performance.now();
      const queryTime = end - start;

      expect(response.status).toBe(200);
      expect(queryTime).toBeLessThan(1000); // Query should complete in < 1s
    });

    it('should handle complex filtering efficiently', async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'testpassword123'
        });

      const token = loginResponse.body.data.token;

      const start = performance.now();
      
      const response = await request(app)
        .get('/api/projects?status=completed&dateFrom=2024-01-01&dateTo=2024-12-31&search=test')
        .set('Authorization', `Bearer ${token}`);
      
      const end = performance.now();
      const queryTime = end - start;

      expect(response.status).toBe(200);
      expect(queryTime).toBeLessThan(800); // Complex query should complete in < 800ms
    });
  });

  describe('Memory Usage', () => {
    it('should not have memory leaks during repeated operations', async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'testpassword123'
        });

      const token = loginResponse.body.data.token;
      
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Perform many operations
      for (let i = 0; i < 100; i++) {
        await request(app)
          .get('/api/projects')
          .set('Authorization', `Bearer ${token}`);
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });
  });

  describe('File Upload Performance', () => {
    it('should handle file uploads within performance thresholds', async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'testpassword123'
        });

      const token = loginResponse.body.data.token;

      // Create a test project
      const projectResponse = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Performance Test Project',
          description: 'Testing upload performance'
        });

      const projectId = projectResponse.body.data.id;

      // Create a small test image buffer
      const testImageBuffer = Buffer.from('test-image-data');
      
      const start = performance.now();
      
      const uploadResponse = await request(app)
        .post('/api/upload')
        .set('Authorization', `Bearer ${token}`)
        .field('projectId', projectId)
        .attach('files', testImageBuffer, 'test.jpg');
      
      const end = performance.now();
      const uploadTime = end - start;

      expect(uploadResponse.status).toBe(200);
      expect(uploadTime).toBeLessThan(2000); // Upload should complete in < 2s
    });

    it('should handle multiple concurrent uploads', async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'testpassword123'
        });

      const token = loginResponse.body.data.token;

      // Create test projects
      const projectPromises = Array.from({ length: 5 }, (_, i) =>
        request(app)
          .post('/api/projects')
          .set('Authorization', `Bearer ${token}`)
          .send({
            name: `Concurrent Test Project ${i}`,
            description: 'Testing concurrent uploads'
          })
      );

      const projectResponses = await Promise.all(projectPromises);
      const testImageBuffer = Buffer.from('test-image-data');
      
      const start = performance.now();
      
      const uploadPromises = projectResponses.map(projectResponse =>
        request(app)
          .post('/api/upload')
          .set('Authorization', `Bearer ${token}`)
          .field('projectId', projectResponse.body.data.id)
          .attach('files', testImageBuffer, 'test.jpg')
      );

      const uploadResponses = await Promise.all(uploadPromises);
      const end = performance.now();
      
      const totalTime = end - start;

      // All uploads should succeed
      uploadResponses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Concurrent uploads should complete in reasonable time
      expect(totalTime).toBeLessThan(10000); // < 10s for 5 concurrent uploads
    });
  });

  describe('Processing Performance', () => {
    it('should handle OCR processing within time limits', async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'testpassword123'
        });

      const token = loginResponse.body.data.token;

      // Mock OCR processing time
      const start = performance.now();
      
      const response = await request(app)
        .post('/api/ocr/process')
        .set('Authorization', `Bearer ${token}`)
        .send({
          imageUrl: 'https://example.com/test-image.jpg',
          processingOptions: {
            detectHandwriting: true,
            detectTables: false,
            detectForms: false
          }
        });
      
      const end = performance.now();
      const processingTime = end - start;

      expect(response.status).toBe(200);
      expect(processingTime).toBeLessThan(5000); // OCR should complete in < 5s
    });

    it('should handle clustering within performance thresholds', async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'testpassword123'
        });

      const token = loginResponse.body.data.token;

      // Create test text blocks
      const textBlocks = Array.from({ length: 50 }, (_, i) => ({
        id: `block-${i}`,
        text: `Test text block ${i}`,
        confidence: 0.9
      }));

      const start = performance.now();
      
      const response = await request(app)
        .post('/api/clustering/analyze')
        .set('Authorization', `Bearer ${token}`)
        .send({
          textBlocks,
          clusteringMethod: 'embeddings',
          targetClusters: 5
        });
      
      const end = performance.now();
      const clusteringTime = end - start;

      expect(response.status).toBe(200);
      expect(clusteringTime).toBeLessThan(10000); // Clustering should complete in < 10s
    });
  });
});