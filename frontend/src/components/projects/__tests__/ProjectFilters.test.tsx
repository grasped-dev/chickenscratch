import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import ProjectFilters from '../ProjectFilters';

describe('ProjectFilters', () => {
  const mockOnSearchChange = vi.fn();
  const mockOnStatusFilterChange = vi.fn();
  const mockOnSortByChange = vi.fn();

  const defaultProps = {
    searchTerm: '',
    onSearchChange: mockOnSearchChange,
    statusFilter: '',
    onStatusFilterChange: mockOnStatusFilterChange,
    sortBy: 'created_desc',
    onSortByChange: mockOnSortByChange
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all filter controls', () => {
    render(<ProjectFilters {...defaultProps} />);

    expect(screen.getByPlaceholderText('Search projects...')).toBeInTheDocument();
    expect(screen.getByDisplayValue('All Status')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Newest First')).toBeInTheDocument();
  });

  it('displays current search term', () => {
    render(<ProjectFilters {...defaultProps} searchTerm="test search" />);

    const searchInput = screen.getByDisplayValue('test search');
    expect(searchInput).toBeInTheDocument();
  });

  it('calls onSearchChange when search input changes', () => {
    render(<ProjectFilters {...defaultProps} />);

    const searchInput = screen.getByPlaceholderText('Search projects...');
    fireEvent.change(searchInput, { target: { value: 'new search' } });

    expect(mockOnSearchChange).toHaveBeenCalledWith('new search');
  });

  it('displays current status filter', () => {
    render(<ProjectFilters {...defaultProps} statusFilter="completed" />);

    const statusSelect = screen.getByDisplayValue('Completed');
    expect(statusSelect).toBeInTheDocument();
  });

  it('calls onStatusFilterChange when status filter changes', () => {
    render(<ProjectFilters {...defaultProps} />);

    const statusSelect = screen.getByDisplayValue('All Status');
    fireEvent.change(statusSelect, { target: { value: 'processing' } });

    expect(mockOnStatusFilterChange).toHaveBeenCalledWith('processing');
  });

  it('displays current sort option', () => {
    render(<ProjectFilters {...defaultProps} sortBy="name_asc" />);

    const sortSelect = screen.getByDisplayValue('Name A-Z');
    expect(sortSelect).toBeInTheDocument();
  });

  it('calls onSortByChange when sort option changes', () => {
    render(<ProjectFilters {...defaultProps} />);

    const sortSelect = screen.getByDisplayValue('Newest First');
    fireEvent.change(sortSelect, { target: { value: 'updated_desc' } });

    expect(mockOnSortByChange).toHaveBeenCalledWith('updated_desc');
  });

  it('has all status filter options', () => {
    render(<ProjectFilters {...defaultProps} />);

    const statusSelect = screen.getByDisplayValue('All Status');
    const options = Array.from(statusSelect.querySelectorAll('option')).map(
      option => option.textContent
    );

    expect(options).toEqual(['All Status', 'Completed', 'Processing', 'Failed']);
  });

  it('has all sort options', () => {
    render(<ProjectFilters {...defaultProps} />);

    const sortSelect = screen.getByDisplayValue('Newest First');
    const options = Array.from(sortSelect.querySelectorAll('option')).map(
      option => option.textContent
    );

    expect(options).toEqual([
      'Newest First',
      'Oldest First',
      'Recently Updated',
      'Name A-Z',
      'Name Z-A'
    ]);
  });

  it('renders search icon', () => {
    render(<ProjectFilters {...defaultProps} />);

    const searchIcon = screen.getByRole('textbox').parentElement?.querySelector('svg');
    expect(searchIcon).toBeInTheDocument();
  });
});