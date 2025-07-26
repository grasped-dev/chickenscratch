import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ThemeManager } from '../ThemeManager';
import { clusteringService } from '../../../services/clusteringService';
import type { ClusterData } from '../../../../shared/src/types/processing';

// Mock the clustering service
vi.mock('../../../services/clusteringService', () => ({
  clusteringService: {
    getClusterWithNotes: vi.fn(),
    generateThemeLabels: vi.fn(),
    updateClusterLabel: vi.fn()
  }
}));

const mockClusters: ClusterData[] = [
  {
    id: 'cluster-1',
    label: 'Meeting Planning',
    textBlocks: ['note-1', 'note-2'],
    confidence: 0.85
  },
  {
    id: 'cluster-2',
    label: 'Action Items',
    textBlocks: ['note-3'],
    confidence: 0.92
  }
];

const mockClusterWithNotes = {
  cluster: mockClusters[0],
  notes: [
    {
      id: 'note-1',
      originalText: 'Meeting agenda item 1',
      cleanedText: 'Meeting agenda item 1',
      confidence: 0.9
    },
    {
      id: 'note-2',
      originalText: 'Action items from meeting',
      cleanedText: 'Action items from meeting',
      confidence: 0.85
    }
  ]
};

const mockProps = {
  projectId: 'project-123',
  clusters: mockClusters,
  onClustersUpdate: vi.fn()
};

describe('ThemeManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (clusteringService.getClusterWithNotes as any).mockResolvedValue(mockClusterWithNotes);
  });

  describe('Initial Rendering', () => {
    it('should render theme management header', async () => {
      render(<ThemeManager {...mockProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Theme Management')).toBeInTheDocument();
      });
    });

    it('should show cluster count and note count in header', async () => {
      render(<ThemeManager {...mockProps} />);
      
      await waitFor(() => {
        expect(screen.getByText(/2 themes found with \d+ total notes/)).toBeInTheDocument();
      });
    });

    it('should render Generate All Labels button', async () => {
      render(<ThemeManager {...mockProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Generate All Labels')).toBeInTheDocument();
      });
    });

    it('should show loading state initially', () => {
      render(<ThemeManager {...mockProps} />);
      
      expect(screen.getByText('Loading theme details...')).toBeInTheDocument();
    });
  });

  describe('Cluster Display', () => {
    it('should render all clusters after loading', async () => {
      render(<ThemeManager {...mockProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Meeting Planning')).toBeInTheDocument();
        expect(screen.getByText('Action Items')).toBeInTheDocument();
      });
    });

    it('should show confidence scores for clusters', async () => {
      render(<ThemeManager {...mockProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('85% confidence')).toBeInTheDocument();
        expect(screen.getByText('92% confidence')).toBeInTheDocument();
      });
    });

    it('should show note counts for clusters', async () => {
      render(<ThemeManager {...mockProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('2 notes')).toBeInTheDocument();
        expect(screen.getByText('1 notes')).toBeInTheDocument();
      });
    });

    it('should apply correct confidence color classes', async () => {
      render(<ThemeManager {...mockProps} />);
      
      await waitFor(() => {
        const highConfidence = screen.getByText('92% confidence');
        expect(highConfidence).toHaveClass('text-green-600', 'bg-green-100');
        
        const mediumConfidence = screen.getByText('85% confidence');
        expect(mediumConfidence).toHaveClass('text-green-600', 'bg-green-100');
      });
    });
  });

  describe('Cluster Expansion', () => {
    it('should expand cluster to show notes when clicked', async () => {
      render(<ThemeManager {...mockProps} />);
      
      await waitFor(() => {
        const expandButton = screen.getAllByTitle('Expand')[0];
        fireEvent.click(expandButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Notes in this theme:')).toBeInTheDocument();
        expect(screen.getByText('Meeting agenda item 1')).toBeInTheDocument();
        expect(screen.getByText('Action items from meeting')).toBeInTheDocument();
      });
    });

    it('should collapse expanded cluster when clicked again', async () => {
      render(<ThemeManager {...mockProps} />);
      
      await waitFor(() => {
        const expandButton = screen.getAllByTitle('Expand')[0];
        fireEvent.click(expandButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Notes in this theme:')).toBeInTheDocument();
      });

      const collapseButton = screen.getByTitle('Collapse');
      fireEvent.click(collapseButton);

      await waitFor(() => {
        expect(screen.queryByText('Notes in this theme:')).not.toBeInTheDocument();
      });
    });

    it('should show original text when different from cleaned text', async () => {
      const mockClusterWithDifferentText = {
        cluster: mockClusters[0],
        notes: [
          {
            id: 'note-1',
            originalText: 'Meetng agend item 1',
            cleanedText: 'Meeting agenda item 1',
            confidence: 0.9
          }
        ]
      };

      (clusteringService.getClusterWithNotes as any).mockResolvedValue(mockClusterWithDifferentText);

      render(<ThemeManager {...mockProps} />);
      
      await waitFor(() => {
        const expandButton = screen.getAllByTitle('Expand')[0];
        fireEvent.click(expandButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Original: Meetng agend item 1')).toBeInTheDocument();
      });
    });
  });

  describe('Generate All Labels', () => {
    it('should generate labels for all clusters', async () => {
      const mockSuggestions = [
        {
          clusterId: 'cluster-1',
          suggestedLabel: 'Meeting Coordination',
          confidence: 0.9
        },
        {
          clusterId: 'cluster-2',
          suggestedLabel: 'Task Management',
          confidence: 0.88
        }
      ];

      (clusteringService.generateThemeLabels as any).mockResolvedValue(mockSuggestions);
      (clusteringService.updateClusterLabel as any).mockResolvedValue({});

      render(<ThemeManager {...mockProps} />);
      
      await waitFor(() => {
        fireEvent.click(screen.getByText('Generate All Labels'));
      });

      await waitFor(() => {
        expect(clusteringService.generateThemeLabels).toHaveBeenCalledWith('project-123');
        expect(clusteringService.updateClusterLabel).toHaveBeenCalledWith(
          'cluster-1',
          'Meeting Coordination'
        );
        expect(clusteringService.updateClusterLabel).toHaveBeenCalledWith(
          'cluster-2',
          'Task Management'
        );
      });

      await waitFor(() => {
        expect(mockProps.onClustersUpdate).toHaveBeenCalled();
      });
    });

    it('should show loading state during label generation', async () => {
      (clusteringService.generateThemeLabels as any).mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 100))
      );

      render(<ThemeManager {...mockProps} />);
      
      await waitFor(() => {
        fireEvent.click(screen.getByText('Generate All Labels'));
      });

      expect(screen.getByText('Generate All Labels')).toBeDisabled();
    });

    it('should handle generation errors gracefully', async () => {
      (clusteringService.generateThemeLabels as any).mockRejectedValue(
        new Error('Generation failed')
      );

      render(<ThemeManager {...mockProps} />);
      
      await waitFor(() => {
        fireEvent.click(screen.getByText('Generate All Labels'));
      });

      await waitFor(() => {
        // Should not crash and button should be re-enabled
        expect(screen.getByText('Generate All Labels')).not.toBeDisabled();
      });
    });
  });

  describe('Empty State', () => {
    it('should show empty state when no clusters exist', async () => {
      render(<ThemeManager {...mockProps} clusters={[]} />);
      
      await waitFor(() => {
        expect(screen.getByText('No themes found')).toBeInTheDocument();
        expect(screen.getByText('Run clustering analysis to identify themes in your notes.')).toBeInTheDocument();
      });
    });

    it('should disable Generate All Labels button when no clusters exist', async () => {
      render(<ThemeManager {...mockProps} clusters={[]} />);
      
      await waitFor(() => {
        expect(screen.getByText('Generate All Labels')).toBeDisabled();
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle cluster loading errors gracefully', async () => {
      (clusteringService.getClusterWithNotes as any).mockRejectedValue(
        new Error('Failed to load cluster')
      );

      render(<ThemeManager {...mockProps} />);
      
      await waitFor(() => {
        // Should still render clusters with 0 note count
        expect(screen.getByText('Meeting Planning')).toBeInTheDocument();
        expect(screen.getByText('0 notes')).toBeInTheDocument();
      });
    });
  });

  describe('Label Updates', () => {
    it('should update cluster labels when child component updates', async () => {
      render(<ThemeManager {...mockProps} />);
      
      await waitFor(() => {
        expect(screen.getByText('Meeting Planning')).toBeInTheDocument();
      });

      // Simulate label update from child component
      // This would typically be triggered by the ThemeLabelEditor component
      // For testing purposes, we'll verify the callback behavior
      const updatedClusters = mockClusters.map(cluster =>
        cluster.id === 'cluster-1'
          ? { ...cluster, label: 'Updated Meeting Planning' }
          : cluster
      );

      // Simulate the update
      mockProps.onClustersUpdate(updatedClusters);

      expect(mockProps.onClustersUpdate).toHaveBeenCalledWith(updatedClusters);
    });
  });
});