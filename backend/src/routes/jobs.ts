import { Router } from 'express';
import { jobController } from '../controllers/jobs.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// All job routes require authentication
router.use(authenticateToken);

// Get job status
router.get('/:jobId', jobController.getJobStatus);

// Cancel a job
router.delete('/:jobId', jobController.cancelJob);

// Get user's jobs
router.get('/user/jobs', jobController.getUserJobs);

// Get project's jobs
router.get('/project/:projectId/jobs', jobController.getProjectJobs);

// Get queue statistics
router.get('/admin/stats', jobController.getQueueStats);

// Get worker statistics
router.get('/admin/worker-stats', jobController.getWorkerStats);

// Pause/resume queue (admin only)
router.post('/admin/queue/:jobType/pause', jobController.pauseQueue);
router.post('/admin/queue/:jobType/resume', jobController.resumeQueue);

// Clean queue (admin only)
router.post('/admin/queue/:jobType/clean', jobController.cleanQueue);

export default router;