// Backend processing type definitions
// Re-export shared types (will be available once shared package is built)
// export * from 'chicken-scratch-shared/types/processing';

// Additional backend-specific processing types
export interface ProcessingJob {
  id: string;
  type: 'ocr' | 'clustering' | 'export';
  data: any;
  priority: number;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ServiceConfig {
  timeout: number;
  retries: number;
  backoffMultiplier: number;
}