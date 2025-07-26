import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';

// Import routes and middleware
import uploadRoutes from '../routes/upload.js';
import { authMiddleware } from '../middleware/auth.js';
import { UserRepository } from '../models/UserRepository.js';
import { ProjectRepository } from '../models/ProjectRepository.js';
import { ProcessedImageRepository } from '../models/ProcessedImageRepository.js';

// Mock AWS SDK
const mockS3Upload = {
  promise: () => Promise.resolve({
    Location: 'https://test-bucket.s3.amazonaws.com/test-file.jpg',
    ETag: '"test-etag"',
    Bucket: 'test-bucket',
    Key: 'test-file.jpg'
  })
};

const mockS3Delete = {
  promise: () => Promise.resolve({})
};

const mockS3GetSignedUrl = () => 'https://test-bucket.s3.amazonaws.com/presigned-url';

// Mock the AWS SDK
vi.mock('aws-sdk', () => ({
  default: {
    S3: vi.fn(() => ({
      upload: vi.fn(() => mockS3Upload),
      deleteObject: vi.fn(() => mockS3Delete),
      getSignedUrl: vi.fn(() => mockS3GetSignedUrl())
    }))
  }
}));

describe('Upload Integration Tests', () => {
  let app: express.Application;
  let userRepo: UserRepository;
  let projectRepo: ProjectRepository;

  let testUser: any;
  let testProject: any;
  let authToken: string;

  beforeAll(async () => {
    // Setup test app
    app = express();
    app.use(cors());
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use('/api/upload', uploadRoutes);

    // Initialize repositories
    userRepo = new UserRepository();
    projectRepo = new ProjectRepository();
  });

  beforeEach(async () => {
    // Create test user
    testUser = await userRepo.create({
      email: `test-${uuidv4()}@example.com`,
      name: 'Test User',
      passwordHash: 'hashed-password'
    });

    // Generate auth token
    authToken = authMiddleware.generateToken({
      userId: testUser.id,
      email: testUser.email,
      name: testUser.name
    });

    // Create test project
    testProject = await projectRepo.create({
      userId: testUser.id,
      name: 'Test Project'
    });
  });

  afterAll(async () => {
    // Cleanup would go here in a real test environment
    // For now, we'll rely on the test database being cleaned up
  });

  describe('POST /api/upload/file', () => {
    it('should upload a single file successfully', async () => {
      // Create a proper JPEG buffer
      const jpegHeader = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
      const jpegData = Buffer.alloc(1024);
      const testImageBuffer = Buffer.concat([jpegHeader, jpegData]);
      
      const response = await request(app)
        .post('/api/upload/file')
        .set('Authorization', `Bearer ${authToken}`)
        .field('projectId', testProject.id)
        .attach('file', testImageBuffer, {
          filename: 'test-image.jpg',
          contentType: 'image/jpeg'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('uploadId');
      expect(response.body.data).toHaveProperty('fileIds');
      expect(response.body.data.fileIds).toHaveLength(1);
      expect(response.body.data.status).toBe('uploaded');
    });

    it('should reject upload without authentication', async () => {
      const testImageBuffer = Buffer.from('fake-image-data');
      
      const response = await request(app)
        .post('/api/upload/file')
        .field('projectId', testProject.id)
        .attach('file', testImageBuffer, {
          filename: 'test-image.jpg',
          contentType: 'image/jpeg'
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Authentication required');
      expect(response.body.code).toBe('MISSING_TOKEN');
    });

    it('should reject upload without file', async () => {
      const response = await request(app)
        .post('/api/upload/file')
        .set('Authorization', `Bearer ${authToken}`)
        .field('projectId', testProject.id);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('No file provided');
    });

    it('should reject upload without project ID', async () => {
      const testImageBuffer = Buffer.from('fake-image-data');
      
      const response = await request(app)
        .post('/api/upload/file')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', testImageBuffer, {
          filename: 'test-image.jpg',
          contentType: 'image/jpeg'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Project ID is required');
    });

    it('should reject upload to non-existent project', async () => {
      const testImageBuffer = Buffer.from('fake-image-data');
      const fakeProjectId = uuidv4();
      
      const response = await request(app)
        .post('/api/upload/file')
        .set('Authorization', `Bearer ${authToken}`)
        .field('projectId', fakeProjectId)
        .attach('file', testImageBuffer, {
          filename: 'test-image.jpg',
          contentType: 'image/jpeg'
        });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Project not found or access denied');
    });

    it('should reject unsupported file types', async () => {
      const testFileBuffer = Buffer.from('fake-text-data');
      
      const response = await request(app)
        .post('/api/upload/file')
        .set('Authorization', `Bearer ${authToken}`)
        .field('projectId', testProject.id)
        .attach('file', testFileBuffer, {
          filename: 'test-file.txt',
          contentType: 'text/plain'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not allowed');
    });

    it('should reject files that are too large', async () => {
      // Create a buffer larger than the configured limit
      const largeBuffer = Buffer.alloc(15 * 1024 * 1024); // 15MB
      
      const response = await request(app)
        .post('/api/upload/file')
        .set('Authorization', `Bearer ${authToken}`)
        .field('projectId', testProject.id)
        .attach('file', largeBuffer, {
          filename: 'large-image.jpg',
          contentType: 'image/jpeg'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('exceeds maximum');
    });
  });

  describe('POST /api/upload/files', () => {
    it('should upload multiple files successfully', async () => {
      // Create proper image buffers
      const jpegHeader = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
      const jpegData1 = Buffer.alloc(1024);
      const testImageBuffer1 = Buffer.concat([jpegHeader, jpegData1]);
      
      const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      const pngData = Buffer.alloc(1024);
      const testImageBuffer2 = Buffer.concat([pngHeader, pngData]);
      
      const response = await request(app)
        .post('/api/upload/files')
        .set('Authorization', `Bearer ${authToken}`)
        .field('projectId', testProject.id)
        .attach('files', testImageBuffer1, {
          filename: 'test-image-1.jpg',
          contentType: 'image/jpeg'
        })
        .attach('files', testImageBuffer2, {
          filename: 'test-image-2.png',
          contentType: 'image/png'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('uploadId');
      expect(response.body.data).toHaveProperty('fileIds');
      expect(response.body.data.fileIds).toHaveLength(2);
      expect(response.body.data.status).toBe('uploaded');
    });

    it('should create new project when projectName is provided', async () => {
      // Create a proper JPEG buffer
      const jpegHeader = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
      const jpegData = Buffer.alloc(1024);
      const testImageBuffer = Buffer.concat([jpegHeader, jpegData]);
      const projectName = 'New Test Project';
      
      const response = await request(app)
        .post('/api/upload/files')
        .set('Authorization', `Bearer ${authToken}`)
        .field('projectName', projectName)
        .attach('files', testImageBuffer, {
          filename: 'test-image.jpg',
          contentType: 'image/jpeg'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('uploadId');
      expect(response.body.data).toHaveProperty('fileIds');
      expect(response.body.data.fileIds).toHaveLength(1);

      // Verify project was created
      const createdProject = await projectRepo.findById(response.body.data.uploadId);
      expect(createdProject).toBeTruthy();
      expect(createdProject?.name).toBe(projectName);
    });

    it('should reject upload without files', async () => {
      const response = await request(app)
        .post('/api/upload/files')
        .set('Authorization', `Bearer ${authToken}`)
        .field('projectId', testProject.id);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('No files provided');
    });

    it('should validate all files before uploading', async () => {
      const testImageBuffer = Buffer.from('fake-image-data');
      const testTextBuffer = Buffer.from('fake-text-data');
      
      const response = await request(app)
        .post('/api/upload/files')
        .set('Authorization', `Bearer ${authToken}`)
        .field('projectId', testProject.id)
        .attach('files', testImageBuffer, {
          filename: 'test-image.jpg',
          contentType: 'image/jpeg'
        })
        .attach('files', testTextBuffer, {
          filename: 'test-file.txt',
          contentType: 'text/plain'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not allowed');
    });
  });

  describe('GET /api/upload/status/:fileId', () => {
    it('should return upload status for valid file', async () => {
      // First upload a file
      const jpegHeader = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
      const jpegData = Buffer.alloc(1024);
      const testImageBuffer = Buffer.concat([jpegHeader, jpegData]);
      
      const uploadResponse = await request(app)
        .post('/api/upload/file')
        .set('Authorization', `Bearer ${authToken}`)
        .field('projectId', testProject.id)
        .attach('file', testImageBuffer, {
          filename: 'test-image.jpg',
          contentType: 'image/jpeg'
        });

      const fileId = uploadResponse.body.data.fileIds[0];

      // Get status
      const statusResponse = await request(app)
        .get(`/api/upload/status/${fileId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(statusResponse.status).toBe(200);
      expect(statusResponse.body.success).toBe(true);
      expect(statusResponse.body.data).toHaveProperty('id');
      expect(statusResponse.body.data).toHaveProperty('status');
      expect(statusResponse.body.data).toHaveProperty('progress');
    });

    it('should return 404 for non-existent file', async () => {
      const fakeFileId = uuidv4();
      
      const response = await request(app)
        .get(`/api/upload/status/${fakeFileId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('File not found');
    });
  });

  describe('DELETE /api/upload/file/:fileId', () => {
    it('should delete uploaded file successfully', async () => {
      // First upload a file
      const jpegHeader = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
      const jpegData = Buffer.alloc(1024);
      const testImageBuffer = Buffer.concat([jpegHeader, jpegData]);
      
      const uploadResponse = await request(app)
        .post('/api/upload/file')
        .set('Authorization', `Bearer ${authToken}`)
        .field('projectId', testProject.id)
        .attach('file', testImageBuffer, {
          filename: 'test-image.jpg',
          contentType: 'image/jpeg'
        });

      const fileId = uploadResponse.body.data.fileIds[0];

      // Delete file
      const deleteResponse = await request(app)
        .delete(`/api/upload/file/${fileId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(deleteResponse.status).toBe(200);
      expect(deleteResponse.body.success).toBe(true);
      expect(deleteResponse.body.message).toBe('File deleted successfully');

      // Verify file is deleted
      const statusResponse = await request(app)
        .get(`/api/upload/status/${fileId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(statusResponse.status).toBe(404);
    });

    it('should return 404 for non-existent file', async () => {
      const fakeFileId = uuidv4();
      
      const response = await request(app)
        .delete(`/api/upload/file/${fakeFileId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('File not found');
    });
  });

  describe('POST /api/upload/presigned-url', () => {
    it('should generate presigned URL successfully', async () => {
      const response = await request(app)
        .post('/api/upload/presigned-url')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          filename: 'test-image.jpg',
          contentType: 'image/jpeg',
          projectId: testProject.id
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('uploadUrl');
      expect(response.body.data).toHaveProperty('fileKey');
      expect(response.body.data.uploadUrl).toContain('presigned-url');
    });

    it('should reject request without required fields', async () => {
      const response = await request(app)
        .post('/api/upload/presigned-url')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          filename: 'test-image.jpg'
          // Missing contentType and projectId
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('required');
    });
  });

  describe('GET /api/upload/project/:projectId/files', () => {
    it('should return project files successfully', async () => {
      // First upload some files
      const jpegHeader = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
      const jpegData1 = Buffer.alloc(1024);
      const testImageBuffer1 = Buffer.concat([jpegHeader, jpegData1]);
      
      const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      const pngData = Buffer.alloc(1024);
      const testImageBuffer2 = Buffer.concat([pngHeader, pngData]);
      
      await request(app)
        .post('/api/upload/files')
        .set('Authorization', `Bearer ${authToken}`)
        .field('projectId', testProject.id)
        .attach('files', testImageBuffer1, {
          filename: 'test-image-1.jpg',
          contentType: 'image/jpeg'
        })
        .attach('files', testImageBuffer2, {
          filename: 'test-image-2.png',
          contentType: 'image/png'
        });

      // Get project files
      const response = await request(app)
        .get(`/api/upload/project/${testProject.id}/files`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data).toHaveLength(2);
      
      // Check file properties
      response.body.data.forEach((file: any) => {
        expect(file).toHaveProperty('id');
        expect(file).toHaveProperty('projectId');
        expect(file).toHaveProperty('filename');
        expect(file).toHaveProperty('originalUrl');
        expect(file).toHaveProperty('processingStatus');
      });
    });

    it('should return empty array for project with no files', async () => {
      const response = await request(app)
        .get(`/api/upload/project/${testProject.id}/files`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data).toHaveLength(0);
    });

    it('should return 404 for non-existent project', async () => {
      const fakeProjectId = uuidv4();
      
      const response = await request(app)
        .get(`/api/upload/project/${fakeProjectId}/files`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Project not found or access denied');
    });
  });
});