import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { vi } from 'vitest';
import CameraCapture from '../CameraCapture';

describe('CameraCapture', () => {
  const mockOnCapture = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const defaultProps = {
    onCapture: mockOnCapture,
    onClose: mockOnClose,
    isOpen: true,
  };

  it('does not render when closed', () => {
    render(<CameraCapture {...defaultProps} isOpen={false} />);
    
    expect(screen.queryByText('Take Photo')).not.toBeInTheDocument();
  });

  it('renders camera interface when open', () => {
    render(<CameraCapture {...defaultProps} />);
    
    expect(screen.getByText('Take Photo')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup();
    render(<CameraCapture {...defaultProps} />);
    
    const closeButtons = screen.getAllByRole('button');
    const closeButton = closeButtons[0]; // First button should be close
    await user.click(closeButton);
    
    expect(mockOnClose).toHaveBeenCalled();
  });
});