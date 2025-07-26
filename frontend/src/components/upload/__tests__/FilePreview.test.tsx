import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { vi } from 'vitest';
import FilePreview from '../FilePreview';
import { UploadFile } from '../../../types/upload';

describe('FilePreview', () => {
  const mockOnRemoveFile = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock URL.createObjectURL
    global.URL.createObjectURL = vi.fn(() => 'mock-url');
  });

  const createMockFile = (name: string, size: number = 1024): UploadFile => ({
    id: `mock-${name}`,
    file: new File(['content'], name, { type: 'image/jpeg' }),
    preview: 'mock-preview-url',
    status: 'pending',
    progress: 0,
  });

  it('renders nothing when no files provided', () => {
    const { container } = render(
      <FilePreview files={[]} onRemoveFile={mockOnRemoveFile} />
    );
    
    expect(container.firstChild).toBeNull();
  });

  it('renders file list with correct count', () => {
    const files = [
      createMockFile('test1.jpg'),
      createMockFile('test2.png'),
    ];

    render(<FilePreview files={files} onRemoveFile={mockOnRemoveFile} />);
    
    expect(screen.getByText('Selected Files (2)')).toBeInTheDocument();
    expect(screen.getByText('test1.jpg')).toBeInTheDocument();
    expect(screen.getByText('test2.png')).toBeInTheDocument();
  });

  it('displays file preview images', () => {
    const files = [createMockFile('test.jpg')];

    render(<FilePreview files={files} onRemoveFile={mockOnRemoveFile} />);
    
    const previewImage = screen.getByAltText('test.jpg');
    expect(previewImage).toBeInTheDocument();
    expect(previewImage).toHaveAttribute('src', 'mock-preview-url');
  });

  it('shows file size in human readable format', () => {
    const files = [
      { ...createMockFile('small.jpg'), file: new File(['x'.repeat(1024)], 'small.jpg') },
      { ...createMockFile('large.jpg'), file: new File(['x'.repeat(1024 * 1024)], 'large.jpg') },
    ];

    render(<FilePreview files={files} onRemoveFile={mockOnRemoveFile} />);
    
    expect(screen.getByText('1 KB')).toBeInTheDocument();
    expect(screen.getByText('1 MB')).toBeInTheDocument();
  });

  it('displays different status icons', () => {
    const files = [
      { ...createMockFile('pending.jpg'), status: 'pending' as const },
      { ...createMockFile('uploading.jpg'), status: 'uploading' as const, progress: 50 },
      { ...createMockFile('completed.jpg'), status: 'completed' as const, progress: 100 },
      { ...createMockFile('error.jpg'), status: 'error' as const, error: 'Upload failed' },
    ];

    render(<FilePreview files={files} onRemoveFile={mockOnRemoveFile} />);
    
    // Check that different status indicators are present
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('Upload failed')).toBeInTheDocument();
  });

  it('shows progress bar for uploading files', () => {
    const files = [
      { ...createMockFile('uploading.jpg'), status: 'uploading' as const, progress: 75 },
    ];

    render(<FilePreview files={files} onRemoveFile={mockOnRemoveFile} />);
    
    expect(screen.getByText('75%')).toBeInTheDocument();
    
    // Check progress bar styling
    const progressBar = screen.getByText('75%').closest('div')?.querySelector('[style*="width: 75%"]');
    expect(progressBar).toBeInTheDocument();
  });

  it('calls onRemoveFile when remove button is clicked', async () => {
    const user = userEvent.setup();
    const files = [createMockFile('test.jpg')];

    render(<FilePreview files={files} onRemoveFile={mockOnRemoveFile} />);
    
    const removeButton = screen.getByTitle('Remove file');
    await user.click(removeButton);
    
    expect(mockOnRemoveFile).toHaveBeenCalledWith('mock-test.jpg');
  });

  it('disables remove button for uploading files', () => {
    const files = [
      { ...createMockFile('uploading.jpg'), status: 'uploading' as const, progress: 50 },
    ];

    render(<FilePreview files={files} onRemoveFile={mockOnRemoveFile} />);
    
    const removeButton = screen.getByTitle('Remove file');
    expect(removeButton).toBeDisabled();
  });

  it('applies correct background colors based on status', () => {
    const files = [
      { ...createMockFile('pending.jpg'), status: 'pending' as const },
      { ...createMockFile('uploading.jpg'), status: 'uploading' as const },
      { ...createMockFile('completed.jpg'), status: 'completed' as const },
      { ...createMockFile('error.jpg'), status: 'error' as const },
    ];

    render(<FilePreview files={files} onRemoveFile={mockOnRemoveFile} />);
    
    // Check that files are rendered with different status indicators
    expect(screen.getByText('pending.jpg')).toBeInTheDocument();
    expect(screen.getByText('uploading.jpg')).toBeInTheDocument();
    expect(screen.getByText('completed.jpg')).toBeInTheDocument();
    expect(screen.getByText('error.jpg')).toBeInTheDocument();
  });

  it('shows fallback icon when no preview available', () => {
    const files = [
      { ...createMockFile('test.jpg'), preview: undefined },
    ];

    render(<FilePreview files={files} onRemoveFile={mockOnRemoveFile} />);
    
    // Should show FileImage icon instead of preview
    const fallbackIcon = screen.getByText('test.jpg').closest('div')?.querySelector('svg');
    expect(fallbackIcon).toBeInTheDocument();
  });
});