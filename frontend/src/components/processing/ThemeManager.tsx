import React, { useState, useEffect } from 'react';
import { clusteringService } from '../../services/clusteringService';
import { ThemeLabelEditor } from './ThemeLabelEditor';
import type { ClusterData } from '../../../shared/src/types/processing';

interface ThemeManagerProps {
  projectId: string;
  clusters: ClusterData[];
  onClustersUpdate: (clusters: ClusterData[]) => void;
}

interface ClusterWithNotes extends ClusterData {
  notes?: Array<{
    id: string;
    originalText: string;
    cleanedText: string;
    confidence: number;
  }>;
  noteCount?: number;
}

export const ThemeManager: React.FC<ThemeManagerProps> = ({
  projectId,
  clusters,
  onClustersUpdate
}) => {
  const [clustersWithDetails, setClustersWithDetails] = useState<ClusterWithNotes[]>([]);
  const [editingClusterId, setEditingClusterId] = useState<string | null>(null);
  const [isGeneratingAllLabels, setIsGeneratingAllLabels] = useState(false);
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadClusterDetails();
  }, [clusters]);

  const loadClusterDetails = async () => {
    setIsLoading(true);
    try {
      const clustersWithNotes = await Promise.all(
        clusters.map(async (cluster) => {
          try {
            const details = await clusteringService.getClusterWithNotes(cluster.id);
            return {
              ...cluster,
              notes: details.notes,
              noteCount: details.notes.length
            };
          } catch (error) {
            console.error(`Error loading details for cluster ${cluster.id}:`, error);
            return {
              ...cluster,
              noteCount: 0
            };
          }
        })
      );
      
      setClustersWithDetails(clustersWithNotes);
    } catch (error) {
      console.error('Error loading cluster details:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLabelUpdate = (clusterId: string, newLabel: string) => {
    // Update local state
    setClustersWithDetails(prev => 
      prev.map(cluster => 
        cluster.id === clusterId 
          ? { ...cluster, label: newLabel }
          : cluster
      )
    );

    // Update parent state
    const updatedClusters = clusters.map(cluster =>
      cluster.id === clusterId
        ? { ...cluster, label: newLabel }
        : cluster
    );
    onClustersUpdate(updatedClusters);

    setEditingClusterId(null);
  };

  const generateAllLabels = async () => {
    setIsGeneratingAllLabels(true);
    try {
      const suggestions = await clusteringService.generateThemeLabels(projectId);
      
      // Apply suggestions to clusters
      const updatedClusters = clustersWithDetails.map(cluster => {
        const suggestion = suggestions.find(s => s.clusterId === cluster.id);
        return suggestion 
          ? { ...cluster, label: suggestion.suggestedLabel }
          : cluster;
      });

      setClustersWithDetails(updatedClusters);
      
      // Update parent state
      const updatedClusterData = updatedClusters.map(({ notes, noteCount, ...cluster }) => cluster);
      onClustersUpdate(updatedClusterData);

      // Update actual cluster labels in backend
      await Promise.all(
        suggestions.map(suggestion =>
          clusteringService.updateClusterLabel(suggestion.clusterId, suggestion.suggestedLabel)
        )
      );
    } catch (error) {
      console.error('Error generating all labels:', error);
    } finally {
      setIsGeneratingAllLabels(false);
    }
  };

  const toggleClusterExpansion = (clusterId: string) => {
    setExpandedClusters(prev => {
      const newSet = new Set(prev);
      if (newSet.has(clusterId)) {
        newSet.delete(clusterId);
      } else {
        newSet.add(clusterId);
      }
      return newSet;
    });
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600 bg-green-100';
    if (confidence >= 0.6) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  const formatConfidence = (confidence: number) => {
    return `${Math.round(confidence * 100)}%`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="flex items-center gap-2 text-gray-600">
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Loading theme details...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with bulk actions */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Theme Management</h2>
          <p className="text-sm text-gray-600 mt-1">
            {clustersWithDetails.length} themes found with {clustersWithDetails.reduce((sum, c) => sum + (c.noteCount || 0), 0)} total notes
          </p>
        </div>
        
        <button
          onClick={generateAllLabels}
          disabled={isGeneratingAllLabels || clustersWithDetails.length === 0}
          className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isGeneratingAllLabels ? (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          )}
          Generate All Labels
        </button>
      </div>

      {/* Clusters list */}
      <div className="space-y-4">
        {clustersWithDetails.map((cluster) => (
          <div
            key={cluster.id}
            className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden"
          >
            <div className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  {editingClusterId === cluster.id ? (
                    <ThemeLabelEditor
                      cluster={cluster}
                      projectId={projectId}
                      onLabelUpdate={handleLabelUpdate}
                      onCancel={() => setEditingClusterId(null)}
                      isEditing={true}
                    />
                  ) : (
                    <div className="flex items-center gap-3">
                      <ThemeLabelEditor
                        cluster={cluster}
                        projectId={projectId}
                        onLabelUpdate={handleLabelUpdate}
                        onCancel={() => setEditingClusterId(cluster.id)}
                        isEditing={false}
                      />
                      
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getConfidenceColor(cluster.confidence)}`}>
                          {formatConfidence(cluster.confidence)} confidence
                        </span>
                        
                        <span className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-full">
                          {cluster.noteCount || 0} notes
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => toggleClusterExpansion(cluster.id)}
                  className="p-1 hover:bg-gray-100 rounded transition-colors"
                  title={expandedClusters.has(cluster.id) ? 'Collapse' : 'Expand'}
                >
                  <svg
                    className={`w-5 h-5 text-gray-500 transition-transform ${
                      expandedClusters.has(cluster.id) ? 'rotate-180' : ''
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>

              {/* Expanded content */}
              {expandedClusters.has(cluster.id) && cluster.notes && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Notes in this theme:</h4>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {cluster.notes.map((note, index) => (
                      <div
                        key={note.id}
                        className="p-3 bg-gray-50 rounded-md border border-gray-100"
                      >
                        <div className="flex items-start justify-between">
                          <p className="text-sm text-gray-800 flex-1">
                            {note.cleanedText}
                          </p>
                          <span className={`ml-2 px-2 py-1 text-xs rounded ${getConfidenceColor(note.confidence)}`}>
                            {formatConfidence(note.confidence)}
                          </span>
                        </div>
                        {note.originalText !== note.cleanedText && (
                          <p className="text-xs text-gray-500 mt-1 italic">
                            Original: {note.originalText}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {clustersWithDetails.length === 0 && (
        <div className="text-center py-8">
          <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No themes found</h3>
          <p className="text-gray-600">
            Run clustering analysis to identify themes in your notes.
          </p>
        </div>
      )}
    </div>
  );
};