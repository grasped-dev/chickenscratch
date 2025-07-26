import { Job } from 'bull';
import { OCRJobData, JobResult, JobProgress } from '../jobQueue.js';
import { ocrService } from '../ocr.js';
import { ProcessedImageRepository } from '../../models/ProcessedImageRepository.js';

export class OCRProcessor {
  private processedImageRepo: ProcessedImageRepository;

  constructor() {
    this.processedImageRepo = new ProcessedImageRepository();
  }

  async process(job: Job<OCRJobData>): Promise<JobResult> {
    const startTime = Date.now();
    const { imageId, imageUrl, processingOptions, userId, projectId } = job.data;

    try {
      // Update progress
      await this.updateProgress(job, 10, 'Starting OCR processing', 'initialization');

      // Get image from database
      const image = await this.processedImageRepo.findById(imageId);
      if (!image) {
        throw new Error(`Image with ID ${imageId} not found`);
      }

      await this.updateProgress(job, 20, 'Sending image to AWS Textract', 'textract-request');

      // Process with OCR service
      const ocrResult = await ocrService.processImage(imageUrl, processingOptions);

      await this.updateProgress(job, 70, 'Processing OCR results', 'result-processing');

      // Update image with OCR results
      await this.processedImageRepo.update(imageId, {
        processingStatus: 'completed',
        ocrResults: ocrResult,
        updatedAt: new Date()
      });

      await this.updateProgress(job, 90, 'Saving results to database', 'database-save');

      // Extract and save bounding boxes if they exist
      if (ocrResult.boundingBoxes && ocrResult.boundingBoxes.length > 0) {
        // This would typically involve saving to BoundingBoxRepository
        // For now, we'll just log the count
        console.log(`Extracted ${ocrResult.boundingBoxes.length} bounding boxes for image ${imageId}`);
      }

      await this.updateProgress(job, 100, 'OCR processing completed', 'completed');

      const processingTime = Date.now() - startTime;

      return {
        success: true,
        data: {
          imageId,
          ocrResult,
          processingTime
        },
        processingTime,
        completedAt: new Date()
      };

    } catch (error) {
      console.error(`OCR processing failed for image ${imageId}:`, error);

      // Update image status to failed
      await this.processedImageRepo.update(imageId, {
        processingStatus: 'failed',
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
    job: Job<OCRJobData>,
    percentage: number,
    message: string,
    stage: string
  ): Promise<void> {
    const progress: JobProgress = {
      percentage,
      message,
      stage,
      data: {
        imageId: job.data.imageId,
        projectId: job.data.projectId
      }
    };

    await job.progress(progress);
  }
}

export const ocrProcessor = new OCRProcessor();