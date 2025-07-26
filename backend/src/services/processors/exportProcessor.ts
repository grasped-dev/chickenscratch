import { Job } from 'bull';
import { ExportJobData, JobResult, JobProgress } from '../jobQueue.js';
import { exportService } from '../export.js';
import { ProjectRepository } from '../../models/ProjectRepository.js';

export class ExportProcessor {
  private projectRepo: ProjectRepository;

  constructor() {
    this.projectRepo = new ProjectRepository();
  }

  async process(job: Job<ExportJobData>): Promise<JobResult> {
    const startTime = Date.now();
    const { format, exportOptions, userId, projectId } = job.data;

    try {
      // Update progress
      await this.updateProgress(job, 10, 'Starting export generation', 'initialization');

      // Get project details
      const project = await this.projectRepo.findById(projectId);
      if (!project) {
        throw new Error(`Project with ID ${projectId} not found`);
      }

      if (!project.summary) {
        throw new Error(`Project ${projectId} does not have a summary to export`);
      }

      await this.updateProgress(job, 20, 'Preparing export data', 'data-preparation');

      // Prepare export request
      const exportRequest = {
        projectId,
        format,
        options: exportOptions
      };

      await this.updateProgress(job, 40, `Generating ${format.toUpperCase()} export`, 'generation');

      let exportResult;
      if (format === 'pdf') {
        exportResult = await exportService.generatePDF(exportRequest);
      } else if (format === 'csv') {
        exportResult = await exportService.generateCSV(exportRequest);
      } else {
        throw new Error(`Unsupported export format: ${format}`);
      }

      await this.updateProgress(job, 80, 'Finalizing export file', 'finalization');

      // Generate download URL or file path
      const downloadInfo = {
        filename: exportResult.filename,
        url: exportResult.url || exportResult.filePath,
        size: exportResult.size,
        format,
        generatedAt: new Date()
      };

      await this.updateProgress(job, 100, 'Export completed', 'completed');

      const processingTime = Date.now() - startTime;

      return {
        success: true,
        data: {
          projectId,
          export: downloadInfo,
          format,
          options: exportOptions,
          statistics: {
            fileSize: exportResult.size,
            generationTime: processingTime,
            includedSections: {
              summary: exportOptions.includeSummary,
              originalText: exportOptions.includeOriginalText,
              images: exportOptions.includeImages
            }
          },
          processingTime
        },
        processingTime,
        completedAt: new Date()
      };

    } catch (error) {
      console.error(`Export generation failed for project ${projectId}:`, error);

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
    job: Job<ExportJobData>,
    percentage: number,
    message: string,
    stage: string
  ): Promise<void> {
    const progress: JobProgress = {
      percentage,
      message,
      stage,
      data: {
        projectId: job.data.projectId,
        format: job.data.format
      }
    };

    await job.progress(progress);
  }
}

export const exportProcessor = new ExportProcessor();