import bcrypt from 'bcryptjs';
import { UserRepository } from '../models/UserRepository.js';
import { authMiddleware } from '../middleware/auth.js';
import type { User, CreateUserInput, UserPreferences } from 'chicken-scratch-shared/types/models';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  preferences?: Partial<UserPreferences>;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    name: string;
    preferences: UserPreferences;
  };
  token: string;
}

export interface ValidationError {
  field: string;
  message: string;
}

export class AuthService {
  private userRepository: UserRepository;
  private readonly saltRounds = 12;

  constructor() {
    this.userRepository = new UserRepository();
  }

  // Hash password
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.saltRounds);
  }

  // Verify password
  async verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword);
  }

  // Validate email format
  validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && !email.includes('..');
  }

  // Validate password strength
  validatePassword(password: string): ValidationError[] {
    const errors: ValidationError[] = [];

    if (password.length < 8) {
      errors.push({
        field: 'password',
        message: 'Password must be at least 8 characters long'
      });
    }

    if (!/(?=.*[a-z])/.test(password)) {
      errors.push({
        field: 'password',
        message: 'Password must contain at least one lowercase letter'
      });
    }

    if (!/(?=.*[A-Z])/.test(password)) {
      errors.push({
        field: 'password',
        message: 'Password must contain at least one uppercase letter'
      });
    }

    if (!/(?=.*\d)/.test(password)) {
      errors.push({
        field: 'password',
        message: 'Password must contain at least one number'
      });
    }

    if (!/(?=.*[@$!%*?&])/.test(password)) {
      errors.push({
        field: 'password',
        message: 'Password must contain at least one special character (@$!%*?&)'
      });
    }

    return errors;
  }

  // Validate registration input
  async validateRegistration(data: RegisterRequest): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    // Validate email
    if (!data.email) {
      errors.push({
        field: 'email',
        message: 'Email is required'
      });
    } else if (!this.validateEmail(data.email)) {
      errors.push({
        field: 'email',
        message: 'Invalid email format'
      });
    } else {
      // Check if email already exists
      const existingUser = await this.userRepository.findByEmail(data.email);
      if (existingUser) {
        errors.push({
          field: 'email',
          message: 'Email already registered'
        });
      }
    }

    // Validate name
    if (!data.name || data.name.trim().length === 0) {
      errors.push({
        field: 'name',
        message: 'Name is required'
      });
    } else if (data.name.trim().length < 2) {
      errors.push({
        field: 'name',
        message: 'Name must be at least 2 characters long'
      });
    }

    // Validate password
    if (!data.password) {
      errors.push({
        field: 'password',
        message: 'Password is required'
      });
    } else {
      errors.push(...this.validatePassword(data.password));
    }

    return errors;
  }

  // Register new user
  async register(data: RegisterRequest): Promise<AuthResponse> {
    // Validate input
    const validationErrors = await this.validateRegistration(data);
    if (validationErrors.length > 0) {
      throw new Error(`Validation failed: ${validationErrors.map(e => e.message).join(', ')}`);
    }

    // Hash password
    const passwordHash = await this.hashPassword(data.password);

    // Create user
    const createUserData: CreateUserInput = {
      email: data.email.toLowerCase().trim(),
      name: data.name.trim(),
      passwordHash,
      preferences: data.preferences
    };

    const user = await this.userRepository.create(createUserData);

    // Generate token
    const token = authMiddleware.generateToken({
      userId: user.id,
      email: user.email,
      name: user.name
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        preferences: user.preferences
      },
      token
    };
  }

  // Login user
  async login(data: LoginRequest): Promise<AuthResponse> {
    // Validate input
    if (!data.email || !data.password) {
      throw new Error('Email and password are required');
    }

    if (!this.validateEmail(data.email)) {
      throw new Error('Invalid email format');
    }

    // Find user by email
    const user = await this.userRepository.findByEmail(data.email.toLowerCase().trim());
    if (!user) {
      throw new Error('Invalid email or password');
    }

    // Verify password
    const isValidPassword = await this.verifyPassword(data.password, user.passwordHash);
    if (!isValidPassword) {
      throw new Error('Invalid email or password');
    }

    // Generate token
    const token = authMiddleware.generateToken({
      userId: user.id,
      email: user.email,
      name: user.name
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        preferences: user.preferences
      },
      token
    };
  }

  // Get user profile
  async getProfile(userId: string): Promise<User | null> {
    return this.userRepository.findById(userId);
  }

  // Update user profile
  async updateProfile(userId: string, data: { name?: string; preferences?: Partial<UserPreferences> }): Promise<User | null> {
    // Validate name if provided
    if (data.name !== undefined) {
      if (!data.name || data.name.trim().length === 0) {
        throw new Error('Name cannot be empty');
      }
      if (data.name.trim().length < 2) {
        throw new Error('Name must be at least 2 characters long');
      }
    }

    const updateData: any = {};
    if (data.name !== undefined) {
      updateData.name = data.name.trim();
    }
    if (data.preferences !== undefined) {
      updateData.preferences = data.preferences;
    }

    return this.userRepository.updateById(userId, updateData);
  }

  // Change password
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    // Get user
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Verify current password
    const isValidPassword = await this.verifyPassword(currentPassword, user.passwordHash);
    if (!isValidPassword) {
      throw new Error('Current password is incorrect');
    }

    // Validate new password
    const passwordErrors = this.validatePassword(newPassword);
    if (passwordErrors.length > 0) {
      throw new Error(`Password validation failed: ${passwordErrors.map(e => e.message).join(', ')}`);
    }

    // Hash new password
    const newPasswordHash = await this.hashPassword(newPassword);

    // Update password in database (we'll need to add this method to UserRepository)
    await this.userRepository.updatePassword(userId, newPasswordHash);
  }
}

// Export singleton instance
export const authService = new AuthService();