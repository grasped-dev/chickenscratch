import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { ExportController } from '../controllers/export.js';
import { ProjectRepository } from '../models/ProjectRepository.js';
import { ProcessedImageRepository } from '../models/ProcessedImageRepository.js';

// Simple mock setup
vi.mock('../models/ProjectRepository.js', () => ({
  ProjectRepository: {
    findById: vi.fn()
  }
}));

vi.mock('../models/ProcessedImageRepository.js', () => ({
  ProcessedImageRepository: {
    findByProjectId: vi.fn()
  }
}));

vi.mock('../middleware/auth.js', () => ({
  authenticateToken: vi.fn((req: any, res: any, next: any) => {
    req.user = { id: 'user-123', email: 'test@example.com', name: 'Test User' };
    next();
  })
}));

const app = express();
app.use(express.json());

// Import the mocked middleware
import { authenticateToken } from '../middleware/auth.js';

// Setup routes with middleware
app.use(authenticateToken);
app.get('/export/options', ExportController.getExportOptions);
app.post('/export/:projectId/preview', ExportController.previewExport);
app.post('/export/:projectId/csv', ExportController.generateCSV);

describe('Export Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /export/options', () => {
    it('should return available export options', async () => {
      const response = await request(app)
        .get('/export/options')
        .expect(200);

      expect(response.body).toHaveProperty('formats');
      expect(response.body).toHaveProperty('templates');
      expect(response.body).toHaveProperty('brandingOptions');
      expect(response.body).toHaveProperty('exportOptions');
      expect(response.body.formats).toContain('pdf');
      expect(response.body.formats).toContain('csv');
    });
  });

  describe('Export Service Functionality', () => {
    it('should have proper export options structure', async () => {
      const response = await request(app)
        .get('/export/options')
        .expect(200);

      expect(response.body.brandingOptions).toHaveProperty('primaryColor');
      expect(response.body.brandingOptions).toHaveProperty('secondaryColor');
      expect(response.body.brandingOptions).toHaveProperty('fontFamily');
      expect(response.body.brandingOptions).toHaveProperty('companyName');
      expect(response.body.brandingOptions).toHaveProperty('logoUrl');

      expect(response.body.exportOptions).toHaveProperty('includeSummary');
      expect(response.body.exportOptions).toHaveProperty('includeOriginalText');
      expect(response.body.exportOptions).toHaveProperty('includeImages');
      expect(response.body.exportOptions).toHaveProperty('customTemplate');
    });

    it('should include expected templates', async () => {
      const response = await request(app)
        .get('/export/options')
        .expect(200);

      expect(response.body.templates).toContain('default');
      expect(response.body.templates).toContain('minimal');
      expect(response.body.templates).toContain('detailed');
    });

    it('should include CSV-specific options', async () => {
      const response = await request(app)
        .get('/export/options')
        .expect(200);

      expect(response.body).toHaveProperty('csvFormats');
      expect(response.body).toHaveProperty('csvOptions');
      expect(response.body.csvFormats).toContain('themes');
      expect(response.body.csvFormats).toContain('quotes');
      expect(response.body.csvFormats).toContain('detailed');
      expect(response.body.csvFormats).toContain('summary');

      expect(response.body.csvOptions).toHaveProperty('format');
      expect(response.body.csvOptions).toHaveProperty('includeMetadata');
      expect(response.body.csvOptions).toHaveProperty('includeConfidence');
      expect(response.body.csvOptions).toHaveProperty('delimiter');
      expect(response.body.csvOptions).toHaveProperty('encoding');
    });
  });

  describe('POST /export/:projectId/csv', () => {
    const mockProject = {
      id: 'project-123',
      userId: 'user-123',
      name: 'Test Project',
      description: 'Test description',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      status: 'completed' as const,
      imageCount: 1,
      summary: {
        topThemes: [
          {
            label: 'User Experience',
            noteCount: 5,
            percentage: 50,
            keyTerms: ['UX', 'design'],
            representativeQuote: 'Users need better navigation'
          }
        ],
        overallInsights: 'Test insights',
        distribution: [
          { theme: 'User Experience', count: 5, percentage: 50 }
        ],
        representativeQuotes: [
          {
            text: 'Users need better navigation',
            theme: 'User Experience',
            confidence: 0.9,
            source: 'note-1'
          }
        ],
        metadata: {
          totalNotes: 5,
          processingTime: 1000,
          clustersFound: 1,
          averageConfidence: 0.9,
          generatedAt: new Date('2024-01-01')
        }
      }
    };

    const mockImages = [
      {
        id: 'image-1',
        projectId: 'project-123',
        originalUrl: 'https://example.com/image.jpg',
        filename: 'test.jpg',
        fileSize: 1024,
        mimeType: 'image/jpeg',
        uploadedAt: new Date('2024-01-01'),
        processingStatus: 'completed' as const,
        boundingBoxes: [],
        ocrResults: {
          extractedText: [],
          boundingBoxes: [],
          confidence: 0.9,
          processingTime: 500
        }
      }
    ];

    beforeEach(() => {
      vi.mocked(ProjectRepository.findById).mockResolvedValue(mockProject);
      vi.mocked(ProcessedImageRepository.findByProjectId).mockResolvedValue(mockImages);
    });

    it('should generate CSV export with default options', async () => {
      const response = await request(app)
        .post('/export/project-123/csv')
        .send({})
        .expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toContain('Test_Project_detailed.csv');
      expect(response.text).toContain('Project Information');
      expect(response.text).toContain('User Experience');
    });

    it('should generate themes CSV format', async () => {
      const response = await request(app)
        .post('/export/project-123/csv')
        .send({
          format: 'themes',
          includeConfidence: true
        })
        .expect(200);

      expect(response.headers['content-disposition']).toContain('Test_Project_themes.csv');
      expect(response.text).toContain('Theme,Note Count,Percentage');
      expect(response.text).toContain('User Experience,5,50.00');
      expect(response.text).not.toContain('Project Information');
    });

    it('should generate quotes CSV format', async () => {
      const response = await request(app)
        .post('/export/project-123/csv')
        .send({
          format: 'quotes',
          includeConfidence: true
        })
        .expect(200);

      expect(response.headers['content-disposition']).toContain('Test_Project_quotes.csv');
      expect(response.text).toContain('Quote,Theme,Source');
      expect(response.text).toContain('Users need better navigation');
      expect(response.text).not.toContain('Project Information');
    });

    it('should generate summary CSV format', async () => {
      const response = await request(app)
        .post('/export/project-123/csv')
        .send({
          format: 'summary',
          includeMetadata: true
        })
        .expect(200);

      expect(response.headers['content-disposition']).toContain('Test_Project_summary.csv');
      expect(response.text).toContain('Project Summary');
      expect(response.text).toContain('Overall Insights');
      expect(response.text).toContain('Theme Distribution');
    });

    it('should handle different delimiters', async () => {
      const response = await request(app)
        .post('/export/project-123/csv')
        .send({
          format: 'themes',
          delimiter: ';'
        })
        .expect(200);

      expect(response.text).toContain('Theme;Note Count;Percentage');
      expect(response.text).not.toContain('Theme,Note Count,Percentage');
    });

    it('should handle UTF-16LE encoding', async () => {
      const response = await request(app)
        .post('/export/project-123/csv')
        .send({
          format: 'themes',
          encoding: 'utf16le'
        })
        .buffer(true)
        .parse((res, callback) => {
          let data = Buffer.alloc(0);
          res.on('data', (chunk) => {
            data = Buffer.concat([data, chunk]);
          });
          res.on('end', () => {
            callback(null, data);
          });
        })
        .expect(200);

      expect(response.headers['content-type']).toContain('charset=utf-16le');
      
      // Check for UTF-16LE BOM in the raw response
      const buffer = response.body as Buffer;
      expect(buffer[0]).toBe(0xFF);
      expect(buffer[1]).toBe(0xFE);
    });

    it('should return 404 for non-existent project', async () => {
      vi.mocked(ProjectRepository.findById).mockResolvedValue(null);

      await request(app)
        .post('/export/non-existent/csv')
        .send({})
        .expect(404);
    });

    it('should return 403 for unauthorized access', async () => {
      const unauthorizedProject = {
        ...mockProject,
        userId: 'different-user'
      };
      vi.mocked(ProjectRepository.findById).mockResolvedValue(unauthorizedProject);

      await request(app)
        .post('/export/project-123/csv')
        .send({})
        .expect(403);
    });

    it('should return 400 for project without summary', async () => {
      const projectWithoutSummary = {
        ...mockProject,
        summary: undefined
      };
      vi.mocked(ProjectRepository.findById).mockResolvedValue(projectWithoutSummary);

      await request(app)
        .post('/export/project-123/csv')
        .send({})
        .expect(400);
    });

    it('should exclude confidence when option is false', async () => {
      const response = await request(app)
        .post('/export/project-123/csv')
        .send({
          format: 'themes',
          includeConfidence: false
        })
        .expect(200);

      expect(response.text).not.toContain('Confidence Score');
    });

    it('should exclude metadata when option is false', async () => {
      const response = await request(app)
        .post('/export/project-123/csv')
        .send({
          format: 'detailed',
          includeMetadata: false
        })
        .expect(200);

      expect(response.text).not.toContain('Processing Metadata');
    });
  });
});