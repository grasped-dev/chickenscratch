import { Request, Response, NextFunction } from 'express';
import { cacheService, CacheOptions } from '../services/cache.js';
import { logger } from '../utils/logger.js';

export interface CacheMiddlewareOptions extends CacheOptions {
  keyGenerator?: (req: Request) => string;
  condition?: (req: Request, res: Response) => boolean;
  skipCache?: (req: Request) => boolean;
}

/**
 * Middleware for caching API responses
 */
export function cacheMiddleware(options: CacheMiddlewareOptions = {}) {
  const {
    ttl = 300, // 5 minutes default
    prefix = 'api',
    keyGenerator,
    condition,
    skipCache
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip caching for non-GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Skip caching if condition is provided and returns false
    if (skipCache && skipCache(req)) {
      return next();
    }

    // Generate cache key
    const cacheKey = keyGenerator 
      ? keyGenerator(req)
      : generateDefaultCacheKey(req);

    try {
      // Try to get cached response
      const cachedResponse = await cacheService.get(cacheKey, { prefix, ttl });
      
      if (cachedResponse) {
        logger.debug(`Cache hit for key: ${cacheKey}`);
        return res.json(cachedResponse);
      }

      // Cache miss - intercept response
      const originalJson = res.json;
      let responseData: any;

      res.json = function(data: any) {
        responseData = data;
        return originalJson.call(this, data);
      };

      // Continue to next middleware
      res.on('finish', async () => {
        // Only cache successful responses
        if (res.statusCode >= 200 && res.statusCode < 300 && responseData) {
          // Check condition if provided
          if (!condition || condition(req, res)) {
            await cacheService.set(cacheKey, responseData, { prefix, ttl });
            logger.debug(`Cached response for key: ${cacheKey}`);
          }
        }
      });

      next();
    } catch (error) {
      logger.error('Cache middleware error:', error);
      next();
    }
  };
}

/**
 * Generate default cache key from request
 */
function generateDefaultCacheKey(req: Request): string {
  const { path, query, user } = req;
  const userId = (user as any)?.id || 'anonymous';
  
  // Include user ID and query parameters in cache key
  const queryString = Object.keys(query).length > 0 
    ? JSON.stringify(query) 
    : '';
  
  return `${userId}:${path}:${queryString}`;
}

/**
 * Cache invalidation middleware
 */
export function invalidateCacheMiddleware(patterns: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json;

    res.json = function(data: any) {
      // Invalidate cache patterns after successful response
      if (res.statusCode >= 200 && res.statusCode < 300) {
        setImmediate(async () => {
          for (const pattern of patterns) {
            try {
              await cacheService.clearPrefix(pattern);
              logger.debug(`Invalidated cache pattern: ${pattern}`);
            } catch (error) {
              logger.error(`Failed to invalidate cache pattern ${pattern}:`, error);
            }
          }
        });
      }
      
      return originalJson.call(this, data);
    };

    next();
  };
}

/**
 * Conditional cache middleware based on user preferences
 */
export function conditionalCache(options: CacheMiddlewareOptions = {}) {
  return cacheMiddleware({
    ...options,
    condition: (req, res) => {
      // Don't cache if user has disabled caching
      const user = (req as any).user;
      if (user?.preferences?.disableCache) {
        return false;
      }
      
      // Don't cache error responses
      if (res.statusCode >= 400) {
        return false;
      }
      
      return true;
    }
  });
}

/**
 * Project-specific cache middleware
 */
export function projectCache(ttl: number = 600) {
  return cacheMiddleware({
    ttl,
    prefix: 'project',
    keyGenerator: (req) => {
      const { projectId } = req.params;
      const userId = (req as any).user?.id;
      return `${userId}:${projectId}:${req.path}`;
    }
  });
}

/**
 * User-specific cache middleware
 */
export function userCache(ttl: number = 300) {
  return cacheMiddleware({
    ttl,
    prefix: 'user',
    keyGenerator: (req) => {
      const userId = (req as any).user?.id;
      return `${userId}:${req.path}:${JSON.stringify(req.query)}`;
    }
  });
}

/**
 * OCR results cache middleware
 */
export function ocrCache(ttl: number = 3600) {
  return cacheMiddleware({
    ttl,
    prefix: 'ocr',
    keyGenerator: (req) => {
      const { imageId } = req.params;
      return `${imageId}`;
    }
  });
}

/**
 * Clustering results cache middleware
 */
export function clusterCache(ttl: number = 1800) {
  return cacheMiddleware({
    ttl,
    prefix: 'cluster',
    keyGenerator: (req) => {
      const { projectId } = req.params;
      const { method, threshold } = req.query;
      return `${projectId}:${method}:${threshold}`;
    }
  });
}