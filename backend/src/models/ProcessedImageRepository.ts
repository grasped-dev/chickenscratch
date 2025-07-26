import { BaseRepository } from './BaseRepository.js';
import type { 
  ProcessedImage, 
  CreateProcessedImageInput, 
  UpdateProcessedImageInput 
} from 'chicken-scratch-shared/types/models';

export class ProcessedImageRepository extends BaseRepository<ProcessedImage, CreateProcessedImageInput, UpdateProcessedImageInput> {
  protected tableName = 'processed_images';
  protected primaryKey = 'id';

  // Find images by project ID
  async findByProjectId(projectId: string): Promise<ProcessedImage[]> {
    return this.findAll({
      where: { project_id: projectId },
      sort: { column: 'uploaded_at', direction: 'ASC' }
    });
  }

  // Find images by processing status
  async findByStatus(status: 'pending' | 'processing' | 'completed' | 'failed'): Promise<ProcessedImage[]> {
    return this.findAll({
      where: { processing_status: status },
      sort: { column: 'uploaded_at', direction: 'ASC' }
    });
  }

  // Update processing status
  async updateProcessingStatus(
    imageId: string, 
    status: 'pending' | 'processing' | 'completed' | 'failed',
    errorMessage?: string
  ): Promise<ProcessedImage | null> {
    const updateData: Partial<UpdateProcessedImageInput> = {
      processingStatus: status
    };

    if (errorMessage) {
      updateData.errorMessage = errorMessage;
    }

    return this.updateById(imageId, updateData);
  }

  // Get images with note counts
  async getImagesWithNoteCounts(projectId: string): Promise<Array<ProcessedImage & { noteCount: number }>> {
    const query = `
      SELECT 
        pi.*,
        COALESCE(note_counts.note_count, 0) as note_count
      FROM processed_images pi
      LEFT JOIN (
        SELECT 
          image_id,
          COUNT(id) as note_count
        FROM notes
        GROUP BY image_id
      ) note_counts ON pi.id = note_counts.image_id
      WHERE pi.project_id = $1
      ORDER BY pi.uploaded_at ASC
    `;

    const result = await this.executeQuery(query, [projectId]);
    
    return result.rows.map(row => ({
      ...this.mapRowToEntity(row),
      noteCount: parseInt(row.note_count) || 0
    }));
  }

  // Get processing statistics
  async getProcessingStats(projectId?: string): Promise<{
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  }> {
    let query = `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN processing_status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN processing_status = 'processing' THEN 1 END) as processing,
        COUNT(CASE WHEN processing_status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN processing_status = 'failed' THEN 1 END) as failed
      FROM processed_images
    `;

    const params: any[] = [];
    if (projectId) {
      query += ' WHERE project_id = $1';
      params.push(projectId);
    }

    const result = await this.executeQuery(query, params);
    const row = result.rows[0];

    return {
      total: parseInt(row.total) || 0,
      pending: parseInt(row.pending) || 0,
      processing: parseInt(row.processing) || 0,
      completed: parseInt(row.completed) || 0,
      failed: parseInt(row.failed) || 0
    };
  }

  protected mapRowToEntity(row: any): ProcessedImage {
    return {
      id: row.id,
      projectId: row.project_id,
      originalUrl: row.original_url,
      filename: row.filename,
      fileSize: row.file_size,
      mimeType: row.mime_type,
      uploadedAt: new Date(row.uploaded_at),
      processingStatus: row.processing_status,
      ocrResults: row.ocr_results,
      boundingBoxes: row.bounding_boxes || [],
      errorMessage: row.error_message
    };
  }

  // Delete images by project ID
  async deleteByProjectId(projectId: string): Promise<boolean> {
    const result = await this.executeQuery(
      `DELETE FROM ${this.tableName} WHERE project_id = $1`,
      [projectId]
    );
    return result.rowCount > 0;
  }

  // Override create to handle snake_case conversion
  async create(data: CreateProcessedImageInput): Promise<ProcessedImage> {
    const result = await this.executeQuery(
      `INSERT INTO ${this.tableName} (project_id, original_url, filename, file_size, mime_type)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [data.projectId, data.originalUrl, data.filename, data.fileSize, data.mimeType]
    );

    return this.mapRowToEntity(result.rows[0]);
  }

  // Override updateById to handle snake_case conversion and JSON fields
  async updateById(id: string, data: Partial<UpdateProcessedImageInput>): Promise<ProcessedImage | null> {
    const updateFields: string[] = [];
    const values: any[] = [id];
    let paramIndex = 2;

    if (data.processingStatus !== undefined) {
      updateFields.push(`processing_status = $${paramIndex++}`);
      values.push(data.processingStatus);
    }

    if (data.ocrResults !== undefined) {
      updateFields.push(`ocr_results = $${paramIndex++}`);
      values.push(JSON.stringify(data.ocrResults));
    }

    if (data.boundingBoxes !== undefined) {
      updateFields.push(`bounding_boxes = $${paramIndex++}`);
      values.push(JSON.stringify(data.boundingBoxes));
    }

    if (data.errorMessage !== undefined) {
      updateFields.push(`error_message = $${paramIndex++}`);
      values.push(data.errorMessage);
    }

    if (updateFields.length === 0) {
      return this.findById(id);
    }

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