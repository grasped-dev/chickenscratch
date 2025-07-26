import { useState, useCallback } from 'react';
import { clusteringService } from '../services/clusteringService';
import type { ClusterData } from '../../../shared/src/types/processing';

interface UseThemeLabelingOptions {
  projectId: string;
  onError?: (error: Error) => void;
}

interface ThemeLabelSuggestion {
  clusterId: string;
  suggestedLabel: string;
  confidence: number;
}

interface LabelValidation {
  isUnique: boolean;
  suggestions?: string[];
}

export const useThemeLabeling = ({ projectId, onError }: UseThemeLabelingOptions) => {
  const [isGeneratingLabels, setIsGeneratingLabels] = useState(false);
  const [isValidatingLabel, setIsValidatingLabel] = useState(false);
  const [isUpdatingLabel, setIsUpdatingLabel] = useState(false);

  const generateThemeLabels = useCallback(async (
    clusterIds?: string[]
  ): Promise<ThemeLabelSuggestion[]> => {
    setIsGeneratingLabels(true);
    try {
      const suggestions = await clusteringService.generateThemeLabels(projectId, clusterIds);
      return suggestions;
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Failed to generate theme labels');
      onError?.(err);
      throw err;
    } finally {
      setIsGeneratingLabels(false);
    }
  }, [projectId, onError]);

  const validateLabelUniqueness = useCallback(async (
    label: string,
    excludeClusterId?: string
  ): Promise<LabelValidation> => {
    setIsValidatingLabel(true);
    try {
      const validation = await clusteringService.validateLabelUniqueness(
        projectId,
        label,
        excludeClusterId
      );
      return validation;
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Failed to validate label');
      onError?.(err);
      throw err;
    } finally {
      setIsValidatingLabel(false);
    }
  }, [projectId, onError]);

  const updateClusterLabel = useCallback(async (
    clusterId: string,
    label: string
  ): Promise<ClusterData> => {
    setIsUpdatingLabel(true);
    try {
      const updatedCluster = await clusteringService.updateClusterLabel(clusterId, label);
      return updatedCluster;
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Failed to update cluster label');
      onError?.(err);
      throw err;
    } finally {
      setIsUpdatingLabel(false);
    }
  }, [onError]);

  const getClusterLabelHistory = useCallback(async (clusterId: string) => {
    try {
      const history = await clusteringService.getClusterLabelHistory(clusterId);
      return history;
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Failed to get label history');
      onError?.(err);
      throw err;
    }
  }, [onError]);

  return {
    // Actions
    generateThemeLabels,
    validateLabelUniqueness,
    updateClusterLabel,
    getClusterLabelHistory,
    
    // Loading states
    isGeneratingLabels,
    isValidatingLabel,
    isUpdatingLabel
  };
};