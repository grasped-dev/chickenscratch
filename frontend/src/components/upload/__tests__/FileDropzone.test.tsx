import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { vi } from 'vitest';
import FileDropzone from '../FileDropzone';

// Mock react-dropzone
vi.mock('react-dropzone', () => ({
  useDropzone: vi.fn(),
}));

describe('FileDropzone', () => {
  const mockOnFilesSelected = vi.fn();
  const mockOpen = vi.fn();
  
  beforeEach(async () => {
    vi.clearAllMocks();
    const { useDropzone } = await import('react-dropzone');
    vi.mocked(useDropzone).mockReturnValue({
      getRootProps: () => ({ 'data-testid': 'dropzone' }),
      getInputProps: () => ({ 'data-testid': 'file-input' }),
      isDragActive: false,
      open: mockOpen,
    });
  });

  const defaultProps = {
    onFilesSelected: mockOnFilesSelected,
    maxFiles: 5,
    maxFileSize: 5 * 1024 * 1024,
    acceptedFileTypes: ['image/jpeg', 'image/png'],
  };

  it('renders dropzone with default content', () => {
    render(<FileDropzone {...defaultProps} />);
    
    expect(screen.getByText('Upload your images')).toBeInTheDocument();
    expect(screen.getByText('Drag and drop files here, or click to select')).toBeInTheDocument();
    expect(screen.getByText('Choose Files')).toBeInTheDocument();
  });

  it('shows drag active state', async () => {
    const { useDropzone } = await import('react-dropzone');
    vi.mocked(useDropzone).mockReturnValue({
      getRootProps: () => ({ 'data-testid': 'dropzone' }),
      getInputProps: () => ({ 'data-testid': 'file-input' }),
      isDragActive: true,
      open: mockOpen,
    });

    render(<FileDropzone {...defaultProps} />);
    
    expect(screen.getByText('Drop files here')).toBeInTheDocument();
  });

  it('displays file size and count limits', () => {
    render(<FileDropzone {...defaultProps} />);
    
    expect(screen.getByText(/Max 5MB per file • Up to 5 files/)).toBeInTheDocument();
  });

  it('disables dropzone when disabled prop is true', () => {
    render(<FileDropzone {...defaultProps} disabled={true} />);
    
    const dropzone = screen.getByTestId('dropzone');
    expect(dropzone).toHaveClass('opacity-50', 'cursor-not-allowed');
  });

  it('handles choose files button click', async () => {
    const user = userEvent.setup();
    
    render(<FileDropzone {...defaultProps} />);
    
    const chooseButton = screen.getByText('Choose Files');
    await user.click(chooseButton);
    
    expect(mockOpen).toHaveBeenCalled();
  });
});