import express from 'express';
import { clusteringController } from '../controllers/clustering.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authMiddleware);

// Process clustering for a project
router.post('/projects/:projectId/clustering', clusteringController.processClustering);

// Get clusters for a project
router.get('/projects/:projectId/clusters', clusteringController.getProjectClusters);

// Get unclustered notes for a project
router.get('/projects/:projectId/unclustered-notes', clusteringController.getUnclusteredNotes);

// Get cluster statistics for a project
router.get('/projects/:projectId/cluster-stats', clusteringController.getClusterStats);

// Get cluster with its notes
router.get('/clusters/:clusterId', clusteringController.getClusterWithNotes);

// Update cluster label
router.patch('/clusters/:clusterId/label', clusteringController.updateClusterLabel);

// Move notes between clusters
router.post('/notes/move', clusteringController.moveNotesToCluster);

// Delete a cluster
router.delete('/clusters/:clusterId', clusteringController.deleteCluster);

// Generate automatic theme labels
router.post('/projects/:projectId/generate-theme-labels', clusteringController.generateThemeLabels);

// Validate label uniqueness
router.post('/projects/:projectId/validate-label', clusteringController.validateLabelUniqueness);

// Get cluster label history
router.get('/clusters/:clusterId/label-history', clusteringController.getClusterLabelHistory);

export default router;