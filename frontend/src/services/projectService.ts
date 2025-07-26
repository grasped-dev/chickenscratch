import { apiClient } from '../utils/api';
import type { Project, ProcessedImage, Note, Cluster } from '../../../shared/src/types/models';
import type { ApiResponse } from '../types/api';

export interface ProjectWithStats extends Project {
  noteCount: number;
  clusterCount: number;
}

export interface ProjectsResponse {
  projects: ProjectWithStats[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ProjectDetailsResponse {
  project: Project;
  images: ProcessedImage[];
  notes: Note[];
  clusters: Cluster[];
}

export interface ProjectStats {
  total: number;
  completed: number;
  processing: number;
  failed: number;
}

export interface GetProjectsParams {
  page?: number;
  limit?: number;
  status?: 'processing' | 'completed' | 'failed';
  search?: string;
}

export interface CreateProjectData {
  name: string;
  description?: string;
}

export interface UpdateProjectData {
  name?: string;
  description?: string;
}

class ProjectService {
  async getProjects(params: GetProjectsParams = {}): Promise<ProjectsResponse> {
    const response = await apiClient.get<ApiResponse<ProjectsResponse>>('/projects', {
      params
    });
    return response.data.data;
  }

  async getProject(id: string): Promise<ProjectDetailsResponse> {
    const response = await apiClient.get<ApiResponse<ProjectDetailsResponse>>(`/projects/${id}`);
    return response.data.data;
  }

  async createProject(data: CreateProjectData): Promise<Project> {
    const response = await apiClient.post<ApiResponse<Project>>('/projects', data);
    return response.data.data;
  }

  async updateProject(id: string, data: UpdateProjectData): Promise<Project> {
    const response = await apiClient.put<ApiResponse<Project>>(`/projects/${id}`, data);
    return response.data.data;
  }

  async deleteProject(id: string): Promise<void> {
    await apiClient.delete(`/projects/${id}`);
  }

  async duplicateProject(id: string): Promise<Project> {
    // Get the original project details
    const originalProject = await this.getProject(id);
    
    // Create a new project with similar data
    const duplicateData: CreateProjectData = {
      name: `${originalProject.project.name} (Copy)`,
      description: originalProject.project.description
    };
    
    return this.createProject(duplicateData);
  }

  async getProjectStats(): Promise<ProjectStats> {
    const response = await apiClient.get<ApiResponse<ProjectStats>>('/projects/stats');
    return response.data.data;
  }
}

export const projectService = new ProjectService();