import express from 'express';
import { 
  generateSummary,
  getSummary,
  updateThemeImportance,
  generateDigest,
  getSummaryStats,
  regenerateSummary
} from '../controllers/summary.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authMiddleware.authenticate);

// Generate project summary
router.post('/generate', generateSummary);

// Get existing project summary
router.get('/:projectId', getSummary);

// Get summary statistics for a project
router.get('/:projectId/stats', getSummaryStats);

// Update theme importance scores
router.put('/theme-importance', updateThemeImportance);

// Generate summary digest in different formats
router.post('/digest', generateDigest);

// Regenerate summary with new options
router.post('/:projectId/regenerate', regenerateSummary);

export default router;