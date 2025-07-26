import { BaseRepository } from './BaseRepository.js';
import type { 
  Note, 
  CreateNoteInput, 
  UpdateNoteInput 
} from 'chicken-scratch-shared/types/models';

export class NoteRepository extends BaseRepository<Note, CreateNoteInput, UpdateNoteInput> {
  protected tableName = 'notes';
  protected primaryKey = 'id';

  // Find notes by image ID
  async findByImageId(imageId: string): Promise<Note[]> {
    return this.findAll({
      where: { image_id: imageId },
      sort: { column: 'created_at', direction: 'ASC' }
    });
  }

  // Find notes by cluster ID
  async findByClusterId(clusterId: string): Promise<Note[]> {
    return this.findAll({
      where: { cluster_id: clusterId },
      sort: { column: 'confidence', direction: 'DESC' }
    });
  }

  // Find unclustered notes for a project
  async findUnclusteredByProject(projectId: string): Promise<Note[]> {
    const query = `
      SELECT n.*
      FROM notes n
      JOIN processed_images pi ON n.image_id = pi.id
      WHERE pi.project_id = $1 AND n.cluster_id IS NULL
      ORDER BY n.confidence DESC
    `;

    const result = await this.executeQuery(query, [projectId]);
    return result.rows.map(row => this.mapRowToEntity(row));
  }

  // Find notes by project ID
  async findByProjectId(projectId: string): Promise<Note[]> {
    const query = `
      SELECT n.*
      FROM notes n
      JOIN processed_images pi ON n.image_id = pi.id
      WHERE pi.project_id = $1
      ORDER BY n.created_at ASC
    `;

    const result = await this.executeQuery(query, [projectId]);
    return result.rows.map(row => this.mapRowToEntity(row));
  }

  // Assign notes to cluster
  async assignToCluster(noteIds: string[], clusterId: string): Promise<Note[]> {
    if (noteIds.length === 0) {
      return [];
    }

    const placeholders = noteIds.map((_, index) => `$${index + 2}`).join(', ');
    const query = `
      UPDATE ${this.tableName}
      SET cluster_id = $1, updated_at = NOW()
      WHERE id IN (${placeholders})
      RETURNING *
    `;

    const result = await this.executeQuery(query, [clusterId, ...noteIds]);
    return result.rows.map(row => this.mapRowToEntity(row));
  }

  // Remove notes from cluster
  async removeFromCluster(noteIds: string[]): Promise<Note[]> {
    if (noteIds.length === 0) {
      return [];
    }

    const placeholders = noteIds.map((_, index) => `$${index + 1}`).join(', ');
    const query = `
      UPDATE ${this.tableName}
      SET cluster_id = NULL, updated_at = NOW()
      WHERE id IN (${placeholders})
      RETURNING *
    `;

    const result = await this.executeQuery(query, noteIds);
    return result.rows.map(row => this.mapRowToEntity(row));
  }

  // Update embeddings for notes
  async updateEmbeddings(noteEmbeddings: Array<{ noteId: string; embedding: number[] }>): Promise<void> {
    if (noteEmbeddings.length === 0) {
      return;
    }

    // Use transaction for batch update
    await this.executeInTransaction(async (client) => {
      for (const { noteId, embedding } of noteEmbeddings) {
        await client.query(
          `UPDATE ${this.tableName} 
           SET embedding = $1, updated_at = NOW() 
           WHERE id = $2`,
          [`[${embedding.join(',')}]`, noteId]
        );
      }
    });
  }

  // Find similar notes using vector similarity (requires pgvector extension)
  async findSimilarNotes(
    embedding: number[], 
    projectId: string, 
    limit: number = 10,
    threshold: number = 0.8
  ): Promise<Array<Note & { similarity: number }>> {
    const query = `
      SELECT 
        n.*,
        1 - (n.embedding <=> $1::vector) as similarity
      FROM notes n
      JOIN processed_images pi ON n.image_id = pi.id
      WHERE pi.project_id = $2 
        AND n.embedding IS NOT NULL
        AND 1 - (n.embedding <=> $1::vector) > $3
      ORDER BY n.embedding <=> $1::vector
      LIMIT $4
    `;

    const result = await this.executeQuery(query, [
      `[${embedding.join(',')}]`,
      projectId,
      threshold,
      limit
    ]);

    return result.rows.map(row => ({
      ...this.mapRowToEntity(row),
      similarity: parseFloat(row.similarity)
    }));
  }

  // Get note statistics for a project
  async getProjectNoteStats(projectId: string): Promise<{
    total: number;
    clustered: number;
    unclustered: number;
    averageConfidence: number;
  }> {
    const query = `
      SELECT 
        COUNT(*) as total,
        COUNT(n.cluster_id) as clustered,
        COUNT(*) - COUNT(n.cluster_id) as unclustered,
        AVG(n.confidence) as average_confidence
      FROM notes n
      JOIN processed_images pi ON n.image_id = pi.id
      WHERE pi.project_id = $1
    `;

    const result = await this.executeQuery(query, [projectId]);
    const row = result.rows[0];

    return {
      total: parseInt(row.total) || 0,
      clustered: parseInt(row.clustered) || 0,
      unclustered: parseInt(row.unclustered) || 0,
      averageConfidence: parseFloat(row.average_confidence) || 0
    };
  }

  protected mapRowToEntity(row: any): Note {
    return {
      id: row.id,
      imageId: row.image_id,
      originalText: row.original_text,
      cleanedText: row.cleaned_text,
      boundingBox: row.bounding_box,
      confidence: parseFloat(row.confidence),
      clusterId: row.cluster_id,
      embedding: row.embedding ? JSON.parse(row.embedding) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  // Update cluster assignment for a single note
  async updateClusterAssignment(noteId: string, clusterId: string): Promise<Note | null> {
    return this.updateById(noteId, { clusterId });
  }

  // Delete notes by image ID
  async deleteByImageId(imageId: string): Promise<boolean> {
    const result = await this.executeQuery(
      `DELETE FROM ${this.tableName} WHERE image_id = $1`,
      [imageId]
    );
    return result.rowCount > 0;
  }

  // Override create to handle snake_case conversion
  async create(data: CreateNoteInput): Promise<Note> {
    const result = await this.executeQuery(
      `INSERT INTO ${this.tableName} (image_id, original_text, cleaned_text, bounding_box, confidence)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        data.imageId, 
        data.originalText, 
        data.cleanedText, 
        JSON.stringify(data.boundingBox), 
        data.confidence
      ]
    );

    return this.mapRowToEntity(result.rows[0]);
  }

  // Override updateById to handle snake_case conversion
  async updateById(id: string, data: Partial<UpdateNoteInput>): Promise<Note | null> {
    const updateFields: string[] = [];
    const values: any[] = [id];
    let paramIndex = 2;

    if (data.cleanedText !== undefined) {
      updateFields.push(`cleaned_text = $${paramIndex++}`);
      values.push(data.cleanedText);
    }

    if (data.clusterId !== undefined) {
      updateFields.push(`cluster_id = $${paramIndex++}`);
      values.push(data.clusterId);
    }

    if (data.embedding !== undefined) {
      updateFields.push(`embedding = $${paramIndex++}`);
      values.push(`[${data.embedding.join(',')}]`);
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