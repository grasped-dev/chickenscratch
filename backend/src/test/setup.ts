import { beforeAll, afterAll, beforeEach } from 'vitest';
import { createPool, closePool, withDatabase } from '../config/database.js';

// Test database setup
beforeAll(async () => {
  // Create database pool for testing
  createPool();
  
  // Ensure database connection is working
  await withDatabase(async (client) => {
    await client.query('SELECT 1');
  });
});

afterAll(async () => {
  // Close database connections
  await closePool();
});

beforeEach(async () => {
  // Clean up test data before each test
  await withDatabase(async (client) => {
    // Delete in reverse order of dependencies
    await client.query('DELETE FROM notes WHERE true');
    await client.query('DELETE FROM clusters WHERE true');
    await client.query('DELETE FROM processed_images WHERE true');
    await client.query('DELETE FROM projects WHERE true');
    await client.query('DELETE FROM users WHERE true');
  });
});

// Test utilities
// Helper function to generate unique test data
export const createTestUser = (suffix: string = '') => ({
  email: `test${suffix}@example.com`,
  name: `Test User${suffix}`,
  passwordHash: 'hashed_password_123'
});

export const testUser = createTestUser();

export const testProject = {
  name: 'Test Project',
  description: 'A test project for unit testing'
};

export const testProcessedImage = {
  originalUrl: 'https://example.com/image.jpg',
  filename: 'test-image.jpg',
  fileSize: 1024000,
  mimeType: 'image/jpeg'
};

export const testNote = {
  originalText: 'This is a test note',
  cleanedText: 'This is a test note',
  boundingBox: { left: 10, top: 20, width: 100, height: 50 },
  confidence: 0.95
};

export const testCluster = {
  label: 'Test Theme',
  textBlocks: ['note1', 'note2'],
  confidence: 0.85
};