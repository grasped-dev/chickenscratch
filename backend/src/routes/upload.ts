import { Router } from 'express';
import { UploadController } from '../controllers/upload.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
const uploadController = new UploadController();

// Apply authentication middleware to all upload routes
router.use(authMiddleware.authenticate);

// Single file upload
router.post(
  '/file',
  uploadController.uploadSingle,
  uploadController.uploadFile
);

// Multiple file upload
router.post(
  '/files',
  uploadController.uploadMultiple,
  uploadController.uploadFiles
);

// Get upload status
router.get('/status/:fileId', uploadController.getUploadStatus);

// Delete uploaded file
router.delete('/file/:fileId', uploadController.deleteFile);

// Generate presigned URL for direct upload
router.post('/presigned-url', uploadController.generatePresignedUrl);

// Get project files
router.get('/project/:projectId/files', uploadController.getProjectFiles);

export default router;