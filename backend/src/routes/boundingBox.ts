import { Router } from 'express';
import { boundingBoxController } from '../controllers/boundingBox';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// Apply authentication middleware to all routes
router.use(authMiddleware);

/**
 * POST /api/bounding-box/detect
 * Automatically detect bounding boxes from OCR results
 */
router.post('/detect', boundingBoxController.detectBoundingBoxes.bind(boundingBoxController));

/**
 * POST /api/bounding-box/manual
 * Handle manual bounding box adjustments (create, update, delete)
 */
router.post('/manual', boundingBoxController.handleManualAdjustment.bind(boundingBoxController));

/**
 * POST /api/bounding-box/update-groupings
 * Update text groupings based on bounding box changes
 */
router.post('/update-groupings', boundingBoxController.updateTextGroupings.bind(boundingBoxController));

/**
 * GET /api/bounding-box/:imageId
 * Get bounding box groups for a specific image
 */
router.get('/:imageId', boundingBoxController.getBoundingBoxGroups.bind(boundingBoxController));

/**
 * POST /api/bounding-box/separate
 * Separate overlapping notes into distinct regions
 */
router.post('/separate', boundingBoxController.separateOverlappingNotes.bind(boundingBoxController));

export default router;