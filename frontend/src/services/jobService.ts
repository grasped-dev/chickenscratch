import { apiClient } from '../utils/api';

export interface Job {
  id: string;
  type: 'ocr' | 'clustering' | 'summary' | 'export';
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  data: any;
  result?: any;
  error?: string;
  createdAt: string;
  updatedAt: string;
  estimatedDuration?: number;
  actualDuration?: number;
}

export interface JobFilter {
  type?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

class JobService {
  async getJobStatus(jobId: string): Promise<Job> {
    const response = await apiClient.get<Job>(`/jobs/${jobId}`);
    return response.data;
  }

  async cancelJob(jobId: string): Promise<void> {
    await apiClient.delete(`/jobs/${jobId}`);
  }

  async getUserJobs(filter?: JobFilter): Promise<{
    jobs: Job[];
    total: number;
    hasMore: boolean;
  }> {
    const params = new URLSearchParams();
    if (filter?.type) params.append('type', filter.type);
    if (filter?.status) params.append('status', filter.status);
    if (filter?.limit) params.append('limit', filter.limit.toString());
    if (filter?.offset) params.append('offset', filter.offset.toString());

    const response = await apiClient.get<{
      jobs: Job[];
      total: number;
      hasMore: boolean;
    }>(`/jobs/user/jobs?${params.toString()}`);
    return response.data;
  }

  async waitForJobCompletion(
    jobId: string, 
    pollInterval: number = 2000,
    onProgress?: (job: Job) => void
  ): Promise<Job> {
    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          const job = await this.getJobStatus(jobId);
          
          if (onProgress) {
            onProgress(job);
          }
          
          if (job.status === 'completed') {
            resolve(job);
          } else if (job.status === 'failed' || job.status === 'cancelled') {
            reject(new Error(job.error || `Job ${job.status}`));
          } else {
            // Continue polling
            setTimeout(poll, pollInterval);
          }
        } catch (error) {
          reject(error);
        }
      };
      
      poll();
    });
  }

  async getJobsByType(type: Job['type'], limit: number = 10): Promise<Job[]> {
    const result = await this.getUserJobs({ type, limit });
    return result.jobs;
  }

  async getActiveJobs(): Promise<Job[]> {
    const result = await this.getUserJobs({ 
      status: 'processing',
      limit: 50 
    });
    return result.jobs;
  }

  async retryFailedJob(jobId: string): Promise<{ newJobId: string }> {
    // This would need to be implemented on the backend
    // For now, we'll throw an error indicating it's not implemented
    throw new Error('Job retry functionality not yet implemented');
  }

  async getJobHistory(days: number = 7): Promise<{
    jobs: Job[];
    stats: {
      total: number;
      completed: number;
      failed: number;
      averageDuration: number;
    };
  }> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (days * 24 * 60 * 60 * 1000));
    
    const result = await this.getUserJobs({ limit: 1000 });
    
    // Filter jobs by date range
    const jobs = result.jobs.filter(job => {
      const jobDate = new Date(job.createdAt);
      return jobDate >= startDate && jobDate <= endDate;
    });

    const stats = {
      total: jobs.length,
      completed: jobs.filter(j => j.status === 'completed').length,
      failed: jobs.filter(j => j.status === 'failed').length,
      averageDuration: jobs
        .filter(j => j.actualDuration)
        .reduce((sum, j) => sum + (j.actualDuration || 0), 0) / jobs.length || 0,
    };

    return { jobs, stats };
  }
}

export const jobService = new JobService();