import { Request, Response } from 'express';
import { ProjectRepository } from '../models/ProjectRepository.js';
import { ProcessedImageRepository } from '../models/ProcessedImageRepository.js';
import { NoteRepository } from '../models/NoteRepository.js';
import { ClusterRepository } from '../models/ClusterRepository.js';
import type { CreateProjectInput, UpdateProjectInput } from 'chicken-scratch-shared/types/models';

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isValidUUID = (uuid: string): boolean => {
  return UUID_REGEX.test(uuid);
};

const projectRepository = new ProjectRepository();
const processedImageRepository = new ProcessedImageRepository();
const noteRepository = new NoteRepository();
const clusterRepository = new ClusterRepository();

// Create a new project
export const createProject = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'Project name is required' });
      return;
    }

    const projectData: CreateProjectInput = {
      userId,
      name: name.trim(),
      description: description?.trim() || undefined
    };

    const project = await projectRepository.create(projectData);
    
    res.status(201).json({
      success: true,
      data: project
    });
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
};

// Get all projects for the authenticated user
export const getProjects = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const { 
      page = '1', 
      limit = '10', 
      status,
      search 
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string) || 10));
    const offset = (pageNum - 1) * limitNum;

    // Get projects with statistics
    let projects = await projectRepository.getProjectsWithStats(userId);

    // Apply filters
    if (status && typeof status === 'string') {
      projects = projects.filter(project => project.status === status);
    }

    if (search && typeof search === 'string') {
      const searchTerm = search.toLowerCase();
      projects = projects.filter(project => 
        project.name.toLowerCase().includes(searchTerm) ||
        (project.description && project.description.toLowerCase().includes(searchTerm))
      );
    }

    // Apply pagination
    const total = projects.length;
    const paginatedProjects = projects.slice(offset, offset + limitNum);

    res.json({
      success: true,
      data: {
        projects: paginatedProjects,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
};

// Get a specific project by ID
export const getProject = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    if (!isValidUUID(id)) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const project = await projectRepository.findById(id);

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    // Verify ownership
    if (project.userId !== userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Get additional project details
    const images = await processedImageRepository.findByProjectId(id);
    const notes = await noteRepository.findByProjectId(id);
    const clusters = await clusterRepository.findByProjectId(id);

    res.json({
      success: true,
      data: {
        project,
        images,
        notes,
        clusters
      }
    });
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({ error: 'Failed to fetch project' });
  }
};

// Update a project
export const updateProject = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    if (!isValidUUID(id)) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const project = await projectRepository.findById(id);

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    // Verify ownership
    if (project.userId !== userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const { name, description } = req.body;
    const updateData: Partial<UpdateProjectInput> = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        res.status(400).json({ error: 'Project name must be a non-empty string' });
        return;
      }
      updateData.name = name.trim();
    }

    if (description !== undefined) {
      updateData.description = typeof description === 'string' ? description.trim() : undefined;
    }

    const updatedProject = await projectRepository.updateById(id, updateData);

    res.json({
      success: true,
      data: updatedProject
    });
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({ error: 'Failed to update project' });
  }
};

// Delete a project
export const deleteProject = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    if (!isValidUUID(id)) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const project = await projectRepository.findById(id);

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    // Verify ownership
    if (project.userId !== userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Delete related data first (cascade delete)
    // Note: In a production system, you might want to implement soft deletes
    // or move this to a background job for better performance
    
    // Get all images for this project
    const images = await processedImageRepository.findByProjectId(id);
    
    // Delete notes for each image
    for (const image of images) {
      await noteRepository.deleteByImageId(image.id);
    }
    
    // Delete images
    await processedImageRepository.deleteByProjectId(id);
    
    // Delete clusters
    await clusterRepository.deleteByProjectId(id);
    
    // Finally delete the project
    await projectRepository.deleteById(id);

    res.json({
      success: true,
      message: 'Project deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
};

// Get project statistics
export const getProjectStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const totalProjects = await projectRepository.countByUserId(userId);
    const completedProjects = await projectRepository.countByUserId(userId, 'completed');
    const processingProjects = await projectRepository.countByUserId(userId, 'processing');
    const failedProjects = await projectRepository.countByUserId(userId, 'failed');

    res.json({
      success: true,
      data: {
        total: totalProjects,
        completed: completedProjects,
        processing: processingProjects,
        failed: failedProjects
      }
    });
  } catch (error) {
    console.error('Error fetching project stats:', error);
    res.status(500).json({ error: 'Failed to fetch project statistics' });
  }
};