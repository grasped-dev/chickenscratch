import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ThemeLabelEditor } from '../ThemeLabelEditor';
import { clusteringService } from '../../../services/clusteringService';
import type { ClusterData } from '../../../../shared/src/types/processing';

// Mock the clustering service
vi.mock('../../../services/clusteringService', () => ({
  clusteringService: {
    updateClusterLabel: vi.fn(),
    validateLabelUniqueness: vi.fn(),
    generateThemeLabels: vi.fn()
  }
}));

const mockCluster: ClusterData = {
  id: 'cluster-1',
  label: 'Original Label',
  textBlocks: ['note-1', 'note-2'],
  confidence: 0.85
};

const mockProps = {
  cluster: mockCluster,
  projectId: 'project-123',
  onLabelUpdate: vi.fn(),
  onCancel: vi.fn()
};

describe('ThemeLabelEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Display Mode', () => {
    it('should render cluster label in display mode', () => {
      render(<ThemeLabelEditor {...mockProps} isEditing={false} />);
      
      expect(screen.getByText('Original Label')).toBeInTheDocument();
      expect(screen.getByTitle('Edit label')).toBeInTheDocument();
    });

    it('should call onCancel when edit button is clicked', () => {
      render(<ThemeLabelEditor {...mockProps} isEditing={false} />);
      
      fireEvent.click(screen.getByTitle('Edit label'));
      expect(mockProps.onCancel).toHaveBeenCalled();
    });
  });

  describe('Edit Mode', () => {
    beforeEach(() => {
      (clusteringService.validateLabelUniqueness as any).mockResolvedValue({
        isUnique: true
      });
    });

    it('should render input field in edit mode', () => {
      render(<ThemeLabelEditor {...mockProps} isEditing={true} />);
      
      const input = screen.getByDisplayValue('Original Label');
      expect(input).toBeInTheDocument();
      expect(input).toHaveFocus();
    });

    it('should show Save and Cancel buttons in edit mode', () => {
      render(<ThemeLabelEditor {...mockProps} isEditing={true} />);
      
      expect(screen.getByText('Save')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    it('should validate label uniqueness on input change', async () => {
      render(<ThemeLabelEditor {...mockProps} isEditing={true} />);
      
      const input = screen.getByDisplayValue('Original Label');
      fireEvent.change(input, { target: { value: 'New Label' } });

      await waitFor(() => {
        expect(clusteringService.validateLabelUniqueness).toHaveBeenCalledWith(
          'project-123',
          'New Label',
          'cluster-1'
        );
      });
    });

    it('should show error message for duplicate labels', async () => {
      (clusteringService.validateLabelUniqueness as any).mockResolvedValue({
        isUnique: false,
        suggestions: ['New Label 2', 'Alternative Label']
      });

      render(<ThemeLabelEditor {...mockProps} isEditing={true} />);
      
      const input = screen.getByDisplayValue('Original Label');
      fireEvent.change(input, { target: { value: 'Duplicate Label' } });

      await waitFor(() => {
        expect(screen.getByText('This label already exists in the project')).toBeInTheDocument();
      });
    });

    it('should show suggestions for duplicate labels', async () => {
      (clusteringService.validateLabelUniqueness as any).mockResolvedValue({
        isUnique: false,
        suggestions: ['New Label 2', 'Alternative Label']
      });

      render(<ThemeLabelEditor {...mockProps} isEditing={true} />);
      
      const input = screen.getByDisplayValue('Original Label');
      fireEvent.change(input, { target: { value: 'Duplicate Label' } });

      await waitFor(() => {
        expect(screen.getByText('Suggested alternatives:')).toBeInTheDocument();
        expect(screen.getByText('New Label 2')).toBeInTheDocument();
        expect(screen.getByText('Alternative Label')).toBeInTheDocument();
      });
    });

    it('should apply suggestion when clicked', async () => {
      (clusteringService.validateLabelUniqueness as any)
        .mockResolvedValueOnce({
          isUnique: false,
          suggestions: ['Suggested Label']
        })
        .mockResolvedValueOnce({
          isUnique: true
        });

      render(<ThemeLabelEditor {...mockProps} isEditing={true} />);
      
      const input = screen.getByDisplayValue('Original Label');
      fireEvent.change(input, { target: { value: 'Duplicate Label' } });

      await waitFor(() => {
        expect(screen.getByText('Suggested Label')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Suggested Label'));

      expect(input).toHaveValue('Suggested Label');
    });

    it('should save label when Save button is clicked', async () => {
      (clusteringService.updateClusterLabel as any).mockResolvedValue({});

      render(<ThemeLabelEditor {...mockProps} isEditing={true} />);
      
      const input = screen.getByDisplayValue('Original Label');
      fireEvent.change(input, { target: { value: 'Updated Label' } });

      await waitFor(() => {
        const saveButton = screen.getByText('Save');
        expect(saveButton).not.toBeDisabled();
      });

      fireEvent.click(screen.getByText('Save'));

      await waitFor(() => {
        expect(clusteringService.updateClusterLabel).toHaveBeenCalledWith(
          'cluster-1',
          'Updated Label'
        );
        expect(mockProps.onLabelUpdate).toHaveBeenCalledWith(
          'cluster-1',
          'Updated Label'
        );
      });
    });

    it('should cancel editing when Cancel button is clicked', () => {
      render(<ThemeLabelEditor {...mockProps} isEditing={true} />);
      
      const input = screen.getByDisplayValue('Original Label');
      fireEvent.change(input, { target: { value: 'Changed Label' } });
      fireEvent.click(screen.getByText('Cancel'));

      expect(mockProps.onCancel).toHaveBeenCalled();
    });

    it('should save on Enter key press', async () => {
      (clusteringService.updateClusterLabel as any).mockResolvedValue({});

      render(<ThemeLabelEditor {...mockProps} isEditing={true} />);
      
      const input = screen.getByDisplayValue('Original Label');
      fireEvent.change(input, { target: { value: 'Updated Label' } });

      await waitFor(() => {
        // Wait for validation
      });

      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(clusteringService.updateClusterLabel).toHaveBeenCalled();
      });
    });

    it('should cancel on Escape key press', () => {
      render(<ThemeLabelEditor {...mockProps} isEditing={true} />);
      
      const input = screen.getByDisplayValue('Original Label');
      fireEvent.keyDown(input, { key: 'Escape' });

      expect(mockProps.onCancel).toHaveBeenCalled();
    });
  });

  describe('Auto Label Generation', () => {
    it('should generate automatic label when Auto button is clicked', async () => {
      (clusteringService.generateThemeLabels as any).mockResolvedValue([
        {
          clusterId: 'cluster-1',
          suggestedLabel: 'Auto Generated Label',
          confidence: 0.9
        }
      ]);

      (clusteringService.validateLabelUniqueness as any).mockResolvedValue({
        isUnique: true
      });

      render(<ThemeLabelEditor {...mockProps} isEditing={true} />);
      
      fireEvent.click(screen.getByText('Auto'));

      await waitFor(() => {
        expect(clusteringService.generateThemeLabels).toHaveBeenCalledWith(
          'project-123',
          ['cluster-1']
        );
      });

      await waitFor(() => {
        const input = screen.getByDisplayValue('Auto Generated Label');
        expect(input).toBeInTheDocument();
      });
    });

    it('should show loading state during auto generation', async () => {
      (clusteringService.generateThemeLabels as any).mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 100))
      );

      render(<ThemeLabelEditor {...mockProps} isEditing={true} />);
      
      fireEvent.click(screen.getByText('Auto'));

      expect(screen.getByTitle('Generate automatic label')).toBeDisabled();
    });

    it('should handle auto generation errors gracefully', async () => {
      (clusteringService.generateThemeLabels as any).mockRejectedValue(
        new Error('Generation failed')
      );

      render(<ThemeLabelEditor {...mockProps} isEditing={true} />);
      
      fireEvent.click(screen.getByText('Auto'));

      await waitFor(() => {
        // Should not crash and button should be re-enabled
        expect(screen.getByText('Auto')).not.toBeDisabled();
      });
    });
  });

  describe('Validation States', () => {
    it('should disable Save button for empty labels', () => {
      render(<ThemeLabelEditor {...mockProps} isEditing={true} />);
      
      const input = screen.getByDisplayValue('Original Label');
      fireEvent.change(input, { target: { value: '' } });

      expect(screen.getByText('Save')).toBeDisabled();
    });

    it('should disable Save button for duplicate labels', async () => {
      (clusteringService.validateLabelUniqueness as any).mockResolvedValue({
        isUnique: false
      });

      render(<ThemeLabelEditor {...mockProps} isEditing={true} />);
      
      const input = screen.getByDisplayValue('Original Label');
      fireEvent.change(input, { target: { value: 'Duplicate Label' } });

      await waitFor(() => {
        expect(screen.getByText('Save')).toBeDisabled();
      });
    });

    it('should show loading state during save', async () => {
      (clusteringService.updateClusterLabel as any).mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 100))
      );

      render(<ThemeLabelEditor {...mockProps} isEditing={true} />);
      
      fireEvent.click(screen.getByText('Save'));

      expect(screen.getByText('Save')).toBeDisabled();
    });
  });
});