import { Job } from 'bull';
import { ClusteringJobData, JobResult, JobProgress } from '../jobQueue.js';
import { clusteringService } from '../clustering.js';
import { ClusterRepository } from '../../models/ClusterRepository.js';
import { NoteRepository } from '../../models/NoteRepository.js';

export class ClusteringProcessor {
  private clusterRepo: ClusterRepository;
  private noteRepo: NoteRepository;

  constructor() {
    this.clusterRepo = new ClusterRepository();
    this.noteRepo = new NoteRepository();
  }

  async process(job: Job<ClusteringJobData>): Promise<JobResult> {
    const startTime = Date.now();
    const { textBlocks, clusteringMethod, targetClusters, userId, projectId } = job.data;

    try {
      // Update progress
      await this.updateProgress(job, 10, 'Starting clustering analysis', 'initialization');

      if (!textBlocks || textBlocks.length === 0) {
        throw new Error('No text blocks provided for clustering');
      }

      await this.updateProgress(job, 20, 'Preparing text for clustering', 'preparation');

      // Prepare clustering request
      const clusteringRequest = {
        textBlocks,
        clusteringMethod,
        targetClusters
      };

      await this.updateProgress(job, 30, 'Generating embeddings', 'embeddings');

      // Perform clustering
      const clusteringResult = await clusteringService.clusterText(clusteringRequest);

      await this.updateProgress(job, 70, 'Processing clustering results', 'result-processing');

      // Save clusters to database
      const savedClusters = [];
      for (let i = 0; i < clusteringResult.clusters.length; i++) {
        const cluster = clusteringResult.clusters[i];
        
        const progressPercentage = 70 + Math.floor((i / clusteringResult.clusters.length) * 20);
        await this.updateProgress(
          job, 
          progressPercentage, 
          `Saving cluster ${i + 1} of ${clusteringResult.clusters.length}`, 
          'database-save'
        );

        const clusterData = {
          projectId,
          label: cluster.label,
          confidence: cluster.confidence,
          centroid: cluster.centroid,
          createdAt: new Date(),
          updatedAt: new Date()
        };

        const savedCluster = await this.clusterRepo.create(clusterData);
        
        // Update notes with cluster assignment
        for (const textBlockId of cluster.textBlocks) {
          await this.noteRepo.updateClusterAssignment(textBlockId, savedCluster.id);
        }

        savedClusters.push({
          ...savedCluster,
          textBlockIds: cluster.textBlocks
        });
      }

      await this.updateProgress(job, 95, 'Finalizing clustering results', 'finalization');

      // Handle unclustered items
      if (clusteringResult.unclustered && clusteringResult.unclustered.length > 0) {
        console.log(`${clusteringResult.unclustered.length} text blocks remained unclustered`);
      }

      await this.updateProgress(job, 100, 'Clustering completed', 'completed');

      const processingTime = Date.now() - startTime;

      return {
        success: true,
        data: {
          projectId,
          clusters: savedClusters,
          unclustered: clusteringResult.unclustered,
          confidence: clusteringResult.confidence,
          method: clusteringMethod,
          statistics: {
            totalTextBlocks: textBlocks.length,
            clustersCreated: savedClusters.length,
            unclusteredItems: clusteringResult.unclustered?.length || 0,
            averageConfidence: clusteringResult.confidence
          },
          processingTime
        },
        processingTime,
        completedAt: new Date()
      };

    } catch (error) {
      console.error(`Clustering failed for project ${projectId}:`, error);

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
    job: Job<ClusteringJobData>,
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
        method: job.data.clusteringMethod
      }
    };

    await job.progress(progress);
  }
}

export const clusteringProcessor = new ClusteringProcessor();