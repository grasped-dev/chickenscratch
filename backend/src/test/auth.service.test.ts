import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from '../services/auth.js';
import { UserRepository } from '../models/UserRepository.js';
import bcrypt from 'bcryptjs';
import type { User, UserPreferences } from 'chicken-scratch-shared/types/models';

// Mock dependencies
vi.mock('../models/UserRepository.js');
vi.mock('bcryptjs');
vi.mock('../middleware/auth.js', () => ({
  authMiddleware: {
    generateToken: vi.fn(() => 'mock-jwt-token')
  }
}));

describe('AuthService', () => {
  let authService: AuthService;
  let mockUserRepository: any;

  const mockUser: User = {
    id: 'user-123',
    email: 'test@example.com',
    name: 'Test User',
    passwordHash: 'hashed-password',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    preferences: {
      defaultClusteringMethod: 'hybrid',
      autoProcessing: true,
      exportFormat: 'pdf',
      theme: 'light'
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock UserRepository
    mockUserRepository = {
      findByEmail: vi.fn(),
      create: vi.fn(),
      findById: vi.fn(),
      updateById: vi.fn(),
      updatePassword: vi.fn()
    };
    
    (UserRepository as any).mockImplementation(() => mockUserRepository);
    
    authService = new AuthService();
  });

  describe('hashPassword', () => {
    it('should hash password with correct salt rounds', async () => {
      const password = 'testPassword123!';
      const hashedPassword = 'hashed-password';
      
      (bcrypt.hash as any).mockResolvedValue(hashedPassword);
      
      const result = await authService.hashPassword(password);
      
      expect(bcrypt.hash).toHaveBeenCalledWith(password, 12);
      expect(result).toBe(hashedPassword);
    });
  });

  describe('verifyPassword', () => {
    it('should verify password correctly', async () => {
      const password = 'testPassword123!';
      const hashedPassword = 'hashed-password';
      
      (bcrypt.compare as any).mockResolvedValue(true);
      
      const result = await authService.verifyPassword(password, hashedPassword);
      
      expect(bcrypt.compare).toHaveBeenCalledWith(password, hashedPassword);
      expect(result).toBe(true);
    });

    it('should return false for incorrect password', async () => {
      const password = 'wrongPassword';
      const hashedPassword = 'hashed-password';
      
      (bcrypt.compare as any).mockResolvedValue(false);
      
      const result = await authService.verifyPassword(password, hashedPassword);
      
      expect(result).toBe(false);
    });
  });

  describe('validateEmail', () => {
    it('should validate correct email formats', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.co.uk',
        'user+tag@example.org'
      ];

      validEmails.forEach(email => {
        expect(authService.validateEmail(email)).toBe(true);
      });
    });

    it('should reject invalid email formats', () => {
      const invalidEmails = [
        'invalid-email',
        '@example.com',
        'user@',
        'user@.com'
      ];

      invalidEmails.forEach(email => {
        expect(authService.validateEmail(email)).toBe(false);
      });
    });
  });

  describe('validatePassword', () => {
    it('should accept strong passwords', () => {
      const strongPasswords = [
        'StrongPass123!',
        'MySecure@Pass1',
        'Complex$Password9'
      ];

      strongPasswords.forEach(password => {
        const errors = authService.validatePassword(password);
        expect(errors).toHaveLength(0);
      });
    });

    it('should reject passwords that are too short', () => {
      const errors = authService.validatePassword('Short1!');
      expect(errors).toContainEqual({
        field: 'password',
        message: 'Password must be at least 8 characters long'
      });
    });

    it('should reject passwords without lowercase letters', () => {
      const errors = authService.validatePassword('PASSWORD123!');
      expect(errors).toContainEqual({
        field: 'password',
        message: 'Password must contain at least one lowercase letter'
      });
    });

    it('should reject passwords without uppercase letters', () => {
      const errors = authService.validatePassword('password123!');
      expect(errors).toContainEqual({
        field: 'password',
        message: 'Password must contain at least one uppercase letter'
      });
    });

    it('should reject passwords without numbers', () => {
      const errors = authService.validatePassword('Password!');
      expect(errors).toContainEqual({
        field: 'password',
        message: 'Password must contain at least one number'
      });
    });

    it('should reject passwords without special characters', () => {
      const errors = authService.validatePassword('Password123');
      expect(errors).toContainEqual({
        field: 'password',
        message: 'Password must contain at least one special character (@$!%*?&)'
      });
    });
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      const registerData = {
        email: 'new@example.com',
        password: 'StrongPass123!',
        name: 'New User'
      };

      mockUserRepository.findByEmail.mockResolvedValue(null);
      mockUserRepository.create.mockResolvedValue(mockUser);
      (bcrypt.hash as any).mockResolvedValue('hashed-password');

      const result = await authService.register(registerData);

      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith('new@example.com');
      expect(mockUserRepository.create).toHaveBeenCalledWith({
        email: 'new@example.com',
        name: 'New User',
        passwordHash: 'hashed-password',
        preferences: undefined
      });
      expect(result).toEqual({
        user: {
          id: mockUser.id,
          email: mockUser.email,
          name: mockUser.name,
          preferences: mockUser.preferences
        },
        token: 'mock-jwt-token'
      });
    });

    it('should throw error for existing email', async () => {
      const registerData = {
        email: 'existing@example.com',
        password: 'StrongPass123!',
        name: 'New User'
      };

      mockUserRepository.findByEmail.mockResolvedValue(mockUser);

      await expect(authService.register(registerData)).rejects.toThrow('Email already registered');
    });

    it('should throw error for invalid email', async () => {
      const registerData = {
        email: 'invalid-email',
        password: 'StrongPass123!',
        name: 'New User'
      };

      await expect(authService.register(registerData)).rejects.toThrow('Invalid email format');
    });

    it('should throw error for weak password', async () => {
      const registerData = {
        email: 'new@example.com',
        password: 'weak',
        name: 'New User'
      };

      mockUserRepository.findByEmail.mockResolvedValue(null);

      await expect(authService.register(registerData)).rejects.toThrow('Validation failed');
    });

    it('should throw error for missing name', async () => {
      const registerData = {
        email: 'new@example.com',
        password: 'StrongPass123!',
        name: ''
      };

      mockUserRepository.findByEmail.mockResolvedValue(null);

      await expect(authService.register(registerData)).rejects.toThrow('Name is required');
    });
  });

  describe('login', () => {
    it('should login user successfully', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'StrongPass123!'
      };

      mockUserRepository.findByEmail.mockResolvedValue(mockUser);
      (bcrypt.compare as any).mockResolvedValue(true);

      const result = await authService.login(loginData);

      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith('test@example.com');
      expect(bcrypt.compare).toHaveBeenCalledWith('StrongPass123!', mockUser.passwordHash);
      expect(result).toEqual({
        user: {
          id: mockUser.id,
          email: mockUser.email,
          name: mockUser.name,
          preferences: mockUser.preferences
        },
        token: 'mock-jwt-token'
      });
    });

    it('should throw error for non-existent user', async () => {
      const loginData = {
        email: 'nonexistent@example.com',
        password: 'StrongPass123!'
      };

      mockUserRepository.findByEmail.mockResolvedValue(null);

      await expect(authService.login(loginData)).rejects.toThrow('Invalid email or password');
    });

    it('should throw error for incorrect password', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'WrongPassword123!'
      };

      mockUserRepository.findByEmail.mockResolvedValue(mockUser);
      (bcrypt.compare as any).mockResolvedValue(false);

      await expect(authService.login(loginData)).rejects.toThrow('Invalid email or password');
    });

    it('should throw error for missing credentials', async () => {
      await expect(authService.login({ email: '', password: 'test' })).rejects.toThrow('Email and password are required');
      await expect(authService.login({ email: 'test@example.com', password: '' })).rejects.toThrow('Email and password are required');
    });

    it('should throw error for invalid email format', async () => {
      const loginData = {
        email: 'invalid-email',
        password: 'StrongPass123!'
      };

      await expect(authService.login(loginData)).rejects.toThrow('Invalid email format');
    });
  });

  describe('getProfile', () => {
    it('should return user profile', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);

      const result = await authService.getProfile('user-123');

      expect(mockUserRepository.findById).toHaveBeenCalledWith('user-123');
      expect(result).toBe(mockUser);
    });

    it('should return null for non-existent user', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      const result = await authService.getProfile('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('updateProfile', () => {
    it('should update user profile successfully', async () => {
      const updateData = {
        name: 'Updated Name',
        preferences: { theme: 'dark' as const }
      };

      const updatedUser = { ...mockUser, name: 'Updated Name' };
      mockUserRepository.updateById.mockResolvedValue(updatedUser);

      const result = await authService.updateProfile('user-123', updateData);

      expect(mockUserRepository.updateById).toHaveBeenCalledWith('user-123', {
        name: 'Updated Name',
        preferences: { theme: 'dark' }
      });
      expect(result).toBe(updatedUser);
    });

    it('should throw error for empty name', async () => {
      await expect(authService.updateProfile('user-123', { name: '' })).rejects.toThrow('Name cannot be empty');
      await expect(authService.updateProfile('user-123', { name: '   ' })).rejects.toThrow('Name cannot be empty');
    });

    it('should throw error for short name', async () => {
      await expect(authService.updateProfile('user-123', { name: 'A' })).rejects.toThrow('Name must be at least 2 characters long');
    });
  });

  describe('changePassword', () => {
    it('should change password successfully', async () => {
      const currentPassword = 'OldPass123!';
      const newPassword = 'NewPass123!';

      mockUserRepository.findById.mockResolvedValue(mockUser);
      (bcrypt.compare as any).mockResolvedValue(true);
      (bcrypt.hash as any).mockResolvedValue('new-hashed-password');
      mockUserRepository.updatePassword.mockResolvedValue(undefined);

      await authService.changePassword('user-123', currentPassword, newPassword);

      expect(mockUserRepository.findById).toHaveBeenCalledWith('user-123');
      expect(bcrypt.compare).toHaveBeenCalledWith(currentPassword, mockUser.passwordHash);
      expect(bcrypt.hash).toHaveBeenCalledWith(newPassword, 12);
      expect(mockUserRepository.updatePassword).toHaveBeenCalledWith('user-123', 'new-hashed-password');
    });

    it('should throw error for non-existent user', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(authService.changePassword('non-existent', 'old', 'new')).rejects.toThrow('User not found');
    });

    it('should throw error for incorrect current password', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);
      (bcrypt.compare as any).mockResolvedValue(false);

      await expect(authService.changePassword('user-123', 'wrong', 'NewPass123!')).rejects.toThrow('Current password is incorrect');
    });

    it('should throw error for weak new password', async () => {
      mockUserRepository.findById.mockResolvedValue(mockUser);
      (bcrypt.compare as any).mockResolvedValue(true);

      await expect(authService.changePassword('user-123', 'OldPass123!', 'weak')).rejects.toThrow('Password validation failed');
    });
  });
});