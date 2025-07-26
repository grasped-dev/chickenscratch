import { 
  TextractClient, 
  DetectDocumentTextCommand, 
  StartDocumentTextDetectionCommand, 
  GetDocumentTextDetectionCommand,
  AnalyzeDocumentCommand,
  StartDocumentAnalysisCommand,
  GetDocumentAnalysisCommand
} from '@aws-sdk/client-textract';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config/index.js';
import { OCRRequest, OCRResponse, TextBlock, BoundingBox } from '../../../shared/src/types/processing.js';
import { cacheService } from './cache.js';
import { PerformanceMonitor, performanceMonitor } from '../utils/performance.js';
import { logger } from '../utils/logger.js';

export class OCRService {
  private textract: TextractClient;
  private s3: S3Client;

  constructor() {
    // Configure AWS SDK v3
    const awsConfig = {
      region: config.aws.region,
      credentials: {
        accessKeyId: config.aws.accessKeyId!,
        secretAccessKey: config.aws.secretAccessKey!,
      },
    };

    this.textract = new TextractClient(awsConfig);
    this.s3 = new S3Client(awsConfig);
  }

  /**
   * Process image synchronously using AWS Textract
   * Best for small images that can be processed quickly
   */
  @performanceMonitor('ocr.processImageSync')
  async processImageSync(request: OCRRequest): Promise<OCRResponse> {
    // Check cache first
    const cacheKey = `ocr:sync:${this.generateCacheKey(request)}`;
    const cached = await cacheService.get<OCRResponse>(cacheKey, { ttl: 3600 });
    
    if (cached) {
      logger.debug('OCR cache hit for sync processing');
      return cached;
    }

    const startTime = Date.now();

    try {
      // Get image from S3
      const imageBytes = await this.getImageFromS3(request.imageUrl);

      let result;

      // Use advanced analysis if tables or forms are requested
      if (request.processingOptions.detectTables || request.processingOptions.detectForms) {
        const featureTypes = [];
        if (request.processingOptions.detectTables) featureTypes.push('TABLES');
        if (request.processingOptions.detectForms) featureTypes.push('FORMS');

        const command = new AnalyzeDocumentCommand({
          Document: {
            Bytes: imageBytes,
          },
          FeatureTypes: featureTypes,
        });

        result = await this.textract.send(command);
      } else {
        // Use basic text detection for handwriting and simple text
        const command = new DetectDocumentTextCommand({
          Document: {
            Bytes: imageBytes,
          },
        });

        result = await this.textract.send(command);
      }
      
      // Parse results
      const { extractedText, boundingBoxes, confidence } = this.parseTextractResponse(result);
      
      const processingTime = Date.now() - startTime;

      const ocrResult: OCRResponse = {
        extractedText,
        boundingBoxes,
        confidence,
        processingTime,
      };

      // Cache the result
      await cacheService.set(cacheKey, ocrResult, { ttl: 3600 });
      logger.debug('OCR result cached for sync processing');

      return ocrResult;
    } catch (error) {
      throw new OCRError(`Synchronous OCR processing failed: ${(error as Error).message}`, error as Error);
    }
  }

  /**
   * Process image asynchronously using AWS Textract
   * Best for larger images or when additional features are needed
   */
  async processImageAsync(request: OCRRequest): Promise<string> {
    try {
      // Parse S3 URL to get bucket and key
      const { bucket, key } = this.parseS3Url(request.imageUrl);

      let result;

      // Use advanced analysis if tables or forms are requested
      if (request.processingOptions.detectTables || request.processingOptions.detectForms) {
        const featureTypes = [];
        if (request.processingOptions.detectTables) featureTypes.push('TABLES');
        if (request.processingOptions.detectForms) featureTypes.push('FORMS');

        const command = new StartDocumentAnalysisCommand({
          DocumentLocation: {
            S3Object: {
              Bucket: bucket,
              Name: key,
            },
          },
          FeatureTypes: featureTypes,
          NotificationChannel: {
            SNSTopicArn: process.env.AWS_SNS_TOPIC_ARN,
            RoleArn: process.env.AWS_TEXTRACT_ROLE_ARN,
          },
        });

        result = await this.textract.send(command);
      } else {
        // Use basic text detection for handwriting and simple text
        const command = new StartDocumentTextDetectionCommand({
          DocumentLocation: {
            S3Object: {
              Bucket: bucket,
              Name: key,
            },
          },
          NotificationChannel: {
            SNSTopicArn: process.env.AWS_SNS_TOPIC_ARN,
            RoleArn: process.env.AWS_TEXTRACT_ROLE_ARN,
          },
        });

        result = await this.textract.send(command);
      }
      
      if (!result.JobId) {
        throw new OCRError('Failed to start async OCR job');
      }

      return result.JobId;
    } catch (error) {
      throw new OCRError(`Async OCR processing failed: ${error.message}`, error);
    }
  }

  /**
   * Get results from async processing job
   */
  async getAsyncResults(jobId: string): Promise<OCRResponse> {
    const startTime = Date.now();

    try {
      // Try both text detection and document analysis endpoints
      let result;
      try {
        const command = new GetDocumentTextDetectionCommand({
          JobId: jobId,
        });
        result = await this.textract.send(command);
      } catch (error) {
        // If text detection fails, try document analysis
        const command = new GetDocumentAnalysisCommand({
          JobId: jobId,
        });
        result = await this.textract.send(command);
      }
      
      if (result.JobStatus !== 'SUCCEEDED') {
        throw new OCRError(`OCR job ${jobId} status: ${result.JobStatus}`);
      }

      // Parse results
      const { extractedText, boundingBoxes, confidence } = this.parseTextractResponse(result);
      
      const processingTime = Date.now() - startTime;

      return {
        extractedText,
        boundingBoxes,
        confidence,
        processingTime,
      };
    } catch (error) {
      throw new OCRError(`Failed to get async OCR results: ${error.message}`, error);
    }
  }

  /**
   * Check status of async processing job
   */
  async checkJobStatus(jobId: string): Promise<string> {
    try {
      // Try both text detection and document analysis endpoints
      let result;
      try {
        const command = new GetDocumentTextDetectionCommand({
          JobId: jobId,
        });
        result = await this.textract.send(command);
      } catch (error) {
        // If text detection fails, try document analysis
        const command = new GetDocumentAnalysisCommand({
          JobId: jobId,
        });
        result = await this.textract.send(command);
      }
      
      return result.JobStatus || 'UNKNOWN';
    } catch (error) {
      throw new OCRError(`Failed to check job status: ${error.message}`, error);
    }
  }

  /**
   * Process image with retry logic
   */
  async processWithRetry(
    request: OCRRequest,
    maxRetries: number = 3,
    useAsync: boolean = false
  ): Promise<OCRResponse | string> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (useAsync) {
          return await this.processImageAsync(request);
        } else {
          return await this.processImageSync(request);
        }
      } catch (error) {
        lastError = error;
        
        // Don't retry on certain errors
        if (error instanceof OCRError && !error.retryable) {
          throw error;
        }

        // Wait before retry with exponential backoff
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
          await this.sleep(delay);
        }
      }
    }

    throw new OCRError(`OCR processing failed after ${maxRetries} attempts: ${lastError.message}`, lastError);
  }

  /**
   * Parse Textract response into our format
   */
  private parseTextractResponse(result: any): {
    extractedText: TextBlock[];
    boundingBoxes: BoundingBox[];
    confidence: number;
  } {
    const extractedText: TextBlock[] = [];
    const boundingBoxes: BoundingBox[] = [];
    let totalConfidence = 0;
    let confidenceCount = 0;

    if (!result.Blocks) {
      return { extractedText, boundingBoxes, confidence: 0 };
    }

    result.Blocks.forEach((block: any) => {
      // Process text blocks (LINE, WORD, CELL)
      if (['LINE', 'WORD', 'CELL'].includes(block.BlockType)) {
        const boundingBox = this.convertBoundingBox(block.Geometry.BoundingBox);
        
        const textBlock: TextBlock = {
          id: block.Id || `${block.BlockType}_${Date.now()}_${Math.random()}`,
          text: block.Text || '',
          confidence: block.Confidence || 0,
          boundingBox,
          type: block.BlockType as 'LINE' | 'WORD' | 'CELL',
        };

        extractedText.push(textBlock);
        boundingBoxes.push(boundingBox);

        if (block.Confidence) {
          totalConfidence += block.Confidence;
          confidenceCount++;
        }
      }
      
      // Process table cells specifically
      if (block.BlockType === 'CELL' && block.Text) {
        const boundingBox = this.convertBoundingBox(block.Geometry.BoundingBox);
        
        const cellBlock: TextBlock = {
          id: block.Id || `CELL_${Date.now()}_${Math.random()}`,
          text: block.Text,
          confidence: block.Confidence || 0,
          boundingBox,
          type: 'CELL',
        };

        // Add additional metadata for table cells
        if (block.RowIndex !== undefined && block.ColumnIndex !== undefined) {
          (cellBlock as any).rowIndex = block.RowIndex;
          (cellBlock as any).columnIndex = block.ColumnIndex;
        }

        extractedText.push(cellBlock);
        boundingBoxes.push(boundingBox);

        if (block.Confidence) {
          totalConfidence += block.Confidence;
          confidenceCount++;
        }
      }
    });

    const confidence = confidenceCount > 0 ? totalConfidence / confidenceCount : 0;

    return { extractedText, boundingBoxes, confidence };
  }

  /**
   * Convert AWS Textract bounding box format to our format
   */
  private convertBoundingBox(awsBoundingBox: any): BoundingBox {
    return {
      left: awsBoundingBox.Left || 0,
      top: awsBoundingBox.Top || 0,
      width: awsBoundingBox.Width || 0,
      height: awsBoundingBox.Height || 0,
    };
  }

  /**
   * Get image bytes from S3
   */
  private async getImageFromS3(imageUrl: string): Promise<Uint8Array> {
    try {
      const { bucket, key } = this.parseS3Url(imageUrl);
      
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      const result = await this.s3.send(command);
      
      if (!result.Body) {
        throw new Error('No body in S3 response');
      }

      // Convert stream to Uint8Array
      const chunks: Uint8Array[] = [];
      const reader = result.Body.transformToWebStream().getReader();
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }

      // Combine chunks into single Uint8Array
      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }

      return combined;
    } catch (error) {
      throw new OCRError(`Failed to get image from S3: ${error.message}`, error);
    }
  }

  /**
   * Parse S3 URL to extract bucket and key
   */
  private parseS3Url(url: string): { bucket: string; key: string } {
    try {
      // Handle both s3:// and https:// URLs
      if (url.startsWith('s3://')) {
        const parts = url.replace('s3://', '').split('/');
        const bucket = parts[0];
        const key = parts.slice(1).join('/');
        return { bucket, key };
      } else if (url.includes('.s3.') || url.includes('.s3-')) {
        // Parse HTTPS S3 URL
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.substring(1).split('/');
        
        if (urlObj.hostname.includes('.s3.') && !urlObj.hostname.startsWith('s3.')) {
          // Virtual-hosted-style URL: https://bucket.s3.region.amazonaws.com/key
          const bucket = urlObj.hostname.split('.')[0];
          const key = pathParts.join('/');
          return { bucket, key };
        } else {
          // Path-style URL: https://s3.region.amazonaws.com/bucket/key
          const bucket = pathParts[0];
          const key = pathParts.slice(1).join('/');
          return { bucket, key };
        }
      } else {
        throw new Error('Invalid S3 URL format');
      }
    } catch (error) {
      throw new OCRError(`Failed to parse S3 URL: ${url}`, error);
    }
  }

  /**
   * Process multiple images in batch
   */
  async processBatch(requests: OCRRequest[]): Promise<OCRResponse[]> {
    const results: OCRResponse[] = [];
    const errors: { index: number; error: Error }[] = [];

    // Process images concurrently with a limit to avoid overwhelming the service
    const concurrencyLimit = 5;
    const chunks = this.chunkArray(requests, concurrencyLimit);

    for (const chunk of chunks) {
      const chunkPromises = chunk.map(async (request, index) => {
        try {
          const result = await this.processWithRetry(request, 3, false);
          return { index, result: result as OCRResponse };
        } catch (error) {
          errors.push({ index, error: error as Error });
          return null;
        }
      });

      const chunkResults = await Promise.all(chunkPromises);
      
      chunkResults.forEach((result) => {
        if (result) {
          results[result.index] = result.result;
        }
      });
    }

    // If there were errors, throw a batch error
    if (errors.length > 0) {
      throw new OCRError(
        `Batch processing failed for ${errors.length} out of ${requests.length} images`,
        new Error(`Errors: ${errors.map(e => e.error.message).join(', ')}`),
        true
      );
    }

    return results;
  }

  /**
   * Utility to chunk array into smaller arrays
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate cache key for OCR request
   */
  private generateCacheKey(request: OCRRequest): string {
    const options = JSON.stringify(request.processingOptions);
    const urlHash = Buffer.from(request.imageUrl).toString('base64').slice(0, 16);
    return `${urlHash}:${Buffer.from(options).toString('base64').slice(0, 16)}`;
  }
}

/**
 * Custom error class for OCR operations
 */
export class OCRError extends Error {
  public retryable: boolean;
  public originalError?: Error;

  constructor(message: string, originalError?: Error, retryable: boolean = true) {
    super(message);
    this.name = 'OCRError';
    this.originalError = originalError;
    this.retryable = retryable;

    // Determine if error is retryable based on the original error
    if (originalError) {
      this.retryable = this.isRetryableError(originalError);
    }
  }

  private isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    
    // Non-retryable errors
    if (
      message.includes('access denied') ||
      message.includes('invalid') ||
      message.includes('malformed') ||
      message.includes('not found') ||
      message.includes('unsupported')
    ) {
      return false;
    }

    // Retryable errors (throttling, temporary failures, etc.)
    return true;
  }
}

// Export singleton instance
export const ocrService = new OCRService();