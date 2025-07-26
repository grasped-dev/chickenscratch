import { PoolClient } from 'pg';
import { withDatabase, withTransaction } from '../config/database.js';

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

export interface SortOptions {
  column: string;
  direction: 'ASC' | 'DESC';
}

export abstract class BaseRepository<T, CreateInput, UpdateInput> {
  protected abstract tableName: string;
  protected abstract primaryKey: string;

  // Create a new record
  async create(data: CreateInput): Promise<T> {
    return withDatabase(async (client) => {
      const columns = Object.keys(data as any).join(', ');
      const placeholders = Object.keys(data as any).map((_, index) => `$${index + 1}`).join(', ');
      const values = Object.values(data as any);

      const query = `
        INSERT INTO ${this.tableName} (${columns})
        VALUES (${placeholders})
        RETURNING *
      `;

      const result = await client.query(query, values);
      return this.mapRowToEntity(result.rows[0]);
    });
  }

  // Find a record by ID
  async findById(id: string): Promise<T | null> {
    return withDatabase(async (client) => {
      const query = `SELECT * FROM ${this.tableName} WHERE ${this.primaryKey} = $1`;
      const result = await client.query(query, [id]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return this.mapRowToEntity(result.rows[0]);
    });
  }

  // Find all records with optional pagination and sorting
  async findAll(options?: {
    pagination?: PaginationOptions;
    sort?: SortOptions;
    where?: Record<string, any>;
  }): Promise<T[]> {
    return withDatabase(async (client) => {
      let query = `SELECT * FROM ${this.tableName}`;
      const params: any[] = [];
      let paramIndex = 1;

      // Add WHERE clause if provided
      if (options?.where) {
        const whereConditions = Object.keys(options.where).map((key) => {
          params.push(options.where![key]);
          return `${key} = $${paramIndex++}`;
        });
        query += ` WHERE ${whereConditions.join(' AND ')}`;
      }

      // Add ORDER BY clause if provided
      if (options?.sort) {
        query += ` ORDER BY ${options.sort.column} ${options.sort.direction}`;
      }

      // Add LIMIT and OFFSET if provided
      if (options?.pagination) {
        if (options.pagination.limit) {
          query += ` LIMIT $${paramIndex++}`;
          params.push(options.pagination.limit);
        }
        if (options.pagination.offset) {
          query += ` OFFSET $${paramIndex++}`;
          params.push(options.pagination.offset);
        }
      }

      const result = await client.query(query, params);
      return result.rows.map(row => this.mapRowToEntity(row));
    });
  }

  // Update a record by ID
  async updateById(id: string, data: Partial<UpdateInput>): Promise<T | null> {
    return withDatabase(async (client) => {
      const updateFields = Object.keys(data as any);
      if (updateFields.length === 0) {
        return this.findById(id);
      }

      const setClause = updateFields.map((field, index) => `${field} = $${index + 2}`).join(', ');
      const values = [id, ...Object.values(data as any)];

      const query = `
        UPDATE ${this.tableName}
        SET ${setClause}, updated_at = NOW()
        WHERE ${this.primaryKey} = $1
        RETURNING *
      `;

      const result = await client.query(query, values);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return this.mapRowToEntity(result.rows[0]);
    });
  }

  // Delete a record by ID
  async deleteById(id: string): Promise<boolean> {
    return withDatabase(async (client) => {
      const query = `DELETE FROM ${this.tableName} WHERE ${this.primaryKey} = $1`;
      const result = await client.query(query, [id]);
      return result.rowCount > 0;
    });
  }

  // Count records with optional where clause
  async count(where?: Record<string, any>): Promise<number> {
    return withDatabase(async (client) => {
      let query = `SELECT COUNT(*) FROM ${this.tableName}`;
      const params: any[] = [];
      let paramIndex = 1;

      if (where) {
        const whereConditions = Object.keys(where).map((key) => {
          params.push(where[key]);
          return `${key} = $${paramIndex++}`;
        });
        query += ` WHERE ${whereConditions.join(' AND ')}`;
      }

      const result = await client.query(query, params);
      return parseInt(result.rows[0].count);
    });
  }

  // Execute a custom query
  protected async executeQuery<R = any>(
    query: string,
    params: any[] = []
  ): Promise<QueryResult<R>> {
    return withDatabase(async (client) => {
      const result = await client.query(query, params);
      return {
        rows: result.rows,
        rowCount: result.rowCount || 0,
      };
    });
  }

  // Execute a query within a transaction
  protected async executeInTransaction<R>(
    callback: (client: PoolClient) => Promise<R>
  ): Promise<R> {
    return withTransaction(callback);
  }

  // Abstract method to map database row to entity
  protected abstract mapRowToEntity(row: any): T;

  // Helper method to convert camelCase to snake_case for database columns
  protected toSnakeCase(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }

  // Helper method to convert snake_case to camelCase for entity properties
  protected toCamelCase(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  // Helper method to convert object keys from camelCase to snake_case
  protected toSnakeCaseObject(obj: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[this.toSnakeCase(key)] = value;
    }
    return result;
  }

  // Helper method to convert object keys from snake_case to camelCase
  protected toCamelCaseObject(obj: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[this.toCamelCase(key)] = value;
    }
    return result;
  }
}