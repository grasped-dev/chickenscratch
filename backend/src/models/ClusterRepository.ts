import { BaseRepository } from './BaseRepository.js';
import type { 
  Cluster, 
  CreateClusterInput, 
  UpdateClusterInput 
} from 'chicken-scratch-shared/types/models';

export class ClusterRepository extends BaseRepository<Cluster, CreateClusterInput, UpdateClusterInput> {
  protected tableName = 'clusters';
  protected primaryKey = 'id';

  // Find clusters by project ID
  async findByProjectId(projectId: string): Promise<Cluster[]> {
    return this.findAll({
      where: { project_id: projectId },
      sort: { column: 'confidence', direction: 'DESC' }
    });
  }

  // Get clusters with note counts
  async getClustersWithNoteCounts(projectId: string): Promise<Array<Cluster & { noteCount: number }>> {
    const query = `
      SELECT 
        c.*,
        COALESCE(note_counts.note_count, 0) as note_count
      FROM clusters c
      LEFT JOIN (
        SELECT 
          cluster_id,
          COUNT(id) as note_count
        FROM notes
        WHERE cluster_id IS NOT NULL
        GROUP BY cluster_id
      ) note_counts ON c.id = note_counts.cluster_id
      WHERE c.project_id = $1
      ORDER BY c.confidence DESC
    `;

    const result = await this.executeQuery(query, [projectId]);
    
    return result.rows.map(row => ({
      ...this.mapRowToEntity(row),
      noteCount: parseInt(row.note_count) || 0
    }));
  }

  // Get cluster with its notes
  async getClusterWithNotes(clusterId: string): Promise<{
    cluster: Cluster;
    notes: Array<{
      id: string;
      originalText: string;
      cleanedText: string;
      confidence: number;
    }>;
  } | null> {
    const query = `
      SELECT 
        c.*,
        json_agg(
          json_build_object(
            'id', n.id,
            'originalText', n.original_text,
            'cleanedText', n.cleaned_text,
            'confidence', n.confidence
          ) ORDER BY n.confidence DESC
        ) FILTER (WHERE n.id IS NOT NULL) as notes
      FROM clusters c
      LEFT JOIN notes n ON c.id = n.cluster_id
      WHERE c.id = $1
      GROUP BY c.id
    `;

    const result = await this.executeQuery(query, [clusterId]);
    
    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      cluster: this.mapRowToEntity(row),
      notes: row.notes || []
    };
  }

  // Update cluster label
  async updateLabel(clusterId: string, label: string): Promise<Cluster | null> {
    return this.updateById(clusterId, { label });
  }

  // Add text blocks to cluster
  async addTextBlocks(clusterId: string, textBlockIds: string[]): Promise<Cluster | null> {
    const cluster = await this.findById(clusterId);
    if (!cluster) {
      return null;
    }

    const updatedTextBlocks = [...cluster.textBlocks, ...textBlockIds];
    return this.updateById(clusterId, { textBlocks: updatedTextBlocks });
  }

  // Remove text blocks from cluster
  async removeTextBlocks(clusterId: string, textBlockIds: string[]): Promise<Cluster | null> {
    const cluster = await this.findById(clusterId);
    if (!cluster) {
      return null;
    }

    const updatedTextBlocks = cluster.textBlocks.filter(id => !textBlockIds.includes(id));
    return this.updateById(clusterId, { textBlocks: updatedTextBlocks });
  }

  // Get cluster statistics for a project
  async getProjectClusterStats(projectId: string): Promise<{
    totalClusters: number;
    averageConfidence: number;
    averageNotesPerCluster: number;
    topThemes: Array<{ label: string; noteCount: number; confidence: number }>;
  }> {
    const query = `
      SELECT 
        COUNT(c.id) as total_clusters,
        AVG(c.confidence) as average_confidence,
        AVG(note_counts.note_count) as average_notes_per_cluster,
        json_agg(
          json_build_object(
            'label', c.label,
            'noteCount', COALESCE(note_counts.note_count, 0),
            'confidence', c.confidence
          ) ORDER BY COALESCE(note_counts.note_count, 0) DESC
        ) as themes
      FROM clusters c
      LEFT JOIN (
        SELECT 
          cluster_id,
          COUNT(id) as note_count
        FROM notes
        WHERE cluster_id IS NOT NULL
        GROUP BY cluster_id
      ) note_counts ON c.id = note_counts.cluster_id
      WHERE c.project_id = $1
    `;

    const result = await this.executeQuery(query, [projectId]);
    const row = result.rows[0];

    return {
      totalClusters: parseInt(row.total_clusters) || 0,
      averageConfidence: parseFloat(row.average_confidence) || 0,
      averageNotesPerCluster: parseFloat(row.average_notes_per_cluster) || 0,
      topThemes: row.themes || []
    };
  }

  // Delete cluster and unassign its notes
  async deleteClusterAndUnassignNotes(clusterId: string): Promise<boolean> {
    return this.executeInTransaction(async (client) => {
      // First, unassign all notes from this cluster
      await client.query(
        'UPDATE notes SET cluster_id = NULL, updated_at = NOW() WHERE cluster_id = $1',
        [clusterId]
      );

      // Then delete the cluster
      const result = await client.query(
        'DELETE FROM clusters WHERE id = $1',
        [clusterId]
      );

      return result.rowCount > 0;
    });
  }

  protected mapRowToEntity(row: any): Cluster {
    return {
      id: row.id,
      projectId: row.project_id,
      label: row.label,
      textBlocks: row.text_blocks || [],
      centroid: row.centroid ? JSON.parse(row.centroid) : undefined,
      confidence: parseFloat(row.confidence),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  // Delete clusters by project ID
  async deleteByProjectId(projectId: string): Promise<boolean> {
    const result = await this.executeQuery(
      `DELETE FROM ${this.tableName} WHERE project_id = $1`,
      [projectId]
    );
    return result.rowCount > 0;
  }

  // Override create to handle snake_case conversion
  async create(data: CreateClusterInput): Promise<Cluster> {
    const result = await this.executeQuery(
      `INSERT INTO ${this.tableName} (project_id, label, text_blocks, centroid, confidence)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        data.projectId,
        data.label,
        JSON.stringify(data.textBlocks),
        data.centroid ? `[${data.centroid.join(',')}]` : null,
        data.confidence
      ]
    );

    return this.mapRowToEntity(result.rows[0]);
  }

  // Override updateById to handle snake_case conversion
  async updateById(id: string, data: Partial<UpdateClusterInput>): Promise<Cluster | null> {
    const updateFields: string[] = [];
    const values: any[] = [id];
    let paramIndex = 2;

    if (data.label !== undefined) {
      updateFields.push(`label = $${paramIndex++}`);
      values.push(data.label);
    }

    if (data.textBlocks !== undefined) {
      updateFields.push(`text_blocks = $${paramIndex++}`);
      values.push(JSON.stringify(data.textBlocks));
    }

    if (data.centroid !== undefined) {
      updateFields.push(`centroid = $${paramIndex++}`);
      values.push(data.centroid ? `[${data.centroid.join(',')}]` : null);
    }

    if (data.confidence !== undefined) {
      updateFields.push(`confidence = $${paramIndex++}`);
      values.push(data.confidence);
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
    
    return this.mapRowToEntity(result.rows[0]);
  }
}