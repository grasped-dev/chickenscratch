import { Request, Response } from 'express';
import { SummaryService, SummaryRequest } from '../services/summary.js';
import { z } from 'zod';

// Validation schemas
const generateSummarySchema = z.object({
  projectId: z.string().uuid(),
  summaryOptions: z.object({
    includeQuotes: z.boolean().optional().default(true),
    includeDistribution: z.boolean().optional().default(true),
    maxThemes: z.number().int().min(1).max(20).optional().default(10),
    minThemePercentage: z.number().min(0).max(50).optional().default(2)
  }).optional()
});

const updateThemeImportanceSchema = z.object({
  projectId: z.string().uuid(),
  themeUpdates: z.array(z.object({
    theme: z.string().min(1),
    importance: z.number().min(0).max(100)
  }))
});

const generateDigestSchema = z.object({
  projectId: z.string().uuid(),
  format: z.enum(['brief', 'detailed', 'executive']).optional().default('brief')
});

export class SummaryController {
  private summaryService: SummaryService;

  constructor() {
    this.summaryService = new SummaryService();
  }

  /**
   * Generate project summary
   * POST /api/summary/generate
   */
  async generateSummary(req: Request, res: Response): Promise<void> {
    try {
      // Validate request body
      const validatedData = generateSummarySchema.parse(req.body);
      
      // Check if user has access to project
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      // Generate summary
      const summary = await this.summaryService.generateProjectSummary(validatedData);

      res.status(200).json({
        success: true,
        data: summary
      });
    } catch (error) {
      console.error('Error generating summary:', error);
      
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Invalid request data',
          details: error.errors
        });
        return;
      }

      res.status(500).json({
        error: 'Failed to generate summary',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get existing project summary
   * GET /api/summary/:projectId
   */
  async getSummary(req: Request, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      
      // Validate project ID
      if (!projectId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
        res.status(400).json({ error: 'Invalid project ID format' });
        return;
      }

      // Check if user has access to project
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      // Get summary
      const summary = await this.summaryService.getProjectSummary(projectId);

      if (!summary) {
        res.status(404).json({ error: 'Summary not found for project' });
        return;
      }

      res.status(200).json({
        success: true,
        data: summary
      });
    } catch (error) {
      console.error('Error getting summary:', error);
      res.status(500).json({
        error: 'Failed to get summary',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Update theme importance scores
   * PUT /api/summary/theme-importance
   */
  async updateThemeImportance(req: Request, res: Response): Promise<void> {
    try {
      // Validate request body
      const validatedData = updateThemeImportanceSchema.parse(req.body);
      
      // Check if user has access to project
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      // Update theme importance
      const updatedSummary = await this.summaryService.updateThemeImportance(
        validatedData.projectId,
        validatedData.themeUpdates
      );

      if (!updatedSummary) {
        res.status(404).json({ error: 'Summary not found or update failed' });
        return;
      }

      res.status(200).json({
        success: true,
        data: updatedSummary
      });
    } catch (error) {
      console.error('Error updating theme importance:', error);
      
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Invalid request data',
          details: error.errors
        });
        return;
      }

      res.status(500).json({
        error: 'Failed to update theme importance',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Generate summary digest in different formats
   * POST /api/summary/digest
   */
  async generateDigest(req: Request, res: Response): Promise<void> {
    try {
      // Validate request body
      const validatedData = generateDigestSchema.parse(req.body);
      
      // Check if user has access to project
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      // Generate digest
      const digest = await this.summaryService.generateSummaryDigest(
        validatedData.projectId,
        validatedData.format
      );

      res.status(200).json({
        success: true,
        data: {
          digest,
          format: validatedData.format
        }
      });
    } catch (error) {
      console.error('Error generating digest:', error);
      
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Invalid request data',
          details: error.errors
        });
        return;
      }

      res.status(500).json({
        error: 'Failed to generate digest',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get summary statistics for a project
   * GET /api/summary/:projectId/stats
   */
  async getSummaryStats(req: Request, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      
      // Validate project ID
      if (!projectId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
        res.status(400).json({ error: 'Invalid project ID format' });
        return;
      }

      // Check if user has access to project
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      // Get summary
      const summary = await this.summaryService.getProjectSummary(projectId);

      if (!summary) {
        res.status(404).json({ error: 'Summary not found for project' });
        return;
      }

      // Extract statistics
      const stats = {
        totalNotes: summary.metadata.totalNotes,
        totalThemes: summary.topThemes.length,
        averageConfidence: summary.metadata.averageConfidence,
        processingTime: summary.metadata.processingTime,
        generatedAt: summary.metadata.generatedAt,
        topThemePercentage: summary.topThemes[0]?.percentage || 0,
        themeDistribution: summary.distribution.slice(0, 5),
        quotesCount: summary.representativeQuotes.length
      };

      res.status(200).json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error getting summary stats:', error);
      res.status(500).json({
        error: 'Failed to get summary statistics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Regenerate summary with new options
   * POST /api/summary/:projectId/regenerate
   */
  async regenerateSummary(req: Request, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      
      // Validate project ID
      if (!projectId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
        res.status(400).json({ error: 'Invalid project ID format' });
        return;
      }

      // Validate request body
      const summaryOptions = req.body.summaryOptions ? 
        generateSummarySchema.shape.summaryOptions.parse(req.body.summaryOptions) : 
        undefined;
      
      // Check if user has access to project
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      // Regenerate summary
      const request: SummaryRequest = {
        projectId,
        summaryOptions
      };

      const summary = await this.summaryService.generateProjectSummary(request);

      res.status(200).json({
        success: true,
        data: summary
      });
    } catch (error) {
      console.error('Error regenerating summary:', error);
      
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Invalid request data',
          details: error.errors
        });
        return;
      }

      res.status(500).json({
        error: 'Failed to regenerate summary',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

// Create controller instance
export const summaryController = new SummaryController();

// Export route handlers
export const generateSummary = summaryController.generateSummary.bind(summaryController);
export const getSummary = summaryController.getSummary.bind(summaryController);
export const updateThemeImportance = summaryController.updateThemeImportance.bind(summaryController);
export const generateDigest = summaryController.generateDigest.bind(summaryController);
export const getSummaryStats = summaryController.getSummaryStats.bind(summaryController);
export const regenerateSummary = summaryController.regenerateSummary.bind(summaryController);