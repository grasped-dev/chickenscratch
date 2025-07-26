import { Job } from 'bull';
import { SummaryJobData, JobResult, JobProgress } from '../jobQueue.js';
import { summaryService } from '../summary.js';
import { ProjectRepository } from '../../models/ProjectRepository.js';

export class SummaryProcessor {
  private projectRepo: ProjectRepository;

  constructor() {
    this.projectRepo = new ProjectRepository();
  }

  async process(job: Job<SummaryJobData>): Promise<JobResult> {
    const startTime = Date.now();
    const { clusters, summaryOptions, userId, projectId } = job.data;

    try {
      // Update progress
      await this.updateProgress(job, 10, 'Starting summary generation', 'initialization');

      if (!clusters || clusters.length === 0) {
        throw new Error('No clusters provided for summary generation');
      }

      await this.updateProgress(job, 20, 'Analyzing clusters', 'analysis');

      // Get project details
      const project = await this.projectRepo.findById(projectId);
      if (!project) {
        throw new Error(`Project with ID ${projectId} not found`);
      }

      await this.updateProgress(job, 30, 'Generating theme summaries', 'theme-generation');

      // Generate summary using the summary service
      const summaryRequest = {
        clusters,
        originalText: [], // This would be populated from the database
        summaryOptions
      };

      const summary = await summaryService.generateSummary(summaryRequest);

      await this.updateProgress(job, 70, 'Processing insights', 'insight-processing');

      // Calculate additional statistics
      const totalNotes = clusters.reduce((sum, cluster) => sum + (cluster.textBlocks?.length || 0), 0);
      const averageNotesPerTheme = totalNotes / clusters.length;

      await this.updateProgress(job, 85, 'Saving summary to project', 'database-save');

      // Update project with summary
      const updatedProject = await this.projectRepo.update(projectId, {
        summary: {
          ...summary,
          generatedAt: new Date(),
          statistics: {
            totalNotes,
            totalThemes: clusters.length,
            averageNotesPerTheme: Math.round(averageNotesPerTheme * 100) / 100
          }
        },
        status: 'completed',
        updatedAt: new Date()
      });

      await this.updateProgress(job, 100, 'Summary generation completed', 'completed');

      const processingTime = Date.now() - startTime;

      return {
        success: true,
        data: {
          projectId,
          summary: updatedProject.summary,
          statistics: {
            totalNotes,
            totalThemes: clusters.length,
            averageNotesPerTheme,
            topThemes: summary.topThemes?.length || 0,
            representativeQuotes: summary.representativeQuotes?.length || 0
          },
          processingTime
        },
        processingTime,
        completedAt: new Date()
      };

    } catch (error) {
      console.error(`Summary generation failed for project ${projectId}:`, error);

      // Update project status to failed
      await this.projectRepo.update(projectId, {
        status: 'failed',
        updatedAt: new Date()
      });

      const processingTime = Date.now() - startTime;

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        processingTime,
        completedAt: new Date()
      };
    }
  }

  private async updateProgress(
    job: Job<SummaryJobData>,
    percentage: number,
    message: string,
    stage: string
  ): Promise<void> {
    const progress: JobProgress = {
      percentage,
      message,
      stage,
      data: {
        projectId: job.data.projectId
      }
    };

    await job.progress(progress);
  }
}

export const summaryProcessor = new SummaryProcessor();