import { Request, Response } from 'express';
import { ExportService, ExportRequest, ExportOptions, CSVExportOptions } from '../services/export.js';
import { ProjectRepository } from '../models/ProjectRepository.js';
import { ProcessedImageRepository } from '../models/ProcessedImageRepository.js';
import { AuthenticatedRequest } from '../types/api.js';

export class ExportController {
  /**
   * Generate PDF export for a project
   */
  static async generatePDF(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const options: ExportOptions = {
        includeSummary: req.body.includeSummary ?? true,
        includeOriginalText: req.body.includeOriginalText ?? false,
        includeImages: req.body.includeImages ?? true,
        customTemplate: req.body.customTemplate,
        branding: req.body.branding
      };

      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      // Get project data
      const project = await ProjectRepository.findById(projectId);
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      // Verify user owns the project
      if (project.userId !== req.user.id) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      // Check if project has summary
      if (!project.summary) {
        res.status(400).json({ error: 'Project summary not available. Please complete processing first.' });
        return;
      }

      // Get project images
      const images = await ProcessedImageRepository.findByProjectId(projectId);

      // Generate PDF
      const result = await ExportService.generatePDF(
        project,
        project.summary,
        images,
        options
      );

      // Set response headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.setHeader('Content-Length', result.size);

      // Send PDF buffer
      res.send(result.buffer);

    } catch (error) {
      console.error('Error generating PDF:', error);
      res.status(500).json({ 
        error: 'Failed to generate PDF export',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Generate PDF export using Puppeteer for complex layouts
   */
  static async generateAdvancedPDF(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const options: ExportOptions = {
        includeSummary: req.body.includeSummary ?? true,
        includeOriginalText: req.body.includeOriginalText ?? false,
        includeImages: req.body.includeImages ?? true,
        customTemplate: req.body.customTemplate,
        branding: req.body.branding
      };

      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      // Get project data
      const project = await ProjectRepository.findById(projectId);
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      // Verify user owns the project
      if (project.userId !== req.user.id) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      // Check if project has summary
      if (!project.summary) {
        res.status(400).json({ error: 'Project summary not available. Please complete processing first.' });
        return;
      }

      // Get project images
      const images = await ProcessedImageRepository.findByProjectId(projectId);

      // Generate PDF using Puppeteer
      const result = await ExportService.generatePDFWithPuppeteer(
        project,
        project.summary,
        images,
        options
      );

      // Set response headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.setHeader('Content-Length', result.size);

      // Send PDF buffer
      res.send(result.buffer);

    } catch (error) {
      console.error('Error generating advanced PDF:', error);
      res.status(500).json({ 
        error: 'Failed to generate PDF export',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Generate CSV export for a project
   */
  static async generateCSV(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const options: ExportOptions = {
        includeSummary: req.body.includeSummary ?? true,
        includeOriginalText: req.body.includeOriginalText ?? false,
        includeImages: req.body.includeImages ?? true
      };

      const csvOptions: CSVExportOptions = {
        format: req.body.format || 'detailed',
        includeMetadata: req.body.includeMetadata ?? true,
        includeConfidence: req.body.includeConfidence ?? true,
        delimiter: req.body.delimiter || ',',
        encoding: req.body.encoding || 'utf8'
      };

      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      // Get project data
      const project = await ProjectRepository.findById(projectId);
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      // Verify user owns the project
      if (project.userId !== req.user.id) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      // Check if project has summary
      if (!project.summary) {
        res.status(400).json({ error: 'Project summary not available. Please complete processing first.' });
        return;
      }

      // Get project images
      const images = await ProcessedImageRepository.findByProjectId(projectId);

      // Generate CSV
      const result = await ExportService.generateCSV(
        project,
        project.summary,
        images,
        { ...options, csvOptions }
      );

      // Convert to appropriate encoding
      const buffer = ExportService.convertCSVEncoding(result.content, csvOptions.encoding);

      // Set response headers
      const mimeType = csvOptions.encoding === 'utf16le' 
        ? 'text/csv; charset=utf-16le' 
        : 'text/csv; charset=utf-8';
      
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.setHeader('Content-Length', buffer.length);

      // Send CSV buffer
      res.send(buffer);

    } catch (error) {
      console.error('Error generating CSV:', error);
      res.status(500).json({ 
        error: 'Failed to generate CSV export',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get export options and templates
   */
  static async getExportOptions(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const options = {
        formats: ['pdf', 'csv'],
        templates: ['default', 'minimal', 'detailed'],
        csvFormats: ['themes', 'quotes', 'detailed', 'summary'],
        brandingOptions: {
          primaryColor: 'Hex color code for primary branding',
          secondaryColor: 'Hex color code for secondary branding',
          fontFamily: 'Font family name',
          companyName: 'Company or organization name',
          logoUrl: 'URL to company logo (optional)'
        },
        exportOptions: {
          includeSummary: 'Include overall insights section',
          includeOriginalText: 'Include original extracted text',
          includeImages: 'Include original images in export',
          customTemplate: 'Custom HTML template (advanced users)'
        },
        csvOptions: {
          format: 'CSV export format (themes, quotes, detailed, summary)',
          includeMetadata: 'Include processing metadata',
          includeConfidence: 'Include confidence scores',
          delimiter: 'CSV delimiter (comma, semicolon, tab)',
          encoding: 'File encoding (utf8, utf16le)'
        }
      };

      res.json(options);

    } catch (error) {
      console.error('Error getting export options:', error);
      res.status(500).json({ 
        error: 'Failed to get export options',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Preview export before generation
   */
  static async previewExport(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const options: ExportOptions = {
        includeSummary: req.body.includeSummary ?? true,
        includeOriginalText: req.body.includeOriginalText ?? false,
        includeImages: req.body.includeImages ?? true,
        branding: req.body.branding
      };

      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      // Get project data
      const project = await ProjectRepository.findById(projectId);
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      // Verify user owns the project
      if (project.userId !== req.user.id) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      // Check if project has summary
      if (!project.summary) {
        res.status(400).json({ error: 'Project summary not available. Please complete processing first.' });
        return;
      }

      // Get project images
      const images = await ProcessedImageRepository.findByProjectId(projectId);

      // Generate preview data
      const preview = {
        project: {
          name: project.name,
          description: project.description,
          createdAt: project.createdAt
        },
        summary: project.summary,
        imageCount: images.length,
        estimatedPages: Math.ceil(
          (project.summary.topThemes.length * 0.5) + 
          (project.summary.representativeQuotes.length * 0.3) + 
          (options.includeImages ? images.length * 0.8 : 0) + 2
        ),
        sections: {
          overview: true,
          insights: options.includeSummary,
          themes: true,
          quotes: project.summary.representativeQuotes.length > 0,
          images: options.includeImages && images.length > 0
        }
      };

      res.json(preview);

    } catch (error) {
      console.error('Error generating export preview:', error);
      res.status(500).json({ 
        error: 'Failed to generate export preview',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}