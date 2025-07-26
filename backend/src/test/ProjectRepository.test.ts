import { describe, it, expect } from 'vitest';
import { UserRepository } from '../models/UserRepository.js';
import { ProjectRepository } from '../models/ProjectRepository.js';
import { testUser, testProject, createTestUser } from './setup.js';
import type { CreateUserInput, CreateProjectInput } from 'chicken-scratch-shared/types/models';

describe('ProjectRepository', () => {
  const userRepository = new UserRepository();
  const projectRepository = new ProjectRepository();

  describe('create', () => {
    it('should create a new project', async () => {
      // Create a user first
      const userData: CreateUserInput = {
        email: testUser.email,
        name: testUser.name,
        passwordHash: testUser.passwordHash
      };
      const user = await userRepository.create(userData);

      const projectData: CreateProjectInput = {
        userId: user.id,
        name: testProject.name,
        description: testProject.description
      };

      const project = await projectRepository.create(projectData);

      expect(project).toBeDefined();
      expect(project.id).toBeDefined();
      expect(project.userId).toBe(user.id);
      expect(project.name).toBe(testProject.name);
      expect(project.description).toBe(testProject.description);
      expect(project.status).toBe('processing');
      expect(project.imageCount).toBe(0);
      expect(project.createdAt).toBeInstanceOf(Date);
      expect(project.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('findById', () => {
    it('should find a project by ID', async () => {
      const userData: CreateUserInput = {
        email: testUser.email,
        name: testUser.name,
        passwordHash: testUser.passwordHash
      };
      const user = await userRepository.create(userData);

      const projectData: CreateProjectInput = {
        userId: user.id,
        name: testProject.name,
        description: testProject.description
      };

      const createdProject = await projectRepository.create(projectData);
      const foundProject = await projectRepository.findById(createdProject.id);

      expect(foundProject).toBeDefined();
      expect(foundProject!.id).toBe(createdProject.id);
      expect(foundProject!.name).toBe(testProject.name);
    });

    it('should return null for non-existent project', async () => {
      const foundProject = await projectRepository.findById('00000000-0000-0000-0000-000000000000');
      expect(foundProject).toBeNull();
    });
  });

  describe('findByUserId', () => {
    it('should find projects by user ID', async () => {
      const uniqueUser = createTestUser('-find');
      const userData: CreateUserInput = {
        email: uniqueUser.email,
        name: uniqueUser.name,
        passwordHash: uniqueUser.passwordHash
      };
      const user = await userRepository.create(userData);

      const projectData1: CreateProjectInput = {
        userId: user.id,
        name: 'Project 1',
        description: 'First project'
      };

      const projectData2: CreateProjectInput = {
        userId: user.id,
        name: 'Project 2',
        description: 'Second project'
      };

      await projectRepository.create(projectData1);
      await projectRepository.create(projectData2);

      const projects = await projectRepository.findByUserId(user.id);

      expect(projects).toHaveLength(2);
      expect(projects[0].userId).toBe(user.id);
      expect(projects[1].userId).toBe(user.id);
      // Should be ordered by created_at DESC
      expect(projects[0].createdAt.getTime()).toBeGreaterThanOrEqual(projects[1].createdAt.getTime());
    });

    it('should find projects by user ID with pagination', async () => {
      const uniqueUser = createTestUser('-pagination');
      const userData: CreateUserInput = {
        email: uniqueUser.email,
        name: uniqueUser.name,
        passwordHash: uniqueUser.passwordHash
      };
      const user = await userRepository.create(userData);

      // Create 3 projects
      for (let i = 1; i <= 3; i++) {
        await projectRepository.create({
          userId: user.id,
          name: `Project ${i}`,
          description: `Project ${i} description`
        });
      }

      const projects = await projectRepository.findByUserId(user.id, {
        limit: 2,
        offset: 1
      });

      expect(projects).toHaveLength(2);
    });

    it('should filter projects by status', async () => {
      const uniqueUser = createTestUser('-filter');
      const userData: CreateUserInput = {
        email: uniqueUser.email,
        name: uniqueUser.name,
        passwordHash: uniqueUser.passwordHash
      };
      const user = await userRepository.create(userData);

      const project1 = await projectRepository.create({
        userId: user.id,
        name: 'Project 1',
        description: 'First project'
      });

      const project2 = await projectRepository.create({
        userId: user.id,
        name: 'Project 2',
        description: 'Second project'
      });

      // Update one project to completed status
      await projectRepository.updateStatus(project1.id, 'completed');

      const completedProjects = await projectRepository.findByUserId(user.id, {
        status: 'completed'
      });

      expect(completedProjects).toHaveLength(1);
      expect(completedProjects[0].id).toBe(project1.id);
      expect(completedProjects[0].status).toBe('completed');
    });
  });

  describe('countByUserId', () => {
    it('should count projects by user ID', async () => {
      const uniqueUser = createTestUser('-count');
      const userData: CreateUserInput = {
        email: uniqueUser.email,
        name: uniqueUser.name,
        passwordHash: uniqueUser.passwordHash
      };
      const user = await userRepository.create(userData);

      await projectRepository.create({
        userId: user.id,
        name: 'Project 1',
        description: 'First project'
      });

      await projectRepository.create({
        userId: user.id,
        name: 'Project 2',
        description: 'Second project'
      });

      const count = await projectRepository.countByUserId(user.id);
      expect(count).toBe(2);
    });

    it('should count projects by user ID and status', async () => {
      const uniqueUser = createTestUser('-count-status');
      const userData: CreateUserInput = {
        email: uniqueUser.email,
        name: uniqueUser.name,
        passwordHash: uniqueUser.passwordHash
      };
      const user = await userRepository.create(userData);

      const project1 = await projectRepository.create({
        userId: user.id,
        name: 'Project 1',
        description: 'First project'
      });

      await projectRepository.create({
        userId: user.id,
        name: 'Project 2',
        description: 'Second project'
      });

      await projectRepository.updateStatus(project1.id, 'completed');

      const completedCount = await projectRepository.countByUserId(user.id, 'completed');
      expect(completedCount).toBe(1);

      const processingCount = await projectRepository.countByUserId(user.id, 'processing');
      expect(processingCount).toBe(1);
    });
  });

  describe('updateStatus', () => {
    it('should update project status', async () => {
      const uniqueUser = createTestUser('-status');
      const userData: CreateUserInput = {
        email: uniqueUser.email,
        name: uniqueUser.name,
        passwordHash: uniqueUser.passwordHash
      };
      const user = await userRepository.create(userData);

      const project = await projectRepository.create({
        userId: user.id,
        name: testProject.name,
        description: testProject.description
      });

      const updatedProject = await projectRepository.updateStatus(project.id, 'completed');

      expect(updatedProject).toBeDefined();
      expect(updatedProject!.status).toBe('completed');
      expect(updatedProject!.updatedAt.getTime()).toBeGreaterThan(project.updatedAt.getTime());
    });
  });

  describe('incrementImageCount', () => {
    it('should increment image count', async () => {
      const uniqueUser = createTestUser('-increment');
      const userData: CreateUserInput = {
        email: uniqueUser.email,
        name: uniqueUser.name,
        passwordHash: uniqueUser.passwordHash
      };
      const user = await userRepository.create(userData);

      const project = await projectRepository.create({
        userId: user.id,
        name: testProject.name,
        description: testProject.description
      });

      expect(project.imageCount).toBe(0);

      const updatedProject = await projectRepository.incrementImageCount(project.id);

      expect(updatedProject).toBeDefined();
      expect(updatedProject!.imageCount).toBe(1);
    });
  });

  describe('updateById', () => {
    it('should update project fields', async () => {
      const userData: CreateUserInput = {
        email: testUser.email,
        name: testUser.name,
        passwordHash: testUser.passwordHash
      };
      const user = await userRepository.create(userData);

      const project = await projectRepository.create({
        userId: user.id,
        name: testProject.name,
        description: testProject.description
      });

      const updatedProject = await projectRepository.updateById(project.id, {
        name: 'Updated Project Name',
        description: 'Updated description',
        summary: {
          topThemes: [],
          overallInsights: 'Test insights',
          distribution: [],
          representativeQuotes: [],
          metadata: {
            totalNotes: 0,
            processingTime: 1000,
            confidence: 0.9
          }
        }
      });

      expect(updatedProject).toBeDefined();
      expect(updatedProject!.name).toBe('Updated Project Name');
      expect(updatedProject!.description).toBe('Updated description');
      expect(updatedProject!.summary).toBeDefined();
      expect(updatedProject!.summary!.overallInsights).toBe('Test insights');
    });
  });

  describe('deleteById', () => {
    it('should delete a project', async () => {
      const userData: CreateUserInput = {
        email: testUser.email,
        name: testUser.name,
        passwordHash: testUser.passwordHash
      };
      const user = await userRepository.create(userData);

      const project = await projectRepository.create({
        userId: user.id,
        name: testProject.name,
        description: testProject.description
      });

      const deleted = await projectRepository.deleteById(project.id);
      expect(deleted).toBe(true);

      const foundProject = await projectRepository.findById(project.id);
      expect(foundProject).toBeNull();
    });
  });
});