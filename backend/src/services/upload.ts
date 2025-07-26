import AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/index.js';
import type { ProcessedImage, CreateProcessedImageInput } from 'chicken-scratch-shared';
import { ProcessedImageRepository } from '../models/ProcessedImageRepository.js';
import { getWebSocketService } from './websocket.js';
import { ErrorHandler, UploadErrorHandler } from '../utils/errorHandler.js';
import { FileValidator } from '../utils/fileValidation.js';

// Configure AWS S3
const s3 = new AWS.S3({
  region: config.aws.region,
  accessKeyId: config.aws.accessKeyId,
  secretAccessKey: config.aws.secretAccessKey,
});

export interface UploadResult {
  fileId: string;
  originalUrl: string;
  filename: string;
  fileSize: number;
  mimeType: string;
}

export interface UploadProgress {
  fileId: string;
  filename: string;
  progress: number;
  status: 'validating' | 'uploading' | 'processing' | 'completed' | 'failed';
  stage?: 'validation' | 's3_upload' | 'database_save' | 'complete';
  bytesUploaded?: number;
  totalBytes?: number;
  error?: string;
  warnings?: string[];
}

export class UploadService {
  private processedImageRepo: ProcessedImageRepository;

  constructor() {
    this.processedImageRepo = new ProcessedImageRepository();
  }

  /**
   * Validate file before upload
   */
  async validateFile(file: Express.Multer.File): Promise<{ valid: boolean; error?: string; warnings?: string[] }> {
    try {
      const result = await FileValidator.validateFile(file, {
        maxFileSize: config.maxFileSize,
        allowedMimeTypes: config.allowedFileTypes,
        requireImageDimensions: true
      });

      if (!result.valid) {
        return {
          valid: false,
          error: result.errors.join('; '),
          warnings: result.warnings
        };
      }

      return { 
        valid: true, 
        warnings: result.warnings.length > 0 ? result.warnings : undefined 
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'File validation failed'
      };
    }
  }

  /**
   * Upload file to S3 and create database record
   */
  async uploadFile(
    file: Express.Multer.File,
    projectId: string,
    userId?: string,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<UploadResult> {
    const fileId = uuidv4();
    const key = `projects/${projectId}/images/${fileId}-${file.originalname}`;

    const sendProgress = (progress: Partial<UploadProgress>) => {
      const fullProgress: UploadProgress = {
        fileId,
        filename: file.originalname,
        progress: 0,
        status: 'uploading',
        totalBytes: file.size,
        ...progress
      };

      if (onProgress) {
        onProgress(fullProgress);
      }

      // Get WebSocket service for real-time updates
      const wsService = getWebSocketService();
      if (wsService && userId) {
        wsService.sendUploadProgress(userId, fullProgress);
        wsService.sendProjectUploadProgress(projectId, fullProgress);
      }
    };

    try {
      // Report validation start
      sendProgress({
        progress: 5,
        status: 'validating',
        stage: 'validation'
      });

      // Validate file
      const validation = await this.validateFile(file);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      // Report upload start
      sendProgress({
        progress: 10,
        status: 'uploading',
        stage: 's3_upload',
        warnings: validation.warnings
      });

      // Upload to S3 with progress tracking
      const uploadParams: AWS.S3.PutObjectRequest = {
        Bucket: config.aws.s3Bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        Metadata: {
          originalName: file.originalname,
          projectId: projectId,
          fileId: fileId,
          uploadedAt: new Date().toISOString()
        }
      };

      // Create managed upload for progress tracking
      const managedUpload = s3.upload(uploadParams);
      
      // Track upload progress (only if managedUpload supports it)
      if (typeof managedUpload.on === 'function') {
        managedUpload.on('httpUploadProgress', (progress) => {
          const percentComplete = Math.round((progress.loaded / progress.total) * 70) + 10; // 10-80%
          sendProgress({
            progress: percentComplete,
            status: 'uploading',
            stage: 's3_upload',
            bytesUploaded: progress.loaded
          });
        });
      }

      const uploadResult = await ErrorHandler.retry(
        () => managedUpload.promise(),
        3,
        `S3 upload for file ${file.originalname}`
      );

      // Report database save start
      sendProgress({
        progress: 85,
        status: 'processing',
        stage: 'database_save'
      });

      // Create database record
      const imageData: CreateProcessedImageInput = {
        projectId,
        originalUrl: uploadResult.Location,
        filename: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype
      };

      const processedImage = await ErrorHandler.retry(
        () => this.processedImageRepo.create(imageData),
        3,
        `Database create for file ${file.originalname}`
      );

      // Report completion
      sendProgress({
        progress: 100,
        status: 'completed',
        stage: 'complete'
      });

      return {
        fileId: processedImage.id,
        originalUrl: processedImage.originalUrl,
        filename: processedImage.filename,
        fileSize: processedImage.fileSize,
        mimeType: processedImage.mimeType
      };

    } catch (error) {
      // Report upload failure
      sendProgress({
        progress: 0,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Upload failed'
      });

      throw new Error(`Failed to upload file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Upload multiple files
   */
  async uploadMultipleFiles(
    files: Express.Multer.File[],
    projectId: string,
    userId?: string,
    onProgress?: (fileId: string, progress: UploadProgress) => void
  ): Promise<UploadResult[]> {
    const results: UploadResult[] = [];
    const errors: string[] = [];

    // Process files in parallel with limited concurrency
    const concurrencyLimit = 3;
    const chunks = this.chunkArray(files, concurrencyLimit);

    for (const chunk of chunks) {
      const chunkPromises = chunk.map(async (file) => {
        try {
          const result = await this.uploadFile(
            file,
            projectId,
            userId,
            onProgress ? (progress) => onProgress(progress.fileId, progress) : undefined
          );
          results.push(result);
        } catch (error) {
          errors.push(`${file.originalname}: ${error instanceof Error ? error.message : 'Upload failed'}`);
        }
      });

      await Promise.all(chunkPromises);
    }

    if (errors.length > 0 && results.length === 0) {
      throw new Error(`All uploads failed: ${errors.join(', ')}`);
    }

    return results;
  }

  /**
   * Get upload status for a file
   */
  async getUploadStatus(fileId: string): Promise<ProcessedImage | null> {
    return this.processedImageRepo.findById(fileId);
  }

  /**
   * Delete uploaded file from S3 and database
   */
  async deleteFile(fileId: string): Promise<void> {
    const processedImage = await this.processedImageRepo.findById(fileId);
    
    if (!processedImage) {
      throw new Error('File not found');
    }

    try {
      // Extract S3 key from URL
      const url = new URL(processedImage.originalUrl);
      const key = url.pathname.substring(1); // Remove leading slash

      // Delete from S3
      await s3.deleteObject({
        Bucket: config.aws.s3Bucket,
        Key: key
      }).promise();

      // Delete from database
      await this.processedImageRepo.deleteById(fileId);

    } catch (error) {
      throw new Error(`Failed to delete file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate presigned URL for direct upload (alternative approach)
   */
  async generatePresignedUrl(
    filename: string,
    contentType: string,
    projectId: string
  ): Promise<{ uploadUrl: string; fileKey: string }> {
    const fileId = uuidv4();
    const key = `projects/${projectId}/images/${fileId}-${filename}`;

    const uploadUrl = s3.getSignedUrl('putObject', {
      Bucket: config.aws.s3Bucket,
      Key: key,
      ContentType: contentType,
      Expires: 300, // 5 minutes
      Metadata: {
        originalName: filename,
        projectId: projectId,
        fileId: fileId
      }
    });

    return {
      uploadUrl,
      fileKey: key
    };
  }

  /**
   * Utility function to chunk array for parallel processing
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }
}