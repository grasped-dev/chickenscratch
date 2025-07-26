import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { ProjectRepository } from '../models/ProjectRepository.js';
import { UserRepository } from '../models/UserRepository.js';
import { ProcessedImageRepository } from '../models/ProcessedImageRepository.js';
import { NoteRepository } from '../models/NoteRepository.js';
import { ClusterRepository } from '../models/ClusterRepository.js';
import type { User, Project } from 'chicken-scratch-shared/types/models';

// Mock authentication middleware - will be updated in beforeEach
const mockUser = { id: '550e8400-e29b-41d4-a716-446655440000', email: 'test@example.com' };

vi.mock('../middleware/auth.js', () => ({
  authenticateToken: vi.fn((req: any, res: any, next: any) => {
    req.user = mockUser;
    next();
  })
}));

// Import routes after mocking
import projectRoutes from '../routes/project.js';
import { authenticateToken } from '../middleware/auth.js';

const app = express();
app.use(express.json());
app.use('/api/projects', projectRoutes);

describe('Project Integration Tests', () => {
  const projectRepository = new ProjectRepository();
  const userRepository = new UserRepository();
  const processedImageRepository = new ProcessedImageRepository();
  const noteRepository = new NoteRepository();
  const clusterRepository = new ClusterRepository();

  let testUser: User;
  let testProject: Project;

  beforeEach(async () => {
    const uniqueEmail = `test-${Date.now()}@example.com`;
    
    // Create test user with unique email
    testUser = await userRepository.create({
      email: uniqueEmail,
      name: 'Test User',
      passwordHash: 'hashed-password'
    });
    
    // Update mock user to use the actual user ID
    mockUser.id = testUser.id;
    mockUser.email = testUser.email;
    
    // Create test project with the actual user ID
    testProject = await projectRepository.create({
      userId: testUser.id,
      name: 'Test Project',
      description: 'A test project'
    });
  });

  afterEach(async () => {
    // Clean up test data
    try {
      await projectRepository.deleteById(testProject.id);
      await userRepository.deleteById(testUser.id);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('POST /api/projects', () => {
    it('should create a new project', async () => {
      const projectData = {
        name: 'New Test Project',
        description: 'A new test project'
      };

      const response = await request(app)
        .post('/api/projects')
        .send(projectData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        name: projectData.name,
        description: projectData.description,
        userId: testUser.id,
        status: 'processing',
        imageCount: 0
      });
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.createdAt).toBeDefined();
      expect(response.body.data.updatedAt).toBeDefined();

      // Clean up
      await projectRepository.deleteById(response.body.data.id);
    });

    it('should return 400 for missing project name', async () => {
      const response = await request(app)
        .post('/api/projects')
        .send({ description: 'No name provided' })
        .expect(400);

      expect(response.body.error).toBe('Project name is required');
    });

    it('should return 400 for empty project name', async () => {
      const response = await request(app)
        .post('/api/projects')
        .send({ name: '   ', description: 'Empty name' })
        .expect(400);

      expect(response.body.error).toBe('Project name is required');
    });
  });

  describe('GET /api/projects', () => {
    it('should return user projects with pagination', async () => {
      const response = await request(app)
        .get('/api/projects')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.projects).toBeInstanceOf(Array);
      expect(response.body.data.projects.length).toBeGreaterThan(0);
      expect(response.body.data.pagination).toMatchObject({
        page: 1,
        limit: 10,
        total: expect.any(Number),
        totalPages: expect.any(Number)
      });

      // Check that the test project is included
      const project = response.body.data.projects.find((p: any) => p.id === testProject.id);
      expect(project).toBeDefined();
      expect(project.noteCount).toBeDefined();
      expect(project.clusterCount).toBeDefined();
    });

    it('should support pagination parameters', async () => {
      const response = await request(app)
        .get('/api/projects?page=1&limit=5')
        .expect(200);

      expect(response.body.data.pagination.page).toBe(1);
      expect(response.body.data.pagination.limit).toBe(5);
    });

    it('should support status filtering', async () => {
      const response = await request(app)
        .get('/api/projects?status=processing')
        .expect(200);

      expect(response.body.success).toBe(true);
      response.body.data.projects.forEach((project: any) => {
        expect(project.status).toBe('processing');
      });
    });

    it('should support search filtering', async () => {
      const response = await request(app)
        .get('/api/projects?search=Test')
        .expect(200);

      expect(response.body.success).toBe(true);
      response.body.data.projects.forEach((project: any) => {
        expect(
          project.name.toLowerCase().includes('test') ||
          (project.description && project.description.toLowerCase().includes('test'))
        ).toBe(true);
      });
    });
  });

  describe('GET /api/projects/:id', () => {
    it('should return project details with related data', async () => {
      const response = await request(app)
        .get(`/api/projects/${testProject.id}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.project).toMatchObject({
        id: testProject.id,
        name: testProject.name,
        description: testProject.description,
        userId: testUser.id
      });
      expect(response.body.data.images).toBeInstanceOf(Array);
      expect(response.body.data.notes).toBeInstanceOf(Array);
      expect(response.body.data.clusters).toBeInstanceOf(Array);
    });

    it('should return 404 for non-existent project', async () => {
      const response = await request(app)
        .get('/api/projects/non-existent-id')
        .expect(404);

      expect(response.body.error).toBe('Project not found');
    });
  });

  describe('PUT /api/projects/:id', () => {
    it('should update project name and description', async () => {
      const updateData = {
        name: 'Updated Project Name',
        description: 'Updated description'
      };

      const response = await request(app)
        .put(`/api/projects/${testProject.id}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe(updateData.name);
      expect(response.body.data.description).toBe(updateData.description);
      expect(response.body.data.updatedAt).not.toBe(testProject.updatedAt.toISOString());
    });

    it('should return 400 for empty project name', async () => {
      const response = await request(app)
        .put(`/api/projects/${testProject.id}`)
        .send({ name: '   ' })
        .expect(400);

      expect(response.body.error).toBe('Project name must be a non-empty string');
    });

    it('should return 404 for non-existent project', async () => {
      const response = await request(app)
        .put('/api/projects/non-existent-id')
        .send({ name: 'New Name' })
        .expect(404);

      expect(response.body.error).toBe('Project not found');
    });
  });

  describe('DELETE /api/projects/:id', () => {
    it('should delete project and related data', async () => {
      // Create a project with related data for deletion test
      const projectToDelete = await projectRepository.create({
        userId: testUser.id,
        name: 'Project to Delete',
        description: 'This project will be deleted'
      });

      // Create related data
      const image = await processedImageRepository.create({
        projectId: projectToDelete.id,
        originalUrl: 'https://example.com/image.jpg',
        filename: 'test-image.jpg',
        fileSize: 1024,
        mimeType: 'image/jpeg'
      });

      const note = await noteRepository.create({
        imageId: image.id,
        originalText: 'Original text',
        cleanedText: 'Cleaned text',
        boundingBox: { left: 0, top: 0, width: 100, height: 50 },
        confidence: 0.95
      });

      const cluster = await clusterRepository.create({
        projectId: projectToDelete.id,
        label: 'Test Cluster',
        textBlocks: [note.id],
        confidence: 0.9
      });

      // Delete the project
      const response = await request(app)
        .delete(`/api/projects/${projectToDelete.id}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Project deleted successfully');

      // Verify project and related data are deleted
      const deletedProject = await projectRepository.findById(projectToDelete.id);
      expect(deletedProject).toBeNull();

      const deletedImage = await processedImageRepository.findById(image.id);
      expect(deletedImage).toBeNull();

      const deletedNote = await noteRepository.findById(note.id);
      expect(deletedNote).toBeNull();

      const deletedCluster = await clusterRepository.findById(cluster.id);
      expect(deletedCluster).toBeNull();
    });

    it('should return 404 for non-existent project', async () => {
      const response = await request(app)
        .delete('/api/projects/non-existent-id')
        .expect(404);

      expect(response.body.error).toBe('Project not found');
    });
  });

  describe('GET /api/projects/stats', () => {
    it('should return project statistics', async () => {
      const response = await request(app)
        .get('/api/projects/stats')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        total: expect.any(Number),
        completed: expect.any(Number),
        processing: expect.any(Number),
        failed: expect.any(Number)
      });
      expect(response.body.data.total).toBeGreaterThan(0);
    });
  });

  // Note: Authentication tests are handled by the auth middleware tests
  // These project tests focus on the business logic with mocked authentication
});