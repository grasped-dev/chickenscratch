import { Request, Response } from 'express';
import { ClusteringService } from '../services/clustering.js';
import { NoteRepository } from '../models/NoteRepository.js';
import { ClusterRepository } from '../models/ClusterRepository.js';
import { v4 as uuidv4 } from 'uuid';
import type { ClusteringRequest } from 'chicken-scratch-shared/types/processing';

export const clusteringController = {
  /**
   * Process clustering for a project
   */
  async processClustering(req: Request, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const clusteringRequest: ClusteringRequest = req.body;
      
      // Validate request
      if (!projectId) {
        res.status(400).json({ error: 'Project ID is required' });
        return;
      }
      
      if (!clusteringRequest.textBlocks || clusteringRequest.textBlocks.length === 0) {
        res.status(400).json({ error: 'Text blocks are required for clustering' });
        return;
      }
      
      // Process clustering
      const clusteringService = new ClusteringService();
      const result = await clusteringService.processClustering(projectId, clusteringRequest);
      
      res.status(200).json(result);
    } catch (error) {
      console.error('Error in clustering controller:', error);
      res.status(500).json({ 
        error: 'Failed to process clustering',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  },

  /**
   * Get clusters for a project
   */
  async getProjectClusters(req: Request, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      
      if (!projectId) {
        res.status(400).json({ error: 'Project ID is required' });
        return;
      }
      
      const clusteringService = new ClusteringService();
      const clusters = await clusteringService.getProjectClusters(projectId);
      
      res.status(200).json({ clusters });
    } catch (error) {
      console.error('Error getting project clusters:', error);
      res.status(500).json({ 
        error: 'Failed to get project clusters',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  },

  /**
   * Get cluster with its notes
   */
  async getClusterWithNotes(req: Request, res: Response): Promise<void> {
    try {
      const { clusterId } = req.params;
      
      if (!clusterId) {
        res.status(400).json({ error: 'Cluster ID is required' });
        return;
      }
      
      const clusteringService = new ClusteringService();
      const result = await clusteringService.getClusterWithNotes(clusterId);
      
      if (!result) {
        res.status(404).json({ error: 'Cluster not found' });
        return;
      }
      
      res.status(200).json(result);
    } catch (error) {
      console.error('Error getting cluster with notes:', error);
      res.status(500).json({ 
        error: 'Failed to get cluster with notes',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  },

  /**
   * Update cluster label
   */
  async updateClusterLabel(req: Request, res: Response): Promise<void> {
    try {
      const { clusterId } = req.params;
      const { label } = req.body;
      
      if (!clusterId) {
        res.status(400).json({ error: 'Cluster ID is required' });
        return;
      }
      
      if (!label || typeof label !== 'string') {
        res.status(400).json({ error: 'Valid label is required' });
        return;
      }
      
      const clusteringService = new ClusteringService();
      const updatedCluster = await clusteringService.updateClusterLabel(clusterId, label);
      
      if (!updatedCluster) {
        res.status(404).json({ error: 'Cluster not found' });
        return;
      }
      
      res.status(200).json(updatedCluster);
    } catch (error) {
      console.error('Error updating cluster label:', error);
      res.status(500).json({ 
        error: 'Failed to update cluster label',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  },

  /**
   * Move notes between clusters
   */
  async moveNotesToCluster(req: Request, res: Response): Promise<void> {
    try {
      const { noteIds, targetClusterId } = req.body;
      
      if (!noteIds || !Array.isArray(noteIds) || noteIds.length === 0) {
        res.status(400).json({ error: 'Note IDs are required' });
        return;
      }
      
      const clusteringService = new ClusteringService();
      const success = await clusteringService.moveNotesToCluster(noteIds, targetClusterId);
      
      if (success) {
        res.status(200).json({ success: true });
      } else {
        res.status(500).json({ error: 'Failed to move notes between clusters' });
      }
    } catch (error) {
      console.error('Error moving notes between clusters:', error);
      res.status(500).json({ 
        error: 'Failed to move notes between clusters',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  },

  /**
   * Get unclustered notes for a project
   */
  async getUnclusteredNotes(req: Request, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      
      if (!projectId) {
        res.status(400).json({ error: 'Project ID is required' });
        return;
      }
      
      const noteRepository = new NoteRepository();
      const notes = await noteRepository.findUnclusteredByProject(projectId);
      
      res.status(200).json({ notes });
    } catch (error) {
      console.error('Error getting unclustered notes:', error);
      res.status(500).json({ 
        error: 'Failed to get unclustered notes',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  },

  /**
   * Get cluster statistics for a project
   */
  async getClusterStats(req: Request, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      
      if (!projectId) {
        res.status(400).json({ error: 'Project ID is required' });
        return;
      }
      
      const clusterRepository = new ClusterRepository();
      const stats = await clusterRepository.getProjectClusterStats(projectId);
      
      res.status(200).json(stats);
    } catch (error) {
      console.error('Error getting cluster statistics:', error);
      res.status(500).json({ 
        error: 'Failed to get cluster statistics',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  },

  /**
   * Delete a cluster and unassign its notes
   */
  async deleteCluster(req: Request, res: Response): Promise<void> {
    try {
      const { clusterId } = req.params;
      
      if (!clusterId) {
        res.status(400).json({ error: 'Cluster ID is required' });
        return;
      }
      
      const clusterRepository = new ClusterRepository();
      const success = await clusterRepository.deleteClusterAndUnassignNotes(clusterId);
      
      if (success) {
        res.status(200).json({ success: true });
      } else {
        res.status(404).json({ error: 'Cluster not found' });
      }
    } catch (error) {
      console.error('Error deleting cluster:', error);
      res.status(500).json({ 
        error: 'Failed to delete cluster',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  },

  /**
   * Generate automatic theme labels for clusters
   */
  async generateThemeLabels(req: Request, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const { clusterIds } = req.body;
      
      if (!projectId) {
        res.status(400).json({ error: 'Project ID is required' });
        return;
      }
      
      const clusteringService = new ClusteringService();
      const suggestions = await clusteringService.generateThemeLabels(projectId, clusterIds);
      
      res.status(200).json({ suggestions });
    } catch (error) {
      console.error('Error generating theme labels:', error);
      res.status(500).json({ 
        error: 'Failed to generate theme labels',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  },

  /**
   * Validate label uniqueness
   */
  async validateLabelUniqueness(req: Request, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const { label, excludeClusterId } = req.body;
      
      if (!projectId) {
        res.status(400).json({ error: 'Project ID is required' });
        return;
      }
      
      if (!label || typeof label !== 'string') {
        res.status(400).json({ error: 'Valid label is required' });
        return;
      }
      
      const clusteringService = new ClusteringService();
      const validation = await clusteringService.validateLabelUniqueness(
        projectId, 
        label, 
        excludeClusterId
      );
      
      res.status(200).json(validation);
    } catch (error) {
      console.error('Error validating label uniqueness:', error);
      res.status(500).json({ 
        error: 'Failed to validate label uniqueness',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  },

  /**
   * Get cluster label history
   */
  async getClusterLabelHistory(req: Request, res: Response): Promise<void> {
    try {
      const { clusterId } = req.params;
      
      if (!clusterId) {
        res.status(400).json({ error: 'Cluster ID is required' });
        return;
      }
      
      const clusteringService = new ClusteringService();
      const history = await clusteringService.getClusterLabelHistory(clusterId);
      
      res.status(200).json({ history });
    } catch (error) {
      console.error('Error getting cluster label history:', error);
      res.status(500).json({ 
        error: 'Failed to get cluster label history',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  }
};