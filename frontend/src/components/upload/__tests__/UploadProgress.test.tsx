import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import UploadProgress from '../UploadProgress';

describe('UploadProgress', () => {
  it('renders nothing when no files', () => {
    const { container } = render(
      <UploadProgress
        totalFiles={0}
        completedFiles={0}
        failedFiles={0}
        isUploading={false}
        overallProgress={0}
      />
    );
    
    expect(container.firstChild).toBeNull();
  });

  it('shows uploading status', () => {
    render(
      <UploadProgress
        totalFiles={5}
        completedFiles={2}
        failedFiles={0}
        isUploading={true}
        overallProgress={60}
      />
    );
    
    expect(screen.getByText('Uploading 3 of 5 files...')).toBeInTheDocument();
    expect(screen.getByText('60%')).toBeInTheDocument();
  });

  it('shows completion status', () => {
    render(
      <UploadProgress
        totalFiles={3}
        completedFiles={3}
        failedFiles={0}
        isUploading={false}
        overallProgress={100}
      />
    );
    
    expect(screen.getByText('All 3 files uploaded successfully')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('shows failure status', () => {
    render(
      <UploadProgress
        totalFiles={5}
        completedFiles={3}
        failedFiles={2}
        isUploading={false}
        overallProgress={80}
      />
    );
    
    expect(screen.getByText('3 uploaded, 2 failed')).toBeInTheDocument();
  });

  it('displays progress bars for different states', () => {
    const { rerender } = render(
      <UploadProgress
        totalFiles={3}
        completedFiles={1}
        failedFiles={0}
        isUploading={true}
        overallProgress={33}
      />
    );
    
    // Should show progress percentage
    expect(screen.getByText('33%')).toBeInTheDocument();
    
    // Completed state
    rerender(
      <UploadProgress
        totalFiles={3}
        completedFiles={3}
        failedFiles={0}
        isUploading={false}
        overallProgress={100}
      />
    );
    
    expect(screen.getByText('100%')).toBeInTheDocument();
    
    // Failed state
    rerender(
      <UploadProgress
        totalFiles={3}
        completedFiles={1}
        failedFiles={2}
        isUploading={false}
        overallProgress={33}
      />
    );
    
    expect(screen.getByText('33%')).toBeInTheDocument();
  });

  it('shows file status breakdown', () => {
    render(
      <UploadProgress
        totalFiles={10}
        completedFiles={6}
        failedFiles={2}
        isUploading={false}
        overallProgress={80}
      />
    );
    
    expect(screen.getByText('6 completed')).toBeInTheDocument();
    expect(screen.getByText('2 pending')).toBeInTheDocument();
    expect(screen.getByText('2 failed')).toBeInTheDocument();
  });

  it('shows correct status icons', () => {
    const { rerender } = render(
      <UploadProgress
        totalFiles={3}
        completedFiles={1}
        failedFiles={0}
        isUploading={true}
        overallProgress={33}
      />
    );
    
    // Should show loading spinner when uploading
    expect(screen.getByText('Uploading 2 of 3 files...')).toBeInTheDocument();
    
    // Completed state
    rerender(
      <UploadProgress
        totalFiles={3}
        completedFiles={3}
        failedFiles={0}
        isUploading={false}
        overallProgress={100}
      />
    );
    
    expect(screen.getByText('All 3 files uploaded successfully')).toBeInTheDocument();
    
    // Failed state
    rerender(
      <UploadProgress
        totalFiles={3}
        completedFiles={1}
        failedFiles={2}
        isUploading={false}
        overallProgress={33}
      />
    );
    
    expect(screen.getByText('1 uploaded, 2 failed')).toBeInTheDocument();
  });

  it('calculates pending files correctly', () => {
    render(
      <UploadProgress
        totalFiles={10}
        completedFiles={4}
        failedFiles={2}
        isUploading={false}
        overallProgress={60}
      />
    );
    
    // 10 total - 4 completed - 2 failed = 4 pending
    expect(screen.getByText('4 pending')).toBeInTheDocument();
  });

  it('handles edge case with no pending files', () => {
    render(
      <UploadProgress
        totalFiles={5}
        completedFiles={3}
        failedFiles={2}
        isUploading={false}
        overallProgress={100}
      />
    );
    
    // Should not show pending files when all are either completed or failed
    expect(screen.queryByText(/pending/)).not.toBeInTheDocument();
    expect(screen.getByText('3 completed')).toBeInTheDocument();
    expect(screen.getByText('2 failed')).toBeInTheDocument();
  });
});