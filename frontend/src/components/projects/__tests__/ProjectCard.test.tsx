import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { vi } from 'vitest';
import ProjectCard from '../ProjectCard';
import type { ProjectWithStats } from '../../../services/projectService';

const mockProject: ProjectWithStats = {
  id: '1',
  userId: 'user1',
  name: 'Test Project',
  description: 'Test project description',
  createdAt: new Date('2024-01-01T10:00:00Z'),
  updatedAt: new Date('2024-01-02T10:00:00Z'),
  status: 'completed',
  imageCount: 5,
  noteCount: 10,
  clusterCount: 3,
  summary: {
    topThemes: [
      {
        label: 'Theme 1',
        noteCount: 5,
        percentage: 50,
        keyTerms: ['term1', 'term2'],
        representativeQuote: 'Sample quote'
      },
      {
        label: 'Theme 2',
        noteCount: 3,
        percentage: 30,
        keyTerms: ['term3'],
        representativeQuote: 'Another quote'
      }
    ],
    overallInsights: 'Overall insights',
    distribution: [],
    representativeQuotes: [],
    metadata: {
      totalNotes: 10,
      totalClusters: 3,
      processingTime: 1000,
      generatedAt: new Date()
    }
  }
};

const renderWithRouter = (component: React.ReactElement) => {
  return render(
    <BrowserRouter>
      {component}
    </BrowserRouter>
  );
};

describe('ProjectCard', () => {
  const mockOnEdit = vi.fn();
  const mockOnDelete = vi.fn();
  const mockOnDuplicate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders project information correctly', () => {
    renderWithRouter(
      <ProjectCard
        project={mockProject}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onDuplicate={mockOnDuplicate}
      />
    );

    expect(screen.getByText('Test Project')).toBeInTheDocument();
    expect(screen.getByText('Test project description')).toBeInTheDocument();
    expect(screen.getByText('completed')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument(); // imageCount
    expect(screen.getByText('10')).toBeInTheDocument(); // noteCount
    expect(screen.getByText('3')).toBeInTheDocument(); // clusterCount
  });

  it('displays correct status color for completed project', () => {
    renderWithRouter(
      <ProjectCard
        project={mockProject}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onDuplicate={mockOnDuplicate}
      />
    );

    const statusBadge = screen.getByText('completed');
    expect(statusBadge).toHaveClass('bg-green-100', 'text-green-800');
  });

  it('displays correct status color for processing project', () => {
    const processingProject = { ...mockProject, status: 'processing' as const };
    
    renderWithRouter(
      <ProjectCard
        project={processingProject}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onDuplicate={mockOnDuplicate}
      />
    );

    const statusBadge = screen.getByText('processing');
    expect(statusBadge).toHaveClass('bg-yellow-100', 'text-yellow-800');
  });

  it('displays correct status color for failed project', () => {
    const failedProject = { ...mockProject, status: 'failed' as const };
    
    renderWithRouter(
      <ProjectCard
        project={failedProject}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onDuplicate={mockOnDuplicate}
      />
    );

    const statusBadge = screen.getByText('failed');
    expect(statusBadge).toHaveClass('bg-red-100', 'text-red-800');
  });

  it('formats dates correctly', () => {
    renderWithRouter(
      <ProjectCard
        project={mockProject}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onDuplicate={mockOnDuplicate}
      />
    );

    expect(screen.getByText(/Created Jan 1, 2024/)).toBeInTheDocument();
    expect(screen.getByText(/Updated Jan 2, 2024/)).toBeInTheDocument();
  });

  it('displays top themes when summary is available', () => {
    renderWithRouter(
      <ProjectCard
        project={mockProject}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onDuplicate={mockOnDuplicate}
      />
    );

    expect(screen.getByText('Top themes:')).toBeInTheDocument();
    expect(screen.getByText(/Theme 1/)).toBeInTheDocument();
    expect(screen.getByText(/Theme 2/)).toBeInTheDocument();
  });

  it('does not display themes section when summary is not available', () => {
    const projectWithoutSummary = { ...mockProject, summary: undefined };
    
    renderWithRouter(
      <ProjectCard
        project={projectWithoutSummary}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onDuplicate={mockOnDuplicate}
      />
    );

    expect(screen.queryByText('Top themes:')).not.toBeInTheDocument();
  });

  it('does not show updated date when it equals created date', () => {
    const projectSameDate = {
      ...mockProject,
      updatedAt: mockProject.createdAt
    };
    
    renderWithRouter(
      <ProjectCard
        project={projectSameDate}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onDuplicate={mockOnDuplicate}
      />
    );

    expect(screen.getByText(/Created Jan 1, 2024/)).toBeInTheDocument();
    expect(screen.queryByText(/Updated/)).not.toBeInTheDocument();
  });

  it('renders without description', () => {
    const projectWithoutDescription = { ...mockProject, description: undefined };
    
    renderWithRouter(
      <ProjectCard
        project={projectWithoutDescription}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onDuplicate={mockOnDuplicate}
      />
    );

    expect(screen.getByText('Test Project')).toBeInTheDocument();
    expect(screen.queryByText('Test project description')).not.toBeInTheDocument();
  });

  it('creates correct link to project detail page', () => {
    renderWithRouter(
      <ProjectCard
        project={mockProject}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onDuplicate={mockOnDuplicate}
      />
    );

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/projects/1');
  });
});