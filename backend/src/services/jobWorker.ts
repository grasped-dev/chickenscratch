import { JobType, getJobQueueService } from './jobQueue.js';
import { ocrProcessor } from './processors/ocrProcessor.js';
import { textCleaningProcessor } from './processors/textCleaningProcessor.js';
import { clusteringProcessor } from './processors/clusteringProcessor.js';
import { summaryProcessor } from './processors/summaryProcessor.js';
import { exportProcessor } from './processors/exportProcessor.js';

export class JobWorkerService {
  private isRunning = false;

  constructor() {
    // Bind processors to their respective job types
    this.setupJobProcessors();
  }

  private setupJobProcessors() {
    const jobQueueService = getJobQueueService();
    if (!jobQueueService) {
      console.error('Job queue service not initialized');
      return;
    }

    // Get queues and set up processors
    const queues = (jobQueueService as any).queues;

    // OCR Processing
    const ocrQueue = queues.get(JobType.OCR_PROCESSING);
    if (ocrQueue) {
      ocrQueue.process(this.getConcurrency(JobType.OCR_PROCESSING), async (job: any) => {
        return await ocrProcessor.process(job);
      });
      console.log('OCR processor registered');
    }

    // Text Cleaning
    const textCleaningQueue = queues.get(JobType.TEXT_CLEANING);
    if (textCleaningQueue) {
      textCleaningQueue.process(this.getConcurrency(JobType.TEXT_CLEANING), async (job: any) => {
        return await textCleaningProcessor.process(job);
      });
      console.log('Text cleaning processor registered');
    }

    // Clustering
    const clusteringQueue = queues.get(JobType.CLUSTERING);
    if (clusteringQueue) {
      clusteringQueue.process(this.getConcurrency(JobType.CLUSTERING), async (job: any) => {
        return await clusteringProcessor.process(job);
      });
      console.log('Clustering processor registered');
    }

    // Summary Generation
    const summaryQueue = queues.get(JobType.SUMMARY_GENERATION);
    if (summaryQueue) {
      summaryQueue.process(this.getConcurrency(JobType.SUMMARY_GENERATION), async (job: any) => {
        return await summaryProcessor.process(job);
      });
      console.log('Summary processor registered');
    }

    // Export Generation
    const exportQueue = queues.get(JobType.EXPORT_GENERATION);
    if (exportQueue) {
      exportQueue.process(this.getConcurrency(JobType.EXPORT_GENERATION), async (job: any) => {
        return await exportProcessor.process(job);
      });
      console.log('Export processor registered');
    }
  }

  /**
   * Get concurrency level for each job type
   */
  private getConcurrency(jobType: JobType): number {
    const concurrencyMap = {
      [JobType.OCR_PROCESSING]: 2,        // OCR can be resource intensive
      [JobType.TEXT_CLEANING]: 4,         // Text cleaning is less resource intensive
      [JobType.CLUSTERING]: 1,            // Clustering requires significant memory
      [JobType.SUMMARY_GENERATION]: 2,    // Summary generation uses LLM
      [JobType.EXPORT_GENERATION]: 3      // Export generation is I/O intensive
    };

    return concurrencyMap[jobType] || 1;
  }

  /**
   * Start the job worker service
   */
  start(): void {
    if (this.isRunning) {
      console.log('Job worker service is already running');
      return;
    }

    this.isRunning = true;
    console.log('Job worker service started');

    // Set up graceful shutdown
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  /**
   * Stop the job worker service
   */
  async shutdown(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('Shutting down job worker service...');
    this.isRunning = false;

    const jobQueueService = getJobQueueService();
    if (jobQueueService) {
      await jobQueueService.shutdown();
    }

    console.log('Job worker service shut down successfully');
    process.exit(0);
  }

  /**
   * Check if the worker service is running
   */
  isWorkerRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get worker statistics
   */
  async getWorkerStats(): Promise<any> {
    const jobQueueService = getJobQueueService();
    if (!jobQueueService) {
      return null;
    }

    const queueStats = await jobQueueService.getAllQueueStats();
    
    return {
      isRunning: this.isRunning,
      queues: queueStats,
      concurrency: {
        [JobType.OCR_PROCESSING]: this.getConcurrency(JobType.OCR_PROCESSING),
        [JobType.TEXT_CLEANING]: this.getConcurrency(JobType.TEXT_CLEANING),
        [JobType.CLUSTERING]: this.getConcurrency(JobType.CLUSTERING),
        [JobType.SUMMARY_GENERATION]: this.getConcurrency(JobType.SUMMARY_GENERATION),
        [JobType.EXPORT_GENERATION]: this.getConcurrency(JobType.EXPORT_GENERATION)
      }
    };
  }
}

// Singleton instance
let jobWorkerService: JobWorkerService | null = null;

export const initializeJobWorkerService = (): JobWorkerService => {
  if (!jobWorkerService) {
    jobWorkerService = new JobWorkerService();
  }
  return jobWorkerService;
};

export const getJobWorkerService = (): JobWorkerService | null => {
  return jobWorkerService;
};