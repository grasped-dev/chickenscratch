import { Response } from 'express';
import multer from 'multer';
import { UploadService } from '../services/upload.js';
import { ProjectRepository } from '../models/ProjectRepository.js';
import type { AuthenticatedRequest } from '../types/api.js';
import type { ApiResponse, UploadResponse } from 'chicken-scratch-shared';

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 10 // Maximum 10 files per request
  },
  fileFilter: (req, file, cb) => {
    // Basic file type validation at multer level
    const allowedTypes = ['image/jpeg', 'image/png', 'image/heic'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed`));
    }
  }
});

export class UploadController {
  private uploadService: UploadService;
  private projectRepo: ProjectRepository;

  constructor() {
    this.uploadService = new UploadService();
    this.projectRepo = new ProjectRepository();
  }

  /**
   * Handle multer errors
   */
  private handleMulterError(error: any, res: Response): boolean {
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({
          success: false,
          error: `File size exceeds maximum allowed size of ${10}MB`
        } as ApiResponse);
        return true;
      }
      if (error.code === 'LIMIT_FILE_COUNT') {
        res.status(400).json({
          success: false,
          error: 'Too many files uploaded'
        } as ApiResponse);
        return true;
      }
      if (error.code === 'LIMIT_UNEXPECTED_FILE') {
        res.status(400).json({
          success: false,
          error: 'Unexpected file field'
        } as ApiResponse);
        return true;
      }
    }
    
    if (error.message && error.message.includes('not allowed')) {
      res.status(400).json({
        success: false,
        error: error.message
      } as ApiResponse);
      return true;
    }
    
    return false;
  }

  /**
   * Multer middleware for single file upload with error handling
   */
  uploadSingle = (req: AuthenticatedRequest, res: Response, next: Function) => {
    upload.single('file')(req, res, (error: any) => {
      if (error) {
        if (this.handleMulterError(error, res)) {
          return;
        }
        // If not a handled multer error, pass to next error handler
        return next(error);
      }
      next();
    });
  };

  /**
   * Multer middleware for multiple file upload with error handling
   */
  uploadMultiple = (req: AuthenticatedRequest, res: Response, next: Function) => {
    upload.array('files', 10)(req, res, (error: any) => {
      if (error) {
        if (this.handleMulterError(error, res)) {
          return;
        }
        // If not a handled multer error, pass to next error handler
        return next(error);
      }
      next();
    });
  };

  /**
   * Handle single file upload
   */
  uploadFile = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { projectId } = req.body;
      const file = req.file;

      if (!file) {
        res.status(400).json({
          success: false,
          error: 'No file provided'
        } as ApiResponse);
        return;
      }

      if (!projectId) {
        res.status(400).json({
          success: false,
          error: 'Project ID is required'
        } as ApiResponse);
        return;
      }

      // Verify project exists and user has access
      const project = await this.projectRepo.findById(projectId);
      if (!project || project.userId !== req.user?.id) {
        res.status(404).json({
          success: false,
          error: 'Project not found or access denied'
        } as ApiResponse);
        return;
      }

      // Validate file
      const validation = await this.uploadService.validateFile(file);
      if (!validation.valid) {
        res.status(400).json({
          success: false,
          error: validation.error
        } as ApiResponse);
        return;
      }

      // Upload file
      const result = await this.uploadService.uploadFile(file, projectId, req.user?.id);

      // Update project image count
      await this.projectRepo.updateById(projectId, {
        imageCount: project.imageCount + 1
      });

      const response: UploadResponse = {
        uploadId: result.fileId,
        fileIds: [result.fileId],
        status: 'uploaded'
      };

      res.status(201).json({
        success: true,
        data: response,
        message: 'File uploaded successfully'
      } as ApiResponse<UploadResponse>);

    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Upload failed'
      } as ApiResponse);
    }
  };

  /**
   * Handle multiple file upload
   */
  uploadFiles = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { projectId, projectName } = req.body;
      const files = req.files as Express.Multer.File[];

      if (!files || files.length === 0) {
        res.status(400).json({
          success: false,
          error: 'No files provided'
        } as ApiResponse);
        return;
      }

      let targetProjectId = projectId;

      // Create new project if projectName is provided and no projectId
      if (!targetProjectId && projectName && req.user?.id) {
        const newProject = await this.projectRepo.create({
          userId: req.user.id,
          name: projectName
        });
        targetProjectId = newProject.id;
      }

      if (!targetProjectId) {
        res.status(400).json({
          success: false,
          error: 'Project ID or project name is required'
        } as ApiResponse);
        return;
      }

      // Verify project exists and user has access
      const project = await this.projectRepo.findById(targetProjectId);
      if (!project || project.userId !== req.user?.id) {
        res.status(404).json({
          success: false,
          error: 'Project not found or access denied'
        } as ApiResponse);
        return;
      }

      // Validate all files first
      const validationErrors: string[] = [];
      for (let index = 0; index < files.length; index++) {
        const file = files[index];
        const validation = await this.uploadService.validateFile(file);
        if (!validation.valid) {
          validationErrors.push(`File ${index + 1} (${file.originalname}): ${validation.error}`);
        }
      }

      if (validationErrors.length > 0) {
        res.status(400).json({
          success: false,
          error: 'File validation failed',
          data: validationErrors
        } as ApiResponse);
        return;
      }

      // Upload files
      const results = await this.uploadService.uploadMultipleFiles(files, targetProjectId, req.user?.id);

      // Update project image count
      await this.projectRepo.updateById(targetProjectId, {
        imageCount: project.imageCount + results.length
      });

      const response: UploadResponse = {
        uploadId: targetProjectId,
        fileIds: results.map(r => r.fileId),
        status: 'uploaded'
      };

      res.status(201).json({
        success: true,
        data: response,
        message: `${results.length} files uploaded successfully`
      } as ApiResponse<UploadResponse>);

    } catch (error) {
      console.error('Multiple upload error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Upload failed'
      } as ApiResponse);
    }
  };

  /**
   * Get upload status
   */
  getUploadStatus = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { fileId } = req.params;

      const processedImage = await this.uploadService.getUploadStatus(fileId);
      
      if (!processedImage) {
        res.status(404).json({
          success: false,
          error: 'File not found'
        } as ApiResponse);
        return;
      }

      // Verify user has access to this file through project ownership
      const project = await this.projectRepo.findById(processedImage.projectId);
      if (!project || project.userId !== req.user?.id) {
        res.status(403).json({
          success: false,
          error: 'Access denied'
        } as ApiResponse);
        return;
      }

      res.json({
        success: true,
        data: {
          id: processedImage.id,
          status: processedImage.processingStatus,
          progress: processedImage.processingStatus === 'completed' ? 100 : 
                   processedImage.processingStatus === 'processing' ? 50 : 0,
          message: processedImage.errorMessage
        }
      } as ApiResponse);

    } catch (error) {
      console.error('Get upload status error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get upload status'
      } as ApiResponse);
    }
  };

  /**
   * Delete uploaded file
   */
  deleteFile = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { fileId } = req.params;

      // Get file info to verify ownership
      const processedImage = await this.uploadService.getUploadStatus(fileId);
      
      if (!processedImage) {
        res.status(404).json({
          success: false,
          error: 'File not found'
        } as ApiResponse);
        return;
      }

      // Verify user has access to this file through project ownership
      const project = await this.projectRepo.findById(processedImage.projectId);
      if (!project || project.userId !== req.user?.id) {
        res.status(403).json({
          success: false,
          error: 'Access denied'
        } as ApiResponse);
        return;
      }

      // Delete file
      await this.uploadService.deleteFile(fileId);

      // Update project image count
      await this.projectRepo.updateById(processedImage.projectId, {
        imageCount: Math.max(0, project.imageCount - 1)
      });

      res.json({
        success: true,
        message: 'File deleted successfully'
      } as ApiResponse);

    } catch (error) {
      console.error('Delete file error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete file'
      } as ApiResponse);
    }
  };

  /**
   * Generate presigned URL for direct upload
   */
  generatePresignedUrl = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { filename, contentType, projectId } = req.body;

      if (!filename || !contentType || !projectId) {
        res.status(400).json({
          success: false,
          error: 'Filename, content type, and project ID are required'
        } as ApiResponse);
        return;
      }

      // Verify project exists and user has access
      const project = await this.projectRepo.findById(projectId);
      if (!project || project.userId !== req.user?.id) {
        res.status(404).json({
          success: false,
          error: 'Project not found or access denied'
        } as ApiResponse);
        return;
      }

      const result = await this.uploadService.generatePresignedUrl(
        filename,
        contentType,
        projectId
      );

      res.json({
        success: true,
        data: result,
        message: 'Presigned URL generated successfully'
      } as ApiResponse);

    } catch (error) {
      console.error('Generate presigned URL error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate presigned URL'
      } as ApiResponse);
    }
  };

  /**
   * Get project files
   */
  getProjectFiles = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { projectId } = req.params;

      // Verify project exists and user has access
      const project = await this.projectRepo.findById(projectId);
      if (!project || project.userId !== req.user?.id) {
        res.status(404).json({
          success: false,
          error: 'Project not found or access denied'
        } as ApiResponse);
        return;
      }

      // Get project files from repository
      const processedImageRepo = new (await import('../models/ProcessedImageRepository.js')).ProcessedImageRepository();
      const files = await processedImageRepo.findByProjectId(projectId);

      res.json({
        success: true,
        data: files,
        message: 'Files retrieved successfully'
      } as ApiResponse);

    } catch (error) {
      console.error('Get project files error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get project files'
      } as ApiResponse);
    }
  };
}