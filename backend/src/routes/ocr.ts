import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import * as ocrController from '../controllers/ocr.js';

const router = Router();

// All OCR routes require authentication
router.use(authMiddleware.authenticate);

// Synchronous OCR processing
router.post('/process/sync', ocrController.processImageSync);

// Asynchronous OCR processing
router.post('/process/async', ocrController.processImageAsync);

// Get async processing results
router.get('/jobs/:jobId/results', ocrController.getAsyncResults);

// Check async processing job status
router.get('/jobs/:jobId/status', ocrController.checkJobStatus);

// Process with retry logic
router.post('/process/retry', ocrController.processWithRetry);

// Batch processing
router.post('/process/batch', ocrController.processBatch);

export default router;