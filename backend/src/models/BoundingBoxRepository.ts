import { BaseRepository } from './BaseRepository';
import { BoundingBoxGroup } from '../services/boundingBox';
import { TextBlock } from '../types/ocr';

export interface StoredBoundingBoxGroup {
  id: string;
  imageId: string;
  boundingBox: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  textBlockIds: string[];
  confidence: number;
  type: 'auto' | 'manual';
  createdAt: Date;
  updatedAt: Date;
}

export class BoundingBoxRepository extends BaseRepository {
  /**
   * Save bounding box groups for an image
   */
  async saveBoundingBoxGroups(
    imageId: string,
    groups: BoundingBoxGroup[]
  ): Promise<StoredBoundingBoxGroup[]> {
    try {
      const client = await this.pool.connect();
      
      try {
        await client.query('BEGIN');
        
        // Delete existing groups for this image
        await client.query(
          'DELETE FROM bounding_box_groups WHERE image_id = $1',
          [imageId]
        );
        
        // Insert new groups
        const storedGroups: StoredBoundingBoxGroup[] = [];
        
        for (const group of groups) {
          const textBlockIds = group.textBlocks.map(block => block.id);
          
          const result = await client.query(
            `INSERT INTO bounding_box_groups 
            (id, image_id, left_pos, top_pos, width, height, text_block_ids, confidence, type)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id, image_id, left_pos, top_pos, width, height, text_block_ids, confidence, type, created_at, updated_at`,
            [
              group.id,
              imageId,
              group.boundingBox.left,
              group.boundingBox.top,
              group.boundingBox.width,
              group.boundingBox.height,
              JSON.stringify(textBlockIds),
              group.confidence,
              group.type,
            ]
          );
          
          const row = result.rows[0];
          storedGroups.push({
            id: row.id,
            imageId: row.image_id,
            boundingBox: {
              left: row.left_pos,
              top: row.top_pos,
              width: row.width,
              height: row.height,
            },
            textBlockIds: JSON.parse(row.text_block_ids),
            confidence: row.confidence,
            type: row.type,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          });
        }
        
        await client.query('COMMIT');
        return storedGroups;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      throw new Error(`Failed to save bounding box groups: ${error.message}`);
    }
  }
  
  /**
   * Get bounding box groups for an image
   */
  async getBoundingBoxGroups(
    imageId: string,
    textBlocks?: TextBlock[]
  ): Promise<BoundingBoxGroup[]> {
    try {
      const result = await this.pool.query(
        `SELECT id, image_id, left_pos, top_pos, width, height, text_block_ids, confidence, type, created_at, updated_at
        FROM bounding_box_groups
        WHERE image_id = $1
        ORDER BY created_at ASC`,
        [imageId]
      );
      
      if (result.rows.length === 0) {
        return [];
      }
      
      // If text blocks are provided, use them to reconstruct the groups
      // Otherwise, return groups with empty text blocks arrays
      const textBlockMap = new Map<string, TextBlock>();
      if (textBlocks) {
        textBlocks.forEach(block => {
          textBlockMap.set(block.id, block);
        });
      }
      
      return result.rows.map(row => {
        const textBlockIds: string[] = JSON.parse(row.text_block_ids);
        const groupTextBlocks: TextBlock[] = [];
        
        if (textBlocks) {
          textBlockIds.forEach(id => {
            const block = textBlockMap.get(id);
            if (block) {
              groupTextBlocks.push(block);
            }
          });
        }
        
        return {
          id: row.id,
          boundingBox: {
            left: row.left_pos,
            top: row.top_pos,
            width: row.width,
            height: row.height,
          },
          textBlocks: groupTextBlocks,
          confidence: row.confidence,
          type: row.type,
        };
      });
    } catch (error) {
      throw new Error(`Failed to get bounding box groups: ${error.message}`);
    }
  }
  
  /**
   * Save a single bounding box group
   */
  async saveBoundingBoxGroup(
    imageId: string,
    group: BoundingBoxGroup
  ): Promise<StoredBoundingBoxGroup> {
    try {
      const textBlockIds = group.textBlocks.map(block => block.id);
      
      const result = await this.pool.query(
        `INSERT INTO bounding_box_groups 
        (id, image_id, left_pos, top_pos, width, height, text_block_ids, confidence, type)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO UPDATE
        SET left_pos = $3, top_pos = $4, width = $5, height = $6, 
            text_block_ids = $7, confidence = $8, type = $9, updated_at = NOW()
        RETURNING id, image_id, left_pos, top_pos, width, height, text_block_ids, confidence, type, created_at, updated_at`,
        [
          group.id,
          imageId,
          group.boundingBox.left,
          group.boundingBox.top,
          group.boundingBox.width,
          group.boundingBox.height,
          JSON.stringify(textBlockIds),
          group.confidence,
          group.type,
        ]
      );
      
      const row = result.rows[0];
      return {
        id: row.id,
        imageId: row.image_id,
        boundingBox: {
          left: row.left_pos,
          top: row.top_pos,
          width: row.width,
          height: row.height,
        },
        textBlockIds: JSON.parse(row.text_block_ids),
        confidence: row.confidence,
        type: row.type,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    } catch (error) {
      throw new Error(`Failed to save bounding box group: ${error.message}`);
    }
  }
  
  /**
   * Delete a bounding box group
   */
  async deleteBoundingBoxGroup(groupId: string): Promise<boolean> {
    try {
      const result = await this.pool.query(
        'DELETE FROM bounding_box_groups WHERE id = $1 RETURNING id',
        [groupId]
      );
      
      return result.rowCount > 0;
    } catch (error) {
      throw new Error(`Failed to delete bounding box group: ${error.message}`);
    }
  }
  
  /**
   * Create database migration for bounding box groups table
   */
  static async createMigration(client: any): Promise<void> {
    await client.query(`
      CREATE TABLE IF NOT EXISTS bounding_box_groups (
        id VARCHAR(255) PRIMARY KEY,
        image_id VARCHAR(255) NOT NULL,
        left_pos FLOAT NOT NULL,
        top_pos FLOAT NOT NULL,
        width FLOAT NOT NULL,
        height FLOAT NOT NULL,
        text_block_ids JSONB NOT NULL,
        confidence FLOAT NOT NULL,
        type VARCHAR(50) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS idx_bounding_box_groups_image_id ON bounding_box_groups(image_id);
    `);
  }
}

export const boundingBoxRepository = new BoundingBoxRepository();