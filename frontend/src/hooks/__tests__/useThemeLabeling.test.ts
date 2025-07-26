import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useThemeLabeling } from '../useThemeLabeling';
import { clusteringService } from '../../services/clusteringService';

// Mock the clustering service
vi.mock('../../services/clusteringService', () => ({
  clusteringService: {
    generateThemeLabels: vi.fn(),
    validateLabelUniqueness: vi.fn(),
    updateClusterLabel: vi.fn(),
    getClusterLabelHistory: vi.fn()
  }
}));

describe('useThemeLabeling', () => {
  const mockProjectId = 'project-123';
  const mockOnError = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateThemeLabels', () => {
    it('should generate theme labels successfully', async () => {
      const mockSuggestions = [
        {
          clusterId: 'cluster-1',
          suggestedLabel: 'Meeting Planning',
          confidence: 0.9
        }
      ];

      (clusteringService.generateThemeLabels as any).mockResolvedValue(mockSuggestions);

      const { result } = renderHook(() => 
        useThemeLabeling({ projectId: mockProjectId, onError: mockOnError })
      );

      let suggestions: any;
      await act(async () => {
        suggestions = await result.current.generateThemeLabels();
      });

      expect(suggestions).toEqual(mockSuggestions);
      expect(clusteringService.generateThemeLabels).toHaveBeenCalledWith(mockProjectId, undefined);
      expect(mockOnError).not.toHaveBeenCalled();
    });

    it('should generate theme labels for specific clusters', async () => {
      const mockSuggestions = [
        {
          clusterId: 'cluster-1',
          suggestedLabel: 'Meeting Planning',
          confidence: 0.9
        }
      ];

      (clusteringService.generateThemeLabels as any).mockResolvedValue(mockSuggestions);

      const { result } = renderHook(() => 
        useThemeLabeling({ projectId: mockProjectId, onError: mockOnError })
      );

      await act(async () => {
        await result.current.generateThemeLabels(['cluster-1']);
      });

      expect(clusteringService.generateThemeLabels).toHaveBeenCalledWith(mockProjectId, ['cluster-1']);
    });

    it('should handle generation errors', async () => {
      const mockError = new Error('Generation failed');
      (clusteringService.generateThemeLabels as any).mockRejectedValue(mockError);

      const { result } = renderHook(() => 
        useThemeLabeling({ projectId: mockProjectId, onError: mockOnError })
      );

      await act(async () => {
        try {
          await result.current.generateThemeLabels();
        } catch (error) {
          expect(error).toBe(mockError);
        }
      });

      expect(mockOnError).toHaveBeenCalledWith(mockError);
    });

    it('should manage loading state during generation', async () => {
      let resolvePromise: (value: any) => void;
      const promise = new Promise(resolve => {
        resolvePromise = resolve;
      });

      (clusteringService.generateThemeLabels as any).mockReturnValue(promise);

      const { result } = renderHook(() => 
        useThemeLabeling({ projectId: mockProjectId, onError: mockOnError })
      );

      expect(result.current.isGeneratingLabels).toBe(false);

      act(() => {
        result.current.generateThemeLabels();
      });

      expect(result.current.isGeneratingLabels).toBe(true);

      await act(async () => {
        resolvePromise([]);
        await promise;
      });

      expect(result.current.isGeneratingLabels).toBe(false);
    });
  });

  describe('validateLabelUniqueness', () => {
    it('should validate label uniqueness successfully', async () => {
      const mockValidation = {
        isUnique: true
      };

      (clusteringService.validateLabelUniqueness as any).mockResolvedValue(mockValidation);

      const { result } = renderHook(() => 
        useThemeLabeling({ projectId: mockProjectId, onError: mockOnError })
      );

      let validation: any;
      await act(async () => {
        validation = await result.current.validateLabelUniqueness('New Label');
      });

      expect(validation).toEqual(mockValidation);
      expect(clusteringService.validateLabelUniqueness).toHaveBeenCalledWith(
        mockProjectId,
        'New Label',
        undefined
      );
    });

    it('should validate with exclude cluster ID', async () => {
      const mockValidation = {
        isUnique: true
      };

      (clusteringService.validateLabelUniqueness as any).mockResolvedValue(mockValidation);

      const { result } = renderHook(() => 
        useThemeLabeling({ projectId: mockProjectId, onError: mockOnError })
      );

      await act(async () => {
        await result.current.validateLabelUniqueness('New Label', 'cluster-1');
      });

      expect(clusteringService.validateLabelUniqueness).toHaveBeenCalledWith(
        mockProjectId,
        'New Label',
        'cluster-1'
      );
    });

    it('should handle validation errors', async () => {
      const mockError = new Error('Validation failed');
      (clusteringService.validateLabelUniqueness as any).mockRejectedValue(mockError);

      const { result } = renderHook(() => 
        useThemeLabeling({ projectId: mockProjectId, onError: mockOnError })
      );

      await act(async () => {
        try {
          await result.current.validateLabelUniqueness('New Label');
        } catch (error) {
          expect(error).toBe(mockError);
        }
      });

      expect(mockOnError).toHaveBeenCalledWith(mockError);
    });
  });

  describe('updateClusterLabel', () => {
    it('should update cluster label successfully', async () => {
      const mockUpdatedCluster = {
        id: 'cluster-1',
        label: 'Updated Label',
        textBlocks: ['note-1'],
        confidence: 0.85
      };

      (clusteringService.updateClusterLabel as any).mockResolvedValue(mockUpdatedCluster);

      const { result } = renderHook(() => 
        useThemeLabeling({ projectId: mockProjectId, onError: mockOnError })
      );

      let updatedCluster: any;
      await act(async () => {
        updatedCluster = await result.current.updateClusterLabel('cluster-1', 'Updated Label');
      });

      expect(updatedCluster).toEqual(mockUpdatedCluster);
      expect(clusteringService.updateClusterLabel).toHaveBeenCalledWith('cluster-1', 'Updated Label');
    });

    it('should handle update errors', async () => {
      const mockError = new Error('Update failed');
      (clusteringService.updateClusterLabel as any).mockRejectedValue(mockError);

      const { result } = renderHook(() => 
        useThemeLabeling({ projectId: mockProjectId, onError: mockOnError })
      );

      await act(async () => {
        try {
          await result.current.updateClusterLabel('cluster-1', 'Updated Label');
        } catch (error) {
          expect(error).toBe(mockError);
        }
      });

      expect(mockOnError).toHaveBeenCalledWith(mockError);
    });
  });

  describe('getClusterLabelHistory', () => {
    it('should get cluster label history successfully', async () => {
      const mockHistory = [
        {
          label: 'Current Label',
          changedAt: new Date(),
          isAutoGenerated: false
        }
      ];

      (clusteringService.getClusterLabelHistory as any).mockResolvedValue(mockHistory);

      const { result } = renderHook(() => 
        useThemeLabeling({ projectId: mockProjectId, onError: mockOnError })
      );

      let history: any;
      await act(async () => {
        history = await result.current.getClusterLabelHistory('cluster-1');
      });

      expect(history).toEqual(mockHistory);
      expect(clusteringService.getClusterLabelHistory).toHaveBeenCalledWith('cluster-1');
    });

    it('should handle history retrieval errors', async () => {
      const mockError = new Error('History retrieval failed');
      (clusteringService.getClusterLabelHistory as any).mockRejectedValue(mockError);

      const { result } = renderHook(() => 
        useThemeLabeling({ projectId: mockProjectId, onError: mockOnError })
      );

      await act(async () => {
        try {
          await result.current.getClusterLabelHistory('cluster-1');
        } catch (error) {
          expect(error).toBe(mockError);
        }
      });

      expect(mockOnError).toHaveBeenCalledWith(mockError);
    });
  });
});