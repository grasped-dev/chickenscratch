import { apiClient } from '../utils/api';

export interface OCRProcessingRequest {
  imageId: string;
  processingOptions?: {
    detectHandwriting?: boolean;
    detectTables?: boolean;
    detectForms?: boolean;
  };
}

export interface OCRResult {
  extractedText: Array<{
    id: string;
    text: string;
    confidence: number;
    boundingBox: {
      left: number;
      top: number;
      width: number;
      height: number;
    };
    type: 'LINE' | 'WORD' | 'CELL';
  }>;
  boundingBoxes: Array<{
    left: number;
    top: number;
    width: number;
    height: number;
  }>;
  confidence: number;
  processingTime: number;
}

export interface OCRJobStatus {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  result?: OCRResult;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BatchOCRRequest {
  imageIds: string[];
  processingOptions?: {
    detectHandwriting?: boolean;
    detectTables?: boolean;
    detectForms?: boolean;
  };
}

class OCRService {
  async processImageSync(request: OCRProcessingRequest): Promise<OCRResult> {
    const response = await apiClient.post<OCRResult>('/ocr/process/sync', request);
    return response.data;
  }

  async processImageAsync(request: OCRProcessingRequest): Promise<{ jobId: string }> {
    const response = await apiClient.post<{ jobId: string }>('/ocr/process/async', request);
    return response.data;
  }

  async getAsyncResults(jobId: string): Promise<OCRResult> {
    const response = await apiClient.get<OCRResult>(`/ocr/jobs/${jobId}/results`);
    return response.data;
  }

  async checkJobStatus(jobId: string): Promise<OCRJobStatus> {
    const response = await apiClient.get<OCRJobStatus>(`/ocr/jobs/${jobId}/status`);
    return response.data;
  }

  async processWithRetry(request: OCRProcessingRequest, maxRetries: number = 3): Promise<OCRResult> {
    const response = await apiClient.post<OCRResult>('/ocr/process/retry', {
      ...request,
      maxRetries,
    });
    return response.data;
  }

  async processBatch(request: BatchOCRRequest): Promise<{ jobIds: string[] }> {
    const response = await apiClient.post<{ jobIds: string[] }>('/ocr/process/batch', request);
    return response.data;
  }

  async waitForCompletion(jobId: string, pollInterval: number = 2000): Promise<OCRResult> {
    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          const status = await this.checkJobStatus(jobId);
          
          if (status.status === 'completed') {
            const result = await this.getAsyncResults(jobId);
            resolve(result);
          } else if (status.status === 'failed') {
            reject(new Error(status.error || 'OCR processing failed'));
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
}

export const ocrService = new OCRService();