import { Router } from 'express';
import { workflowController } from '../controllers/workflow.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// Apply authentication middleware to all routes
router.use(authMiddleware.authenticate);

// Start a new workflow for a project
router.post('/projects/:projectId/workflow', workflowController.startWorkflow.bind(workflowController));

// Get workflow status
router.get('/workflows/:workflowId', workflowController.getWorkflowStatus.bind(workflowController));

// Cancel a workflow
router.delete('/workflows/:workflowId', workflowController.cancelWorkflow.bind(workflowController));

// Restart a failed workflow
router.post('/workflows/:workflowId/restart', workflowController.restartWorkflow.bind(workflowController));

// Get user's workflows
router.get('/workflows', workflowController.getUserWorkflows.bind(workflowController));

// Get project's workflows
router.get('/projects/:projectId/workflows', workflowController.getProjectWorkflows.bind(workflowController));

export default router;