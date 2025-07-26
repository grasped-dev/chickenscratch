import React from 'react';
import { Link } from 'react-router-dom';
import ProjectActionsMenu from './ProjectActionsMenu';
import type { ProjectWithStats } from '../../services/projectService';

interface ProjectCardProps {
  project: ProjectWithStats;
  onEdit: (project: ProjectWithStats) => void;
  onDelete: (project: ProjectWithStats) => void;
  onDuplicate: (project: ProjectWithStats) => void;
}

const ProjectCard: React.FC<ProjectCardProps> = ({
  project,
  onEdit,
  onDelete,
  onDuplicate
}) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'processing':
        return 'bg-yellow-100 text-yellow-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };



  return (
    <div className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow duration-200 border border-gray-200">
      <Link to={`/projects/${project.id}`} className="block p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 truncate">
              {project.name}
            </h3>
            {project.description && (
              <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                {project.description}
              </p>
            )}
          </div>
          <div className="flex items-center space-x-2 ml-4">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(project.status)}`}>
              {project.status}
            </span>
            <ProjectActionsMenu
              project={project}
              onEdit={onEdit}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{project.imageCount}</div>
            <div className="text-xs text-gray-500">Images</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{project.noteCount}</div>
            <div className="text-xs text-gray-500">Notes</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">{project.clusterCount}</div>
            <div className="text-xs text-gray-500">Themes</div>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>Created {formatDate(project.createdAt)}</span>
          {project.updatedAt !== project.createdAt && (
            <span>Updated {formatDate(project.updatedAt)}</span>
          )}
        </div>

        {project.summary && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="text-sm text-gray-600">
              <span className="font-medium">Top themes:</span>
              {project.summary.topThemes?.slice(0, 3).map((theme: any, index: number) => (
                <span key={index} className="ml-1">
                  {theme.label}
                  {index < Math.min(2, project.summary!.topThemes!.length - 1) && ','}
                </span>
              ))}
            </div>
          </div>
        )}
      </Link>
    </div>
  );
};

export default ProjectCard;