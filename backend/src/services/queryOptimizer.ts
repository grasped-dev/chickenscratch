import { PoolClient } from 'pg';
import { getPool } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { cacheService } from './cache.js';

export interface QueryOptions {
  useCache?: boolean;
  cacheTTL?: number;
  cacheKey?: string;
  timeout?: number;
  explain?: boolean;
}

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
  executionTime: number;
  fromCache: boolean;
  queryPlan?: any;
}

export class QueryOptimizer {
  private pool = getPool();

  /**
   * Execute optimized query with caching and performance monitoring
   */
  async executeQuery<T = any>(
    query: string,
    params: any[] = [],
    options: QueryOptions = {}
  ): Promise<QueryResult<T>> {
    const {
      useCache = false,
      cacheTTL = 300,
      cacheKey,
      timeout = 30000,
      explain = false
    } = options;

    const startTime = Date.now();
    let fromCache = false;
    let queryPlan: any;

    try {
      // Try cache first if enabled
      if (useCache && cacheKey) {
        const cached = await cacheService.get<QueryResult<T>>(cacheKey, { ttl: cacheTTL });
        if (cached) {
          logger.debug(`Query cache hit: ${cacheKey}`);
          return {
            ...cached,
            fromCache: true
          };
        }
      }

      const client = await this.pool.connect();
      
      try {
        // Set query timeout
        if (timeout > 0) {
          await client.query(`SET statement_timeout = ${timeout}`);
        }

        // Get query plan if requested
        if (explain) {
          const explainResult = await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`, params);
          queryPlan = explainResult.rows[0]['QUERY PLAN'];
        }

        // Execute the actual query
        const result = await client.query(query, params);
        const executionTime = Date.now() - startTime;

        const queryResult: QueryResult<T> = {
          rows: result.rows,
          rowCount: result.rowCount || 0,
          executionTime,
          fromCache,
          queryPlan
        };

        // Cache the result if enabled
        if (useCache && cacheKey && result.rows.length > 0) {
          await cacheService.set(cacheKey, queryResult, { ttl: cacheTTL });
          logger.debug(`Query result cached: ${cacheKey}`);
        }

        // Log slow queries
        if (executionTime > 1000) {
          logger.warn('Slow query detected:', {
            query: query.substring(0, 200),
            executionTime,
            rowCount: result.rowCount
          });
        }

        return queryResult;
      } finally {
        client.release();
      }
    } catch (error) {
      const executionTime = Date.now() - startTime;
      logger.error('Query execution failed:', {
        query: query.substring(0, 200),
        error: error.message,
        executionTime
      });
      throw error;
    }
  }

  /**
   * Execute batch queries with transaction support
   */
  async executeBatch<T = any>(
    queries: Array<{ query: string; params?: any[] }>,
    useTransaction: boolean = true
  ): Promise<QueryResult<T>[]> {
    const client = await this.pool.connect();
    const results: QueryResult<T>[] = [];

    try {
      if (useTransaction) {
        await client.query('BEGIN');
      }

      for (const { query, params = [] } of queries) {
        const startTime = Date.now();
        const result = await client.query(query, params);
        const executionTime = Date.now() - startTime;

        results.push({
          rows: result.rows,
          rowCount: result.rowCount || 0,
          executionTime,
          fromCache: false
        });
      }

      if (useTransaction) {
        await client.query('COMMIT');
      }

      return results;
    } catch (error) {
      if (useTransaction) {
        await client.query('ROLLBACK');
      }
      logger.error('Batch query execution failed:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get optimized project list with pagination
   */
  async getProjectsPaginated(
    userId: string,
    limit: number = 20,
    offset: number = 0,
    filters: {
      status?: string;
      search?: string;
      dateFrom?: Date;
      dateTo?: Date;
    } = {}
  ): Promise<QueryResult> {
    const cacheKey = `projects:${userId}:${limit}:${offset}:${JSON.stringify(filters)}`;
    
    let whereClause = 'WHERE p.user_id = $1';
    const params: any[] = [userId];
    let paramIndex = 2;

    if (filters.status) {
      whereClause += ` AND p.status = $${paramIndex}`;
      params.push(filters.status);
      paramIndex++;
    }

    if (filters.search) {
      whereClause += ` AND (p.name ILIKE $${paramIndex} OR p.description ILIKE $${paramIndex})`;
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    if (filters.dateFrom) {
      whereClause += ` AND p.created_at >= $${paramIndex}`;
      params.push(filters.dateFrom);
      paramIndex++;
    }

    if (filters.dateTo) {
      whereClause += ` AND p.created_at <= $${paramIndex}`;
      params.push(filters.dateTo);
      paramIndex++;
    }

    const query = `
      SELECT 
        p.*,
        COUNT(pi.id) as image_count,
        COUNT(CASE WHEN pi.processing_status = 'completed' THEN 1 END) as processed_count
      FROM projects p
      LEFT JOIN processed_images pi ON p.id = pi.project_id
      ${whereClause}
      GROUP BY p.id
      ORDER BY p.updated_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    return this.executeQuery(query, params, {
      useCache: true,
      cacheTTL: 300,
      cacheKey
    });
  }

  /**
   * Get project details with related data in single query
   */
  async getProjectDetails(projectId: string, userId: string): Promise<QueryResult> {
    const cacheKey = `project:details:${projectId}:${userId}`;

    const query = `
      SELECT 
        p.*,
        json_agg(
          DISTINCT jsonb_build_object(
            'id', pi.id,
            'filename', pi.filename,
            'uploaded_at', pi.uploaded_at,
            'processing_status', pi.processing_status,
            'note_count', COALESCE(note_counts.count, 0)
          )
        ) FILTER (WHERE pi.id IS NOT NULL) as images,
        json_agg(
          DISTINCT jsonb_build_object(
            'id', c.id,
            'label', c.label,
            'confidence', c.confidence,
            'note_count', COALESCE(cluster_counts.count, 0)
          )
        ) FILTER (WHERE c.id IS NOT NULL) as clusters
      FROM projects p
      LEFT JOIN processed_images pi ON p.id = pi.project_id
      LEFT JOIN clusters c ON p.id = c.project_id
      LEFT JOIN (
        SELECT image_id, COUNT(*) as count
        FROM notes
        GROUP BY image_id
      ) note_counts ON pi.id = note_counts.image_id
      LEFT JOIN (
        SELECT cluster_id, COUNT(*) as count
        FROM notes
        GROUP BY cluster_id
      ) cluster_counts ON c.id = cluster_counts.cluster_id
      WHERE p.id = $1 AND p.user_id = $2
      GROUP BY p.id
    `;

    return this.executeQuery(query, [projectId, userId], {
      useCache: true,
      cacheTTL: 600,
      cacheKey
    });
  }

  /**
   * Get notes with clustering information efficiently
   */
  async getNotesWithClusters(projectId: string): Promise<QueryResult> {
    const cacheKey = `notes:clusters:${projectId}`;

    const query = `
      SELECT 
        n.*,
        c.label as cluster_label,
        c.confidence as cluster_confidence,
        pi.filename as image_filename
      FROM notes n
      JOIN processed_images pi ON n.image_id = pi.id
      LEFT JOIN clusters c ON n.cluster_id = c.id
      WHERE pi.project_id = $1
      ORDER BY c.confidence DESC NULLS LAST, n.confidence DESC
    `;

    return this.executeQuery(query, [projectId], {
      useCache: true,
      cacheTTL: 900,
      cacheKey
    });
  }

  /**
   * Search notes with full-text search
   */
  async searchNotes(
    userId: string,
    searchTerm: string,
    limit: number = 50
  ): Promise<QueryResult> {
    const cacheKey = `search:notes:${userId}:${searchTerm}:${limit}`;

    const query = `
      SELECT 
        n.*,
        p.name as project_name,
        pi.filename as image_filename,
        c.label as cluster_label,
        ts_rank(to_tsvector('english', n.cleaned_text), plainto_tsquery('english', $2)) as rank
      FROM notes n
      JOIN processed_images pi ON n.image_id = pi.id
      JOIN projects p ON pi.project_id = p.id
      LEFT JOIN clusters c ON n.cluster_id = c.id
      WHERE p.user_id = $1
        AND (
          to_tsvector('english', n.cleaned_text) @@ plainto_tsquery('english', $2)
          OR n.cleaned_text ILIKE $3
        )
      ORDER BY rank DESC, n.confidence DESC
      LIMIT $4
    `;

    return this.executeQuery(query, [userId, searchTerm, `%${searchTerm}%`, limit], {
      useCache: true,
      cacheTTL: 180,
      cacheKey
    });
  }

  /**
   * Get database performance statistics
   */
  async getPerformanceStats(): Promise<QueryResult> {
    const query = `
      SELECT 
        schemaname,
        tablename,
        attname,
        n_distinct,
        correlation
      FROM pg_stats 
      WHERE schemaname = 'public'
      ORDER BY tablename, attname
    `;

    return this.executeQuery(query);
  }

  /**
   * Analyze query performance
   */
  async analyzeQuery(query: string, params: any[] = []): Promise<any> {
    const explainQuery = `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`;
    const result = await this.executeQuery(explainQuery, params);
    return result.rows[0]['QUERY PLAN'];
  }

  /**
   * Update table statistics for better query planning
   */
  async updateStatistics(tables: string[] = []): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      if (tables.length === 0) {
        await client.query('ANALYZE');
        logger.info('Updated statistics for all tables');
      } else {
        for (const table of tables) {
          await client.query(`ANALYZE ${table}`);
          logger.info(`Updated statistics for table: ${table}`);
        }
      }
    } finally {
      client.release();
    }
  }

  /**
   * Get slow query log
   */
  async getSlowQueries(limit: number = 10): Promise<QueryResult> {
    const query = `
      SELECT 
        query,
        calls,
        total_time,
        mean_time,
        rows,
        100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0) AS hit_percent
      FROM pg_stat_statements
      ORDER BY total_time DESC
      LIMIT $1
    `;

    return this.executeQuery(query, [limit]);
  }
}

export const queryOptimizer = new QueryOptimizer();