import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import authRoutes from '../routes/auth.js';
import { UserRepository } from '../models/UserRepository.js';
import { createTestUser } from './setup.js';
import bcrypt from 'bcryptjs';

// Create test app
const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

describe('Authentication Integration Tests', () => {
  let userRepository: UserRepository;
  let testUserData: any;
  let createdUser: any;

  beforeEach(async () => {
    userRepository = new UserRepository();
    
    // Create test user data
    testUserData = {
      ...createTestUser('_integration'),
      password: 'TestPassword123!'
    };

    // Hash password and create user in database
    const passwordHash = await bcrypt.hash(testUserData.password, 12);
    createdUser = await userRepository.create({
      email: testUserData.email,
      name: testUserData.name,
      passwordHash
    });
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      const newUserData = {
        email: 'newuser@example.com',
        password: 'NewPassword123!',
        name: 'New User'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(newUserData)
        .expect(201);

      expect(response.body).toMatchObject({
        message: 'User registered successfully',
        user: {
          email: newUserData.email,
          name: newUserData.name,
          preferences: expect.any(Object)
        },
        token: expect.any(String)
      });

      expect(response.body.user.id).toBeDefined();
      expect(response.body.user.preferences).toMatchObject({
        defaultClusteringMethod: 'hybrid',
        autoProcessing: true,
        exportFormat: 'pdf',
        theme: 'light'
      });

      // Verify user was created in database
      const dbUser = await userRepository.findByEmail(newUserData.email);
      expect(dbUser).toBeTruthy();
      expect(dbUser?.name).toBe(newUserData.name);
    });

    it('should reject registration with existing email', async () => {
      const duplicateUserData = {
        email: testUserData.email,
        password: 'AnotherPassword123!',
        name: 'Another User'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(duplicateUserData)
        .expect(409);

      expect(response.body).toMatchObject({
        error: 'Email already registered',
        code: 'EMAIL_EXISTS'
      });
    });

    it('should reject registration with weak password', async () => {
      const weakPasswordData = {
        email: 'weakpass@example.com',
        password: 'weak',
        name: 'Weak Password User'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(weakPasswordData)
        .expect(400);

      expect(response.body.code).toBe('VALIDATION_ERROR');
      expect(response.body.error).toContain('Validation failed');
    });

    it('should reject registration with invalid email', async () => {
      const invalidEmailData = {
        email: 'invalid-email',
        password: 'ValidPassword123!',
        name: 'Invalid Email User'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(invalidEmailData)
        .expect(400);

      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    it('should reject registration with missing fields', async () => {
      const incompleteData = {
        email: 'incomplete@example.com'
        // Missing password and name
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(incompleteData)
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Email, password, and name are required',
        code: 'MISSING_FIELDS'
      });
    });

    it('should register user with custom preferences', async () => {
      const userWithPreferences = {
        email: 'preferences@example.com',
        password: 'PreferencesPass123!',
        name: 'Preferences User',
        preferences: {
          theme: 'dark',
          exportFormat: 'csv'
        }
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userWithPreferences)
        .expect(201);

      expect(response.body.user.preferences).toMatchObject({
        defaultClusteringMethod: 'hybrid',
        autoProcessing: true,
        exportFormat: 'csv',
        theme: 'dark'
      });
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login user successfully', async () => {
      const loginData = {
        email: testUserData.email,
        password: testUserData.password
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(200);

      expect(response.body).toMatchObject({
        message: 'Login successful',
        user: {
          id: createdUser.id,
          email: createdUser.email,
          name: createdUser.name,
          preferences: expect.any(Object)
        },
        token: expect.any(String)
      });
    });

    it('should reject login with incorrect password', async () => {
      const loginData = {
        email: testUserData.email,
        password: 'WrongPassword123!'
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.body).toMatchObject({
        error: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS'
      });
    });

    it('should reject login with non-existent email', async () => {
      const loginData = {
        email: 'nonexistent@example.com',
        password: 'SomePassword123!'
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.body).toMatchObject({
        error: 'Invalid email or password',
        code: 'INVALID_CREDENTIALS'
      });
    });

    it('should reject login with missing credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: testUserData.email })
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Email and password are required',
        code: 'MISSING_CREDENTIALS'
      });
    });

    it('should reject login with invalid email format', async () => {
      const loginData = {
        email: 'invalid-email',
        password: 'SomePassword123!'
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Invalid email format',
        code: 'INVALID_EMAIL'
      });
    });
  });

  describe('GET /api/auth/profile', () => {
    let authToken: string;

    beforeEach(async () => {
      // Login to get auth token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUserData.email,
          password: testUserData.password
        });
      
      authToken = loginResponse.body.token;
    });

    it('should get user profile successfully', async () => {
      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.user).toMatchObject({
        id: createdUser.id,
        email: createdUser.email,
        name: createdUser.name,
        preferences: expect.any(Object),
        createdAt: expect.any(String),
        updatedAt: expect.any(String)
      });
    });

    it('should reject request without token', async () => {
      const response = await request(app)
        .get('/api/auth/profile')
        .expect(401);

      expect(response.body).toMatchObject({
        error: 'Authentication required',
        code: 'MISSING_TOKEN'
      });
    });

    it('should reject request with invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body).toMatchObject({
        error: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
    });
  });

  describe('PUT /api/auth/profile', () => {
    let authToken: string;

    beforeEach(async () => {
      // Login to get auth token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUserData.email,
          password: testUserData.password
        });
      
      authToken = loginResponse.body.token;
    });

    it('should update user profile successfully', async () => {
      const updateData = {
        name: 'Updated Name',
        preferences: {
          theme: 'dark',
          exportFormat: 'csv'
        }
      };

      const response = await request(app)
        .put('/api/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toMatchObject({
        message: 'Profile updated successfully',
        user: {
          id: createdUser.id,
          email: createdUser.email,
          name: 'Updated Name',
          preferences: expect.objectContaining({
            theme: 'dark',
            exportFormat: 'csv'
          })
        }
      });

      // Verify update in database
      const updatedUser = await userRepository.findById(createdUser.id);
      expect(updatedUser?.name).toBe('Updated Name');
    });

    it('should reject update with empty name', async () => {
      const updateData = {
        name: ''
      };

      const response = await request(app)
        .put('/api/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(400);

      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    it('should reject update with no data', async () => {
      const response = await request(app)
        .put('/api/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'At least one field (name or preferences) is required',
        code: 'NO_UPDATE_DATA'
      });
    });
  });

  describe('POST /api/auth/change-password', () => {
    let authToken: string;

    beforeEach(async () => {
      // Login to get auth token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUserData.email,
          password: testUserData.password
        });
      
      authToken = loginResponse.body.token;
    });

    it('should change password successfully', async () => {
      const passwordData = {
        currentPassword: testUserData.password,
        newPassword: 'NewStrongPassword123!'
      };

      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send(passwordData)
        .expect(200);

      expect(response.body).toMatchObject({
        message: 'Password changed successfully'
      });

      // Verify can login with new password
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUserData.email,
          password: 'NewStrongPassword123!'
        })
        .expect(200);

      expect(loginResponse.body.token).toBeDefined();
    });

    it('should reject password change with incorrect current password', async () => {
      const passwordData = {
        currentPassword: 'WrongCurrentPassword123!',
        newPassword: 'NewStrongPassword123!'
      };

      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send(passwordData)
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Current password is incorrect',
        code: 'INVALID_CURRENT_PASSWORD'
      });
    });

    it('should reject password change with weak new password', async () => {
      const passwordData = {
        currentPassword: testUserData.password,
        newPassword: 'weak'
      };

      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send(passwordData)
        .expect(400);

      expect(response.body.code).toBe('PASSWORD_VALIDATION_ERROR');
    });

    it('should reject password change with missing fields', async () => {
      const response = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ currentPassword: testUserData.password })
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Current password and new password are required',
        code: 'MISSING_PASSWORDS'
      });
    });
  });

  describe('POST /api/auth/logout', () => {
    let authToken: string;

    beforeEach(async () => {
      // Login to get auth token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUserData.email,
          password: testUserData.password
        });
      
      authToken = loginResponse.body.token;
    });

    it('should logout successfully', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        message: 'Logged out successfully'
      });
    });

    it('should reject logout without authentication', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .expect(401);

      expect(response.body).toMatchObject({
        error: 'Authentication required',
        code: 'MISSING_TOKEN'
      });
    });
  });
});