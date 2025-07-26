import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock AWS SDK first
const mockS3Upload = vi.fn(() => ({
  promise: vi.fn()
}));

const mockS3DeleteObject = vi.fn(() => ({
  promise: vi.fn()
}));

const mockS3GetSignedUrl = vi.fn();

const mockS3Constructor = vi.fn(() => ({
  upload: mockS3Upload,
  deleteObject: mockS3DeleteObject,
  getSignedUrl: mockS3GetSignedUrl
}));

vi.mock('aws-sdk', () => ({
  default: {
    S3: mockS3Constructor
  }
}));

// Mock ProcessedImageRepository
const mockProcessedImageRepoCreate = vi.fn();
const mockProcessedImageRepoFindById = vi.fn();
const mockProcessedImageRepoDeleteById = vi.fn();

const mockProcessedImageRepoConstructor = vi.fn(() => ({
  create: mockProcessedImageRepoCreate,
  findById: mockProcessedImageRepoFindById,
  deleteById: mockProcessedImageRepoDeleteById
}));

vi.mock('../models/ProcessedImageRepository.js', () => ({
  ProcessedImageRepository: mockProcessedImageRepoConstructor
}));

// Import after mocks
import { UploadService } from '../services/upload.js';

describe('UploadService', () => {
  let uploadService: UploadService;

  beforeEach(() => {
    vi.clearAllMocks();
    
    uploadService = new UploadService();
    
    // Setup default mock implementations
    mockS3Upload().promise.mockResolvedValue({
      Location: 'https://test-bucket.s3.amazonaws.com/test-file.jpg',
      ETag: '"test-etag"',
      Bucket: 'test-bucket',
      Key: 'test-file.jpg'
    });
    
    mockS3DeleteObject().promise.mockResolvedValue({});
    
    mockS3GetSignedUrl.mockReturnValue('https://test-bucket.s3.amazonaws.com/presigned-url');
  });

  describe('validateFile', () => {
    it('should validate a valid file', () => {
      const mockFile = {
        originalname: 'test.jpg',
        mimetype: 'image/jpeg',
        size: 1024 * 1024, // 1MB
        buffer: Buffer.from('fake-image-data')
      } as Express.Multer.File;

      const result = uploadService.validateFile(mockFile);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject file that is too large', () => {
      const mockFile = {
        originalname: 'large.jpg',
        mimetype: 'image/jpeg',
        size: 15 * 1024 * 1024, // 15MB (exceeds 10MB limit)
        buffer: Buffer.from('fake-image-data')
      } as Express.Multer.File;

      const result = uploadService.validateFile(mockFile);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds maximum');
    });

    it('should reject unsupported file type', () => {
      const mockFile = {
        originalname: 'document.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('fake-pdf-data')
      } as Express.Multer.File;

      const result = uploadService.validateFile(mockFile);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('not allowed');
    });

    it('should reject empty file', () => {
      const mockFile = {
        originalname: 'empty.jpg',
        mimetype: 'image/jpeg',
        size: 0,
        buffer: Buffer.alloc(0)
      } as Express.Multer.File;

      const result = uploadService.validateFile(mockFile);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('File is empty');
    });

    it('should accept HEIC files', () => {
      const mockFile = {
        originalname: 'photo.heic',
        mimetype: 'image/heic',
        size: 1024 * 1024,
        buffer: Buffer.from('fake-heic-data')
      } as Express.Multer.File;

      const result = uploadService.validateFile(mockFile);

      expect(result.valid).toBe(true);
    });

    it('should accept PNG files', () => {
      const mockFile = {
        originalname: 'image.png',
        mimetype: 'image/png',
        size: 1024 * 1024,
        buffer: Buffer.from('fake-png-data')
      } as Express.Multer.File;

      const result = uploadService.validateFile(mockFile);

      expect(result.valid).toBe(true);
    });
  });

  describe('uploadFile', () => {
    it('should upload file successfully', async () => {
      const mockFile = {
        originalname: 'test.jpg',
        mimetype: 'image/jpeg',
        size: 1024,
        buffer: Buffer.from('fake-image-data')
      } as Express.Multer.File;

      const mockProcessedImage = {
        id: 'test-id',
        projectId: 'project-id',
        originalUrl: 'https://test-bucket.s3.amazonaws.com/test-file.jpg',
        filename: 'test.jpg',
        fileSize: 1024,
        mimeType: 'image/jpeg'
      };

      mockProcessedImageRepoCreate.mockResolvedValue(mockProcessedImage);

      const result = await uploadService.uploadFile(mockFile, 'project-id');

      expect(result).toEqual({
        fileId: 'test-id',
        originalUrl: 'https://test-bucket.s3.amazonaws.com/test-file.jpg',
        filename: 'test.jpg',
        fileSize: 1024,
        mimeType: 'image/jpeg'
      });

      expect(mockS3Upload().promise).toHaveBeenCalled();
      expect(mockProcessedImageRepoCreate).toHaveBeenCalledWith({
        projectId: 'project-id',
        originalUrl: 'https://test-bucket.s3.amazonaws.com/test-file.jpg',
        filename: 'test.jpg',
        fileSize: 1024,
        mimeType: 'image/jpeg'
      });
    });

    it('should handle S3 upload failure', async () => {
      const mockFile = {
        originalname: 'test.jpg',
        mimetype: 'image/jpeg',
        size: 1024,
        buffer: Buffer.from('fake-image-data')
      } as Express.Multer.File;

      mockS3Upload().promise.mockRejectedValue(new Error('S3 upload failed'));

      await expect(uploadService.uploadFile(mockFile, 'project-id'))
        .rejects.toThrow('Failed to upload file: S3 upload failed');
    });

    it('should call progress callback during upload', async () => {
      const mockFile = {
        originalname: 'test.jpg',
        mimetype: 'image/jpeg',
        size: 1024,
        buffer: Buffer.from('fake-image-data')
      } as Express.Multer.File;

      const mockProcessedImage = {
        id: 'test-id',
        projectId: 'project-id',
        originalUrl: 'https://test-bucket.s3.amazonaws.com/test-file.jpg',
        filename: 'test.jpg',
        fileSize: 1024,
        mimeType: 'image/jpeg'
      };

      mockProcessedImageRepoCreate.mockResolvedValue(mockProcessedImage);

      const progressCallback = vi.fn();
      await uploadService.uploadFile(mockFile, 'project-id', progressCallback);

      expect(progressCallback).toHaveBeenCalledWith({
        fileId: expect.any(String),
        progress: 0,
        status: 'uploading'
      });

      expect(progressCallback).toHaveBeenCalledWith({
        fileId: expect.any(String),
        progress: 100,
        status: 'completed'
      });
    });
  });

  describe('uploadMultipleFiles', () => {
    it('should upload multiple files successfully', async () => {
      const mockFiles = [
        {
          originalname: 'test1.jpg',
          mimetype: 'image/jpeg',
          size: 1024,
          buffer: Buffer.from('fake-image-data-1')
        },
        {
          originalname: 'test2.png',
          mimetype: 'image/png',
          size: 2048,
          buffer: Buffer.from('fake-image-data-2')
        }
      ] as Express.Multer.File[];

      const mockProcessedImages = [
        {
          id: 'test-id-1',
          projectId: 'project-id',
          originalUrl: 'https://test-bucket.s3.amazonaws.com/test-file-1.jpg',
          filename: 'test1.jpg',
          fileSize: 1024,
          mimeType: 'image/jpeg'
        },
        {
          id: 'test-id-2',
          projectId: 'project-id',
          originalUrl: 'https://test-bucket.s3.amazonaws.com/test-file-2.png',
          filename: 'test2.png',
          fileSize: 2048,
          mimeType: 'image/png'
        }
      ];

      mockProcessedImageRepoCreate
        .mockResolvedValueOnce(mockProcessedImages[0])
        .mockResolvedValueOnce(mockProcessedImages[1]);

      const results = await uploadService.uploadMultipleFiles(mockFiles, 'project-id');

      expect(results).toHaveLength(2);
      expect(results[0].fileId).toBe('test-id-1');
      expect(results[1].fileId).toBe('test-id-2');
    });

    it('should handle partial failures gracefully', async () => {
      const mockFiles = [
        {
          originalname: 'test1.jpg',
          mimetype: 'image/jpeg',
          size: 1024,
          buffer: Buffer.from('fake-image-data-1')
        },
        {
          originalname: 'test2.png',
          mimetype: 'image/png',
          size: 2048,
          buffer: Buffer.from('fake-image-data-2')
        }
      ] as Express.Multer.File[];

      const mockProcessedImage = {
        id: 'test-id-1',
        projectId: 'project-id',
        originalUrl: 'https://test-bucket.s3.amazonaws.com/test-file-1.jpg',
        filename: 'test1.jpg',
        fileSize: 1024,
        mimeType: 'image/jpeg'
      };

      mockProcessedImageRepoCreate
        .mockResolvedValueOnce(mockProcessedImage)
        .mockRejectedValueOnce(new Error('Upload failed'));

      const results = await uploadService.uploadMultipleFiles(mockFiles, 'project-id');

      expect(results).toHaveLength(1);
      expect(results[0].fileId).toBe('test-id-1');
    });

    it('should throw error if all uploads fail', async () => {
      const mockFiles = [
        {
          originalname: 'test1.jpg',
          mimetype: 'image/jpeg',
          size: 1024,
          buffer: Buffer.from('fake-image-data-1')
        }
      ] as Express.Multer.File[];

      mockS3Upload().promise.mockRejectedValue(new Error('S3 upload failed'));

      await expect(uploadService.uploadMultipleFiles(mockFiles, 'project-id'))
        .rejects.toThrow('All uploads failed');
    });
  });

  describe('getUploadStatus', () => {
    it('should return upload status', async () => {
      const mockProcessedImage = {
        id: 'test-id',
        projectId: 'project-id',
        processingStatus: 'completed'
      };

      mockProcessedImageRepoFindById.mockResolvedValue(mockProcessedImage);

      const result = await uploadService.getUploadStatus('test-id');

      expect(result).toEqual(mockProcessedImage);
      expect(mockProcessedImageRepoFindById).toHaveBeenCalledWith('test-id');
    });

    it('should return null for non-existent file', async () => {
      mockProcessedImageRepoFindById.mockResolvedValue(null);

      const result = await uploadService.getUploadStatus('non-existent-id');

      expect(result).toBeNull();
    });
  });

  describe('deleteFile', () => {
    it('should delete file successfully', async () => {
      const mockProcessedImage = {
        id: 'test-id',
        originalUrl: 'https://test-bucket.s3.amazonaws.com/projects/project-id/images/test-file.jpg'
      };

      mockProcessedImageRepoFindById.mockResolvedValue(mockProcessedImage);
      mockProcessedImageRepoDeleteById.mockResolvedValue(undefined);

      await uploadService.deleteFile('test-id');

      expect(mockS3DeleteObject().promise).toHaveBeenCalled();
      expect(mockProcessedImageRepoDeleteById).toHaveBeenCalledWith('test-id');
    });

    it('should throw error for non-existent file', async () => {
      mockProcessedImageRepoFindById.mockResolvedValue(null);

      await expect(uploadService.deleteFile('non-existent-id'))
        .rejects.toThrow('File not found');
    });

    it('should handle S3 deletion failure', async () => {
      const mockProcessedImage = {
        id: 'test-id',
        originalUrl: 'https://test-bucket.s3.amazonaws.com/projects/project-id/images/test-file.jpg'
      };

      mockProcessedImageRepoFindById.mockResolvedValue(mockProcessedImage);
      mockS3DeleteObject().promise.mockRejectedValue(new Error('S3 deletion failed'));

      await expect(uploadService.deleteFile('test-id'))
        .rejects.toThrow('Failed to delete file: S3 deletion failed');
    });
  });

  describe('generatePresignedUrl', () => {
    it('should generate presigned URL successfully', async () => {
      const result = await uploadService.generatePresignedUrl(
        'test.jpg',
        'image/jpeg',
        'project-id'
      );

      expect(result).toEqual({
        uploadUrl: 'https://test-bucket.s3.amazonaws.com/presigned-url',
        fileKey: expect.stringContaining('projects/project-id/images/')
      });

      expect(mockS3GetSignedUrl).toHaveBeenCalledWith('putObject', expect.objectContaining({
        Bucket: 'chicken-scratch-uploads',
        ContentType: 'image/jpeg',
        Expires: 300
      }));
    });

    it('should include metadata in presigned URL request', async () => {
      await uploadService.generatePresignedUrl(
        'test.jpg',
        'image/jpeg',
        'project-id'
      );

      expect(mockS3GetSignedUrl).toHaveBeenCalledWith('putObject', expect.objectContaining({
        Metadata: expect.objectContaining({
          originalName: 'test.jpg',
          projectId: 'project-id'
        })
      }));
    });
  });
});