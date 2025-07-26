import { BaseRepository } from './BaseRepository.js';
import type { 
  Project, 
  CreateProjectInput, 
  UpdateProjectInput 
} from 'chicken-scratch-shared/types/models';
import { cacheService } from '../services/cache.js';
import { PerformanceMonitor } from '../utils/performance.js';

export class ProjectRepository extends BaseRepository<Project, CreateProjectInput, UpdateProjectInput> {
  protected tableName = 'projects';
  protected primaryKey = 'id';

  // Find projects by user ID with pagination
  async findByUserId(
    userId: string, 
    options?: { limit?: number; offset?: number; status?: string }
  ): Promise<Project[]> {
    return PerformanceMonitor.measure('ProjectRepository.findByUserId', async () => {
      const cacheKey = `projects:user:${userId}:${JSON.stringify(options || {})}`;
      
      // Try cache first
      const cached = await cacheService.get<Project[]>(cacheKey, { ttl: 300 });
      if (cached) {
        return cached;
      }

      const whereClause: Record<string, any> = { user_id: userId };
      
      if (options?.status) {
        whereClause.status = options.status;
      }

      const result = await this.findAll({
        where: whereClause,
        pagination: {
          limit: options?.limit,
          offset: options?.offset
        },
        sort: { column: 'created_at', direction: 'DESC' }
      });

      // Cache the result
      await cacheService.set(cacheKey, result, { ttl: 300 });
      
      return result;
    });
  }

  // Count projects by user ID
  async countByUserId(userId: string, status?: string): Promise<number> {
    const whereClause: Record<string, any> = { user_id: userId };
    
    if (status) {
      whereClause.status = status;
    }

    return this.count(whereClause);
  }

  // Update project status
  async updateStatus(projectId: string, status: 'processing' | 'completed' | 'failed'): Promise<Project | null> {
    return this.updateById(projectId, { status });
  }

  // Increment image count
  async incrementImageCount(projectId: string): Promise<Project | null> {
    const result = await this.executeQuery(
      `UPDATE ${this.tableName} 
       SET image_count = image_count + 1, updated_at = NOW()
       WHERE id = $1 
       RETURNING *`,
      [projectId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToEntity(result.rows[0]);
  }

  // Get projects with summary statistics
  async getProjectsWithStats(userId: string): Promise<Array<Project & { noteCount: number; clusterCount: number }>> {
    return PerformanceMonitor.measure('ProjectRepository.getProjectsWithStats', async () => {
      const cacheKey = `projects:stats:${userId}`;
      
      // Try cache first
      const cached = await cacheService.get<Array<Project & { noteCount: number; clusterCount: number }>>(cacheKey, { ttl: 600 });
      if (cached) {
        return cached;
      }

      const query = `
        SELECT 
          p.*,
          COALESCE(note_counts.note_count, 0) as note_count,
          COALESCE(cluster_counts.cluster_count, 0) as cluster_count
        FROM projects p
        LEFT JOIN (
          SELECT 
            pi.project_id,
            COUNT(n.id) as note_count
          FROM processed_images pi
          LEFT JOIN notes n ON pi.id = n.image_id
          GROUP BY pi.project_id
        ) note_counts ON p.id = note_counts.project_id
        LEFT JOIN (
          SELECT 
            project_id,
            COUNT(id) as cluster_count
          FROM clusters
          GROUP BY project_id
        ) cluster_counts ON p.id = cluster_counts.project_id
        WHERE p.user_id = $1
        ORDER BY p.created_at DESC
      `;

      const result = await this.executeQuery(query, [userId]);
      
      const projects = result.rows.map(row => ({
        ...this.mapRowToEntity(row),
        noteCount: parseInt(row.note_count) || 0,
        clusterCount: parseInt(row.cluster_count) || 0
      }));

      // Cache the result
      await cacheService.set(cacheKey, projects, { ttl: 600 });
      
      return projects;
    });
  }

  protected mapRowToEntity(row: any): Project {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      description: row.description,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      status: row.status,
      imageCount: row.image_count || 0,
      summary: row.summary
    };
  }

  // Override create to handle snake_case conversion
  async create(data: CreateProjectInput): Promise<Project> {
    const result = await this.executeQuery(
      `INSERT INTO ${this.tableName} (user_id, name, description)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [data.userId, data.name, data.description]
    );

    const project = this.mapRowToEntity(result.rows[0]);

    // Invalidate user's project cache
    await this.invalidateUserCache(data.userId);

    return project;
  }

  // Override updateById to handle snake_case conversion and JSON fields
  async updateById(id: string, data: Partial<UpdateProjectInput>): Promise<Project | null> {
    const updateFields: string[] = [];
    const values: any[] = [id];
    let paramIndex = 2;

    if (data.name !== undefined) {
      updateFields.push(`name = $${paramIndex++}`);
      values.push(data.name);
    }

    if (data.description !== undefined) {
      updateFields.push(`description = $${paramIndex++}`);
      values.push(data.description);
    }

    if (data.status !== undefined) {
      updateFields.push(`status = $${paramIndex++}`);
      values.push(data.status);
    }

    if (data.imageCount !== undefined) {
      updateFields.push(`image_count = $${paramIndex++}`);
      values.push(data.imageCount);
    }

    if (data.summary !== undefined) {
      updateFields.push(`summary = $${paramIndex++}`);
      values.push(JSON.stringify(data.summary));
    }

    if (updateFields.length === 0) {
      return this.findById(id);
    }

    updateFields.push(`updated_at = NOW()`);

    const query = `
      UPDATE ${this.tableName}
      SET ${updateFields.join(', ')}
      WHERE ${this.primaryKey} = $1
      RETURNING *
    `;

    const result = await this.executeQuery(query, values);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const project = this.mapRowToEntity(result.rows[0]);

    // Invalidate caches
    await this.invalidateProjectCache(id);
    await this.invalidateUserCache(project.userId);

    return project;
  }

  // Cache invalidation helpers
  private async invalidateUserCache(userId: string): Promise<void> {
    await cacheService.clearPrefix(`projects:user:${userId}`);
    await cacheService.clearPrefix(`projects:stats:${userId}`);
  }

  private async invalidateProjectCache(projectId: string): Promise<void> {
    await cacheService.clearPrefix(`project:${projectId}`);
  }
}