import { apiClient } from '../utils/api';
import type { 
  ClusteringRequest, 
  ClusterResult, 
  ClusterData, 
  CleanedText 
} from '../../../shared/src/types/processing';

/**
 * Service for interacting with the clustering API
 */
export const clusteringService = {
  /**
   * Process clustering for a project
   */
  async processClustering(
    projectId: string, 
    request: ClusteringRequest
  ): Promise<ClusterResult> {
    const response = await apiClient.post<ClusterResult>(
      `/clustering/projects/${projectId}/clustering`, 
      request
    );
    return response.data;
  },

  /**
   * Get clusters for a project
   */
  async getProjectClusters(projectId: string): Promise<ClusterData[]> {
    const response = await apiClient.get<{ clusters: ClusterData[] }>(
      `/clustering/projects/${projectId}/clusters`
    );
    return response.data.clusters;
  },

  /**
   * Get cluster with its notes
   */
  async getClusterWithNotes(clusterId: string): Promise<{
    cluster: ClusterData;
    notes: Array<{
      id: string;
      originalText: string;
      cleanedText: string;
      confidence: number;
    }>;
  }> {
    const response = await apiClient.get<{
      cluster: ClusterData;
      notes: Array<{
        id: string;
        originalText: string;
        cleanedText: string;
        confidence: number;
      }>;
    }>(`/clustering/clusters/${clusterId}`);
    return response.data;
  },

  /**
   * Update cluster label
   */
  async updateClusterLabel(clusterId: string, label: string): Promise<ClusterData> {
    const response = await apiClient.patch<ClusterData>(
      `/clustering/clusters/${clusterId}/label`, 
      { label }
    );
    return response.data;
  },

  /**
   * Move notes between clusters
   */
  async moveNotesToCluster(
    noteIds: string[], 
    targetClusterId: string | null
  ): Promise<boolean> {
    const response = await apiClient.post<{ success: boolean }>(
      '/clustering/notes/move', 
      { noteIds, targetClusterId }
    );
    return response.data.success;
  },

  /**
   * Get unclustered notes for a project
   */
  async getUnclusteredNotes(projectId: string): Promise<Array<{
    id: string;
    imageId: string;
    originalText: string;
    cleanedText: string;
    boundingBox: {
      left: number;
      top: number;
      width: number;
      height: number;
    };
    confidence: number;
    createdAt: Date;
    updatedAt: Date;
  }>> {
    const response = await apiClient.get<{ notes: Array<{
      id: string;
      imageId: string;
      originalText: string;
      cleanedText: string;
      boundingBox: {
        left: number;
        top: number;
        width: number;
        height: number;
      };
      confidence: number;
      createdAt: string;
      updatedAt: string;
    }> }>(`/clustering/projects/${projectId}/unclustered-notes`);
    
    return response.data.notes.map(note => ({
      ...note,
      createdAt: new Date(note.createdAt),
      updatedAt: new Date(note.updatedAt)
    }));
  },

  /**
   * Get cluster statistics for a project
   */
  async getClusterStats(projectId: string): Promise<{
    totalClusters: number;
    averageConfidence: number;
    averageNotesPerCluster: number;
    topThemes: Array<{ 
      label: string; 
      noteCount: number; 
      confidence: number 
    }>;
  }> {
    const response = await apiClient.get<{
      totalClusters: number;
      averageConfidence: number;
      averageNotesPerCluster: number;
      topThemes: Array<{ 
        label: string; 
        noteCount: number; 
        confidence: number 
      }>;
    }>(`/clustering/projects/${projectId}/cluster-stats`);
    return response.data;
  },

  /**
   * Delete a cluster
   */
  async deleteCluster(clusterId: string): Promise<boolean> {
    const response = await apiClient.delete<{ success: boolean }>(
      `/clustering/clusters/${clusterId}`
    );
    return response.data.success;
  },

  /**
   * Generate automatic theme labels for clusters
   */
  async generateThemeLabels(
    projectId: string, 
    clusterIds?: string[]
  ): Promise<Array<{ clusterId: string; suggestedLabel: string; confidence: number }>> {
    const response = await apiClient.post<{ 
      suggestions: Array<{ clusterId: string; suggestedLabel: string; confidence: number }> 
    }>(`/clustering/projects/${projectId}/generate-theme-labels`, { clusterIds });
    return response.data.suggestions;
  },

  /**
   * Validate label uniqueness within a project
   */
  async validateLabelUniqueness(
    projectId: string, 
    label: string, 
    excludeClusterId?: string
  ): Promise<{ isUnique: boolean; suggestions?: string[] }> {
    const response = await apiClient.post<{ isUnique: boolean; suggestions?: string[] }>(
      `/clustering/projects/${projectId}/validate-label`, 
      { label, excludeClusterId }
    );
    return response.data;
  },

  /**
   * Get cluster label history
   */
  async getClusterLabelHistory(clusterId: string): Promise<Array<{
    label: string;
    changedAt: Date;
    changedBy?: string;
    isAutoGenerated: boolean;
  }>> {
    const response = await apiClient.get<{ 
      history: Array<{
        label: string;
        changedAt: string;
        changedBy?: string;
        isAutoGenerated: boolean;
      }> 
    }>(`/clustering/clusters/${clusterId}/label-history`);
    
    return response.data.history.map(entry => ({
      ...entry,
      changedAt: new Date(entry.changedAt)
    }));
  }
};