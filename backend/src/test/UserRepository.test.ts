import { describe, it, expect } from 'vitest';
import { UserRepository } from '../models/UserRepository.js';
import { testUser, createTestUser } from './setup.js';
import type { CreateUserInput } from 'chicken-scratch-shared/types/models';

describe('UserRepository', () => {
  const userRepository = new UserRepository();

  describe('create', () => {
    it('should create a new user', async () => {
      const uniqueUser = createTestUser('-create');
      const userData: CreateUserInput = {
        email: uniqueUser.email,
        name: uniqueUser.name,
        passwordHash: uniqueUser.passwordHash
      };

      const user = await userRepository.create(userData);

      expect(user).toBeDefined();
      expect(user.id).toBeDefined();
      expect(user.email).toBe(userData.email);
      expect(user.name).toBe(userData.name);
      expect(user.passwordHash).toBe(userData.passwordHash);
      expect(user.createdAt).toBeInstanceOf(Date);
      expect(user.updatedAt).toBeInstanceOf(Date);
      expect(user.preferences).toBeDefined();
      expect(user.preferences.defaultClusteringMethod).toBe('hybrid');
    });

    it('should create a user with custom preferences', async () => {
      const customUser = createTestUser('-custom');
      const userData: CreateUserInput = {
        email: customUser.email,
        name: customUser.name,
        passwordHash: customUser.passwordHash,
        preferences: {
          defaultClusteringMethod: 'embeddings',
          autoProcessing: false,
          exportFormat: 'csv',
          theme: 'dark'
        }
      };

      const user = await userRepository.create(userData);

      expect(user.preferences.defaultClusteringMethod).toBe('embeddings');
      expect(user.preferences.autoProcessing).toBe(false);
      expect(user.preferences.exportFormat).toBe('csv');
      expect(user.preferences.theme).toBe('dark');
    });
  });

  describe('findById', () => {
    it('should find a user by ID', async () => {
      const uniqueUser = createTestUser('-findbyid');
      const userData: CreateUserInput = {
        email: uniqueUser.email,
        name: uniqueUser.name,
        passwordHash: uniqueUser.passwordHash
      };

      const createdUser = await userRepository.create(userData);
      const foundUser = await userRepository.findById(createdUser.id);

      expect(foundUser).toBeDefined();
      expect(foundUser!.id).toBe(createdUser.id);
      expect(foundUser!.email).toBe(createdUser.email);
    });

    it('should return null for non-existent user', async () => {
      const foundUser = await userRepository.findById('00000000-0000-0000-0000-000000000000');
      expect(foundUser).toBeNull();
    });
  });

  describe('findByEmail', () => {
    it('should find a user by email', async () => {
      const userData: CreateUserInput = {
        email: testUser.email,
        name: testUser.name,
        passwordHash: testUser.passwordHash
      };

      const createdUser = await userRepository.create(userData);
      const foundUser = await userRepository.findByEmail(testUser.email);

      expect(foundUser).toBeDefined();
      expect(foundUser!.id).toBe(createdUser.id);
      expect(foundUser!.email).toBe(testUser.email);
    });

    it('should return null for non-existent email', async () => {
      const foundUser = await userRepository.findByEmail('nonexistent@example.com');
      expect(foundUser).toBeNull();
    });
  });

  describe('emailExists', () => {
    it('should return true for existing email', async () => {
      const userData: CreateUserInput = {
        email: testUser.email,
        name: testUser.name,
        passwordHash: testUser.passwordHash
      };

      await userRepository.create(userData);
      const exists = await userRepository.emailExists(testUser.email);

      expect(exists).toBe(true);
    });

    it('should return false for non-existent email', async () => {
      const exists = await userRepository.emailExists('nonexistent@example.com');
      expect(exists).toBe(false);
    });
  });

  describe('updateById', () => {
    it('should update user name', async () => {
      const uniqueUser = createTestUser('-update');
      const userData: CreateUserInput = {
        email: uniqueUser.email,
        name: uniqueUser.name,
        passwordHash: uniqueUser.passwordHash
      };

      const createdUser = await userRepository.create(userData);
      
      // Add a small delay to ensure updated_at timestamp is different
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const updatedUser = await userRepository.updateById(createdUser.id, {
        name: 'Updated Name'
      });

      expect(updatedUser).toBeDefined();
      expect(updatedUser!.name).toBe('Updated Name');
      expect(updatedUser!.email).toBe(uniqueUser.email);
      expect(updatedUser!.updatedAt.getTime()).toBeGreaterThan(createdUser.updatedAt.getTime());
    });

    it('should return null for non-existent user', async () => {
      const updatedUser = await userRepository.updateById('00000000-0000-0000-0000-000000000000', {
        name: 'Updated Name'
      });

      expect(updatedUser).toBeNull();
    });
  });

  describe('updatePreferences', () => {
    it('should update user preferences', async () => {
      const uniqueUser = createTestUser('-prefs');
      const userData: CreateUserInput = {
        email: uniqueUser.email,
        name: uniqueUser.name,
        passwordHash: uniqueUser.passwordHash
      };

      const createdUser = await userRepository.create(userData);
      const updatedUser = await userRepository.updatePreferences(createdUser.id, {
        theme: 'dark',
        exportFormat: 'csv'
      });

      expect(updatedUser).toBeDefined();
      expect(updatedUser!.preferences.theme).toBe('dark');
      expect(updatedUser!.preferences.exportFormat).toBe('csv');
      expect(updatedUser!.preferences.defaultClusteringMethod).toBe('hybrid'); // Should preserve existing
    });

    it('should return null for non-existent user', async () => {
      const updatedUser = await userRepository.updatePreferences('00000000-0000-0000-0000-000000000000', {
        theme: 'dark'
      });

      expect(updatedUser).toBeNull();
    });
  });

  describe('deleteById', () => {
    it('should delete a user', async () => {
      const userData: CreateUserInput = {
        email: testUser.email,
        name: testUser.name,
        passwordHash: testUser.passwordHash
      };

      const createdUser = await userRepository.create(userData);
      const deleted = await userRepository.deleteById(createdUser.id);

      expect(deleted).toBe(true);

      const foundUser = await userRepository.findById(createdUser.id);
      expect(foundUser).toBeNull();
    });

    it('should return false for non-existent user', async () => {
      const deleted = await userRepository.deleteById('00000000-0000-0000-0000-000000000000');
      expect(deleted).toBe(false);
    });
  });

  describe('count', () => {
    it('should count all users', async () => {
      const user1 = createTestUser('-all1');
      const user2 = createTestUser('-all2');
      
      const userData1: CreateUserInput = {
        email: user1.email,
        name: 'User 1',
        passwordHash: 'hash1'
      };

      const userData2: CreateUserInput = {
        email: user2.email,
        name: 'User 2',
        passwordHash: 'hash2'
      };

      await userRepository.create(userData1);
      await userRepository.create(userData2);

      const count = await userRepository.count();
      expect(count).toBe(2);
    });

    it('should count users with where clause', async () => {
      const user1 = createTestUser('-count1');
      const user2 = createTestUser('-count2');
      
      const userData1: CreateUserInput = {
        email: user1.email,
        name: 'Test User',
        passwordHash: 'hash1'
      };

      const userData2: CreateUserInput = {
        email: user2.email,
        name: 'Other User',
        passwordHash: 'hash2'
      };

      await userRepository.create(userData1);
      await userRepository.create(userData2);

      const count = await userRepository.count({ name: 'Test User' });
      expect(count).toBe(1);
    });
  });
});