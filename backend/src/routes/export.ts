import { Router } from 'express';
import { ExportController } from '../controllers/export.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// All export routes require authentication
router.use(authenticateToken);

/**
 * @route GET /api/export/options
 * @desc Get available export options and templates
 * @access Private
 */
router.get('/options', ExportController.getExportOptions);

/**
 * @route POST /api/export/:projectId/preview
 * @desc Preview export before generation
 * @access Private
 */
router.post('/:projectId/preview', ExportController.previewExport);

/**
 * @route POST /api/export/:projectId/pdf
 * @desc Generate PDF export for a project
 * @access Private
 */
router.post('/:projectId/pdf', ExportController.generatePDF);

/**
 * @route POST /api/export/:projectId/pdf/advanced
 * @desc Generate advanced PDF export using Puppeteer
 * @access Private
 */
router.post('/:projectId/pdf/advanced', ExportController.generateAdvancedPDF);

/**
 * @route POST /api/export/:projectId/csv
 * @desc Generate CSV export for a project
 * @access Private
 */
router.post('/:projectId/csv', ExportController.generateCSV);

export default router;