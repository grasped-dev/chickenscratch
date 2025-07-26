import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import summaryRoutes from '../routes/summary.js';
import { authMiddleware } from '../middleware/auth.js';
import type { ProjectSummary } from 'chicken-scratch-shared/types/processing';

// Mock dependencies
vi.mock('../services/summary.js');
vi.mock('../middleware/auth.js');

// Mock environment variables
process.env.OPENAI_API_KEY = 'test-api-key';

const app = express();
app.use(express.json());
app.use('/api/summary', summaryRoutes);

describe('Summary Integration Tests', () => {
  let mockSummaryService: any;
  let mockAuthMiddleware: any;

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    name: 'Test User'
  };

  const mockSummary: ProjectSummary = {
    topThemes: [
      {
        label: 'Learning Objectives',
        noteCount: 3,
        percentage: 50,
        keyTerms: ['learning', 'objectives', 'goals'],
        representativeQuote: 'Students should understand basic concepts'
      },
      {
        label: 'Assessment Methods',
        noteCount: 2,
        percentage: 33.33,
        keyTerms: ['assessment', 'evaluation', 'testing'],
        representativeQuote: 'Use formative assessments regularly'
      }
    ],
    overallInsights: 'The analysis reveals strong focus on educational planning with emphasis on learning objectives and assessment strategies.',
    distribution: [
      { theme: 'Learning Objectives', count: 3, percentage: 50 },
      { theme: 'Assessment Methods', count: 2, percentage: 33.33 }
    ],
    representativeQuotes: [
      {
        text: 'Students should understand basic concepts',
        theme: 'Learning Objectives',
        confidence: 0.9,
        source: 'Note abc123'
      },
      {
        text: 'Use formative assessments regularly',
        theme: 'Assessment Methods',
        confidence: 0.82,
        source: 'Note def456'
      }
    ],
    metadata: {
      totalNotes: 6,
      processingTime: 2500,
      clustersFound: 3,
      averageConfidence: 0.85,
      generatedAt: new Date('2024-01-15T10:30:00Z')
    }
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock auth middleware
    mockAuthMiddleware = vi.fn((req, res, next) => {
      req.user = mockUser;
      next();
    });
    
    const authModule = await import('../middleware/auth.js');
    vi.mocked(authModule.authMiddleware).mockImplementation(mockAuthMiddleware);

    // Mock summary service
    const SummaryServiceModule = await import('../services/summary.js');
    const { SummaryService } = vi.mocked(SummaryServiceModule);
    mockSummaryService = {
      generateProjectSummary: vi.fn(),
      getProjectSummary: vi.fn(),
      updateThemeImportance: vi.fn(),
      generateSummaryDigest: vi.fn()
    };

    SummaryService.prototype.generateProjectSummary = mockSummaryService.generateProjectSummary;
    SummaryService.prototype.getProjectSummary = mockSummaryService.getProjectSummary;
    SummaryService.prototype.updateThemeImportance = mockSummaryService.updateThemeImportance;
    SummaryService.prototype.generateSummaryDigest = mockSummaryService.generateSummaryDigest;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/summary/generate', () => {
    it('should generate project summary successfully', async () => {
      mockSummaryService.generateProjectSummary.mockResolvedValue(mockSummary);

      const response = await request(app)
        .post('/api/summary/generate')
        .send({
          projectId: 'project-123',
          summaryOptions: {
            includeQuotes: true,
            includeDistribution: true,
            maxThemes: 10,
            minThemePercentage: 2
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockSummary);
      expect(mockSummaryService.generateProjectSummary).toHaveBeenCalledWith({
        projectId: 'project-123',
        summaryOptions: {
          includeQuotes: true,
          includeDistribution: true,
          maxThemes: 10,
          minThemePercentage: 2
        }
      });
    });

    it('should generate summary with default options', async () => {
      mockSummaryService.generateProjectSummary.mockResolvedValue(mockSummary);

      const response = await request(app)
        .post('/api/summary/generate')
        .send({
          projectId: 'project-123'
        });

      expect(response.status).toBe(200);
      expect(mockSummaryService.generateProjectSummary).toHaveBeenCalledWith({
        projectId: 'project-123',
        summaryOptions: {
          includeQuotes: true,
          includeDistribution: true,
          maxThemes: 10,
          minThemePercentage: 2
        }
      });
    });

    it('should return 400 for invalid project ID', async () => {
      const response = await request(app)
        .post('/api/summary/generate')
        .send({
          projectId: 'invalid-id'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request data');
    });

    it('should return 400 for invalid summary options', async () => {
      const response = await request(app)
        .post('/api/summary/generate')
        .send({
          projectId: 'project-123',
          summaryOptions: {
            maxThemes: -1, // Invalid
            minThemePercentage: 101 // Invalid
          }
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request data');
    });

    it('should return 500 when service throws error', async () => {
      mockSummaryService.generateProjectSummary.mockRejectedValue(
        new Error('Service error')
      );

      const response = await request(app)
        .post('/api/summary/generate')
        .send({
          projectId: 'project-123'
        });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to generate summary');
      expect(response.body.message).toBe('Service error');
    });

    it('should return 401 when user not authenticated', async () => {
      mockAuthMiddleware.mockImplementation((req, res, next) => {
        res.status(401).json({ error: 'Authentication required' });
      });

      const response = await request(app)
        .post('/api/summary/generate')
        .send({
          projectId: 'project-123'
        });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/summary/:projectId', () => {
    it('should get existing project summary', async () => {
      mockSummaryService.getProjectSummary.mockResolvedValue(mockSummary);

      const response = await request(app)
        .get('/api/summary/project-123');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockSummary);
      expect(mockSummaryService.getProjectSummary).toHaveBeenCalledWith('project-123');
    });

    it('should return 404 when summary not found', async () => {
      mockSummaryService.getProjectSummary.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/summary/project-123');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Summary not found for project');
    });

    it('should return 400 for invalid project ID format', async () => {
      const response = await request(app)
        .get('/api/summary/invalid-id');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid project ID format');
    });
  });

  describe('GET /api/summary/:projectId/stats', () => {
    it('should get summary statistics', async () => {
      mockSummaryService.getProjectSummary.mockResolvedValue(mockSummary);

      const response = await request(app)
        .get('/api/summary/project-123/stats');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual({
        totalNotes: 6,
        totalThemes: 2,
        averageConfidence: 0.85,
        processingTime: 2500,
        generatedAt: '2024-01-15T10:30:00.000Z',
        topThemePercentage: 50,
        themeDistribution: [
          { theme: 'Learning Objectives', count: 3, percentage: 50 },
          { theme: 'Assessment Methods', count: 2, percentage: 33.33 }
        ],
        quotesCount: 2
      });
    });

    it('should return 404 when summary not found', async () => {
      mockSummaryService.getProjectSummary.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/summary/project-123/stats');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Summary not found for project');
    });
  });

  describe('PUT /api/summary/theme-importance', () => {
    it('should update theme importance successfully', async () => {
      const updatedSummary = {
        ...mockSummary,
        topThemes: [
          { ...mockSummary.topThemes[0], percentage: 70 },
          { ...mockSummary.topThemes[1], percentage: 30 }
        ]
      };

      mockSummaryService.updateThemeImportance.mockResolvedValue(updatedSummary);

      const response = await request(app)
        .put('/api/summary/theme-importance')
        .send({
          projectId: 'project-123',
          themeUpdates: [
            { theme: 'Learning Objectives', importance: 70 },
            { theme: 'Assessment Methods', importance: 30 }
          ]
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.topThemes[0].percentage).toBe(70);
      expect(response.body.data.topThemes[1].percentage).toBe(30);
    });

    it('should return 400 for invalid theme updates', async () => {
      const response = await request(app)
        .put('/api/summary/theme-importance')
        .send({
          projectId: 'project-123',
          themeUpdates: [
            { theme: '', importance: -10 } // Invalid
          ]
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request data');
    });

    it('should return 404 when update fails', async () => {
      mockSummaryService.updateThemeImportance.mockResolvedValue(null);

      const response = await request(app)
        .put('/api/summary/theme-importance')
        .send({
          projectId: 'project-123',
          themeUpdates: [
            { theme: 'Learning Objectives', importance: 70 }
          ]
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Summary not found or update failed');
    });
  });

  describe('POST /api/summary/digest', () => {
    it('should generate brief digest', async () => {
      const briefDigest = 'Analysis of 6 notes identified 2 themes. Top themes: Learning Objectives (50%), Assessment Methods (33.33%). The analysis reveals strong focus on educational planning.';
      
      mockSummaryService.generateSummaryDigest.mockResolvedValue(briefDigest);

      const response = await request(app)
        .post('/api/summary/digest')
        .send({
          projectId: 'project-123',
          format: 'brief'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.digest).toBe(briefDigest);
      expect(response.body.data.format).toBe('brief');
      expect(mockSummaryService.generateSummaryDigest).toHaveBeenCalledWith('project-123', 'brief');
    });

    it('should generate detailed digest', async () => {
      const detailedDigest = '# Summary Analysis\n\n**Total Notes:** 6\n**Themes Identified:** 2\n...';
      
      mockSummaryService.generateSummaryDigest.mockResolvedValue(detailedDigest);

      const response = await request(app)
        .post('/api/summary/digest')
        .send({
          projectId: 'project-123',
          format: 'detailed'
        });

      expect(response.status).toBe(200);
      expect(response.body.data.digest).toBe(detailedDigest);
      expect(response.body.data.format).toBe('detailed');
    });

    it('should use default format when not specified', async () => {
      mockSummaryService.generateSummaryDigest.mockResolvedValue('Brief digest');

      const response = await request(app)
        .post('/api/summary/digest')
        .send({
          projectId: 'project-123'
        });

      expect(response.status).toBe(200);
      expect(response.body.data.format).toBe('brief');
      expect(mockSummaryService.generateSummaryDigest).toHaveBeenCalledWith('project-123', 'brief');
    });

    it('should return 400 for invalid format', async () => {
      const response = await request(app)
        .post('/api/summary/digest')
        .send({
          projectId: 'project-123',
          format: 'invalid'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request data');
    });
  });

  describe('POST /api/summary/:projectId/regenerate', () => {
    it('should regenerate summary with new options', async () => {
      mockSummaryService.generateProjectSummary.mockResolvedValue(mockSummary);

      const response = await request(app)
        .post('/api/summary/project-123/regenerate')
        .send({
          summaryOptions: {
            includeQuotes: false,
            maxThemes: 5
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockSummary);
      expect(mockSummaryService.generateProjectSummary).toHaveBeenCalledWith({
        projectId: 'project-123',
        summaryOptions: {
          includeQuotes: false,
          includeDistribution: true,
          maxThemes: 5,
          minThemePercentage: 2
        }
      });
    });

    it('should regenerate with default options when none provided', async () => {
      mockSummaryService.generateProjectSummary.mockResolvedValue(mockSummary);

      const response = await request(app)
        .post('/api/summary/project-123/regenerate')
        .send({});

      expect(response.status).toBe(200);
      expect(mockSummaryService.generateProjectSummary).toHaveBeenCalledWith({
        projectId: 'project-123',
        summaryOptions: undefined
      });
    });

    it('should return 400 for invalid project ID', async () => {
      const response = await request(app)
        .post('/api/summary/invalid-id/regenerate')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid project ID format');
    });
  });

  describe('Authentication', () => {
    it('should require authentication for all endpoints', async () => {
      mockAuthMiddleware.mockImplementation((req, res, next) => {
        res.status(401).json({ error: 'Authentication required' });
      });

      const endpoints = [
        { method: 'post', path: '/api/summary/generate' },
        { method: 'get', path: '/api/summary/project-123' },
        { method: 'get', path: '/api/summary/project-123/stats' },
        { method: 'put', path: '/api/summary/theme-importance' },
        { method: 'post', path: '/api/summary/digest' },
        { method: 'post', path: '/api/summary/project-123/regenerate' }
      ];

      for (const endpoint of endpoints) {
        const response = await request(app)[endpoint.method](endpoint.path).send({});
        expect(response.status).toBe(401);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle service errors gracefully', async () => {
      mockSummaryService.generateProjectSummary.mockRejectedValue(
        new Error('Database connection failed')
      );

      const response = await request(app)
        .post('/api/summary/generate')
        .send({
          projectId: 'project-123'
        });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to generate summary');
      expect(response.body.message).toBe('Database connection failed');
    });

    it('should handle validation errors with detailed messages', async () => {
      const response = await request(app)
        .post('/api/summary/generate')
        .send({
          projectId: 'invalid',
          summaryOptions: {
            maxThemes: 'not-a-number'
          }
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request data');
      expect(response.body.details).toBeDefined();
    });
  });
});