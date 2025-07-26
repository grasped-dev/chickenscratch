import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { userCache, projectCache, invalidateCacheMiddleware } from '../middleware/cache.js';
import {
  createProject,
  getProjects,
  getProject,
  updateProject,
  deleteProject,
  getProjectStats
} from '../controllers/project.js';

const router = Router();

// Apply authentication middleware to all routes
router.use(authenticateToken);

// Project CRUD operations
router.post('/', invalidateCacheMiddleware(['projects:user']), createProject);
router.get('/', userCache(300), getProjects);
router.get('/stats', userCache(600), getProjectStats);
router.get('/:id', projectCache(600), getProject);
router.put('/:id', invalidateCacheMiddleware(['projects:user', 'project']), updateProject);
router.delete('/:id', invalidateCacheMiddleware(['projects:user', 'project']), deleteProject);

export default router;