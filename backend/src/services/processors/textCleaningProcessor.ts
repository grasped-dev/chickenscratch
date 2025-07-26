import { Job } from 'bull';
import { TextCleaningJobData, JobResult, JobProgress } from '../jobQueue.js';
import { textCleaningService } from '../textCleaning.js';
import { NoteRepository } from '../../models/NoteRepository.js';

export class TextCleaningProcessor {
  private noteRepo: NoteRepository;

  constructor() {
    this.noteRepo = new NoteRepository();
  }

  async process(job: Job<TextCleaningJobData>): Promise<JobResult> {
    const startTime = Date.now();
    const { imageId, rawTextBlocks, cleaningOptions, userId, projectId } = job.data;

    try {
      // Update progress
      await this.updateProgress(job, 10, 'Starting text cleaning', 'initialization');

      if (!rawTextBlocks || rawTextBlocks.length === 0) {
        throw new Error('No text blocks provided for cleaning');
      }

      await this.updateProgress(job, 20, 'Analyzing text blocks', 'analysis');

      const cleanedResults = [];
      const totalBlocks = rawTextBlocks.length;

      // Process each text block
      for (let i = 0; i < rawTextBlocks.length; i++) {
        const textBlock = rawTextBlocks[i];
        
        const progressPercentage = 20 + Math.floor((i / totalBlocks) * 60);
        await this.updateProgress(
          job, 
          progressPercentage, 
          `Cleaning text block ${i + 1} of ${totalBlocks}`, 
          'text-cleaning'
        );

        try {
          // Clean the text using the text cleaning service
          const cleanedText = await textCleaningService.cleanText(
            textBlock.text,
            cleaningOptions
          );

          // Create note record
          const note = {
            imageId,
            originalText: textBlock.text,
            cleanedText: cleanedText.cleanedText,
            boundingBox: textBlock.boundingBox,
            confidence: textBlock.confidence,
            corrections: cleanedText.corrections || [],
            createdAt: new Date(),
            updatedAt: new Date()
          };

          // Save to database
          const savedNote = await this.noteRepo.create(note);
          cleanedResults.push(savedNote);

        } catch (blockError) {
          console.error(`Failed to clean text block ${i}:`, blockError);
          // Continue with other blocks even if one fails
          cleanedResults.push({
            imageId,
            originalText: textBlock.text,
            cleanedText: textBlock.text, // Use original if cleaning fails
            boundingBox: textBlock.boundingBox,
            confidence: textBlock.confidence,
            corrections: [],
            error: blockError instanceof Error ? blockError.message : 'Unknown error'
          });
        }
      }

      await this.updateProgress(job, 90, 'Finalizing cleaned text results', 'finalization');

      // Calculate overall statistics
      const successfulCleanings = cleanedResults.filter(r => !r.error).length;
      const totalCorrections = cleanedResults.reduce((sum, r) => 
        sum + (r.corrections?.length || 0), 0
      );

      await this.updateProgress(job, 100, 'Text cleaning completed', 'completed');

      const processingTime = Date.now() - startTime;

      return {
        success: true,
        data: {
          imageId,
          cleanedResults,
          statistics: {
            totalBlocks: totalBlocks,
            successfulCleanings,
            failedCleanings: totalBlocks - successfulCleanings,
            totalCorrections
          },
          processingTime
        },
        processingTime,
        completedAt: new Date()
      };

    } catch (error) {
      console.error(`Text cleaning failed for image ${imageId}:`, error);

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
    job: Job<TextCleaningJobData>,
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

export const textCleaningProcessor = new TextCleaningProcessor();