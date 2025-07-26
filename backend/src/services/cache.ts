import Redis from 'redis';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  prefix?: string;
}

export class CacheService {
  private redis: Redis.RedisClientType;
  private isConnected: boolean = false;

  constructor() {
    this.initializeRedis();
  }

  private async initializeRedis() {
    try {
      this.redis = Redis.createClient({
        url: config.redisUrl,
        socket: {
          reconnectStrategy: (retries) => Math.min(retries * 50, 500)
        }
      });

      this.redis.on('error', (err) => {
        logger.error('Redis connection error:', err);
        this.isConnected = false;
      });

      this.redis.on('connect', () => {
        logger.info('Connected to Redis cache');
        this.isConnected = true;
      });

      this.redis.on('ready', () => {
        logger.info('Redis cache ready');
        this.isConnected = true;
      });

      this.redis.on('end', () => {
        logger.info('Redis cache connection ended');
        this.isConnected = false;
      });

      await this.redis.connect();
    } catch (error) {
      logger.error('Failed to initialize Redis cache:', error as Error);
      this.isConnected = false;
    }
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string, options: CacheOptions = {}): Promise<T | null> {
    if (!this.isConnected) {
      logger.warn('Redis not connected, cache miss for key:', key);
      return null;
    }

    try {
      const fullKey = this.buildKey(key, options.prefix);
      const value = await this.redis.get(fullKey);
      
      if (value === null) {
        return null;
      }

      return JSON.parse(value) as T;
    } catch (error) {
      logger.error('Cache get error:', error as Error);
      return null;
    }
  }

  /**
   * Set value in cache
   */
  async set(key: string, value: any, options: CacheOptions = {}): Promise<boolean> {
    if (!this.isConnected) {
      logger.warn('Redis not connected, skipping cache set for key:', key);
      return false;
    }

    try {
      const fullKey = this.buildKey(key, options.prefix);
      const serializedValue = JSON.stringify(value);
      
      if (options.ttl) {
        await this.redis.setEx(fullKey, options.ttl, serializedValue);
      } else {
        await this.redis.set(fullKey, serializedValue);
      }
      
      return true;
    } catch (error) {
      logger.error('Cache set error:', error as Error);
      return false;
    }
  }

  /**
   * Delete value from cache
   */
  async del(key: string, options: CacheOptions = {}): Promise<boolean> {
    if (!this.isConnected) {
      return false;
    }

    try {
      const fullKey = this.buildKey(key, options.prefix);
      const result = await this.redis.del(fullKey);
      return result > 0;
    } catch (error) {
      logger.error('Cache delete error:', error as Error);
      return false;
    }
  }

  /**
   * Check if key exists in cache
   */
  async exists(key: string, options: CacheOptions = {}): Promise<boolean> {
    if (!this.isConnected) {
      return false;
    }

    try {
      const fullKey = this.buildKey(key, options.prefix);
      const result = await this.redis.exists(fullKey);
      return result === 1;
    } catch (error) {
      logger.error('Cache exists error:', error as Error);
      return false;
    }
  }

  /**
   * Get multiple values from cache
   */
  async mget<T>(keys: string[], options: CacheOptions = {}): Promise<(T | null)[]> {
    if (!this.isConnected || keys.length === 0) {
      return keys.map(() => null);
    }

    try {
      const fullKeys = keys.map(key => this.buildKey(key, options.prefix));
      const values = await this.redis.mGet(fullKeys);
      
      return values.map(value => {
        if (value === null) return null;
        try {
          return JSON.parse(value) as T;
        } catch {
          return null;
        }
      });
    } catch (error) {
      logger.error('Cache mget error:', error as Error);
      return keys.map(() => null);
    }
  }

  /**
   * Set multiple values in cache
   */
  async mset(keyValuePairs: Array<[string, any]>, options: CacheOptions = {}): Promise<boolean> {
    if (!this.isConnected || keyValuePairs.length === 0) {
      return false;
    }

    try {
      const pipeline = this.redis.multi();
      
      keyValuePairs.forEach(([key, value]) => {
        const fullKey = this.buildKey(key, options.prefix);
        const serializedValue = JSON.stringify(value);
        
        if (options.ttl) {
          pipeline.setEx(fullKey, options.ttl, serializedValue);
        } else {
          pipeline.set(fullKey, serializedValue);
        }
      });

      await pipeline.exec();
      return true;
    } catch (error) {
      logger.error('Cache mset error:', error as Error);
      return false;
    }
  }

  /**
   * Increment a numeric value in cache
   */
  async incr(key: string, options: CacheOptions = {}): Promise<number | null> {
    if (!this.isConnected) {
      return null;
    }

    try {
      const fullKey = this.buildKey(key, options.prefix);
      const result = await this.redis.incr(fullKey);
      
      if (options.ttl) {
        await this.redis.expire(fullKey, options.ttl);
      }
      
      return result;
    } catch (error) {
      logger.error('Cache incr error:', error as Error);
      return null;
    }
  }

  /**
   * Set expiration for a key
   */
  async expire(key: string, ttl: number, options: CacheOptions = {}): Promise<boolean> {
    if (!this.isConnected) {
      return false;
    }

    try {
      const fullKey = this.buildKey(key, options.prefix);
      const result = await this.redis.expire(fullKey, ttl);
      return result === 1;
    } catch (error) {
      logger.error('Cache expire error:', error as Error);
      return false;
    }
  }

  /**
   * Clear all keys with a specific prefix
   */
  async clearPrefix(prefix: string): Promise<number> {
    if (!this.isConnected) {
      return 0;
    }

    try {
      const pattern = `${prefix}:*`;
      const keys = await this.redis.keys(pattern);
      
      if (keys.length === 0) {
        return 0;
      }

      const result = await this.redis.del(keys);
      return result;
    } catch (error) {
      logger.error('Cache clear prefix error:', error as Error);
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<any> {
    if (!this.isConnected) {
      return null;
    }

    try {
      const info = await this.redis.info('memory');
      const keyspace = await this.redis.info('keyspace');
      
      return {
        connected: this.isConnected,
        memory: info,
        keyspace: keyspace
      };
    } catch (error) {
      logger.error('Cache stats error:', error as Error);
      return null;
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    if (this.redis && this.isConnected) {
      await this.redis.quit();
      this.isConnected = false;
    }
  }

  /**
   * Build full cache key with prefix
   */
  private buildKey(key: string, prefix?: string): string {
    const basePrefix = 'chicken-scratch';
    if (prefix) {
      return `${basePrefix}:${prefix}:${key}`;
    }
    return `${basePrefix}:${key}`;
  }
}

// Singleton instance
export const cacheService = new CacheService();

// Cache decorators and utilities
export function cacheKey(prefix: string, ...parts: (string | number)[]): string {
  return parts.join(':');
}

/**
 * Cache decorator for methods
 */
export function cached(options: CacheOptions & { keyGenerator?: (...args: any[]) => string }) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const key = options.keyGenerator ? options.keyGenerator(...args) : `${target.constructor.name}:${propertyName}:${JSON.stringify(args)}`;
      
      // Try to get from cache first
      const cached = await cacheService.get(key, options);
      if (cached !== null) {
        return cached;
      }

      // Execute original method
      const result = await method.apply(this, args);
      
      // Cache the result
      await cacheService.set(key, result, options);
      
      return result;
    };
  };
}

/**
 * Cache invalidation helper
 */
export class CacheInvalidator {
  static async invalidateUser(userId: string): Promise<void> {
    await cacheService.clearPrefix(`user:${userId}`);
  }

  static async invalidateProject(projectId: string): Promise<void> {
    await cacheService.clearPrefix(`project:${projectId}`);
  }

  static async invalidateUserProjects(userId: string): Promise<void> {
    await cacheService.clearPrefix(`projects:user:${userId}`);
  }

  static async invalidateOCRResults(imageId: string): Promise<void> {
    await cacheService.del(cacheKey('ocr', imageId));
  }

  static async invalidateClusterResults(projectId: string): Promise<void> {
    await cacheService.clearPrefix(`clusters:${projectId}`);
  }
}