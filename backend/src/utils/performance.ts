import { performance } from 'perf_hooks';

// Safe logger that works in test environments
const safeLogger = {
  info: (message: string, meta?: any) => {
    if (typeof console !== 'undefined') {
      console.log(`[INFO] ${message}`, meta || '');
    }
  },
  warn: (message: string, meta?: any) => {
    if (typeof console !== 'undefined') {
      console.warn(`[WARN] ${message}`, meta || '');
    }
  },
  error: (message: string, meta?: any) => {
    if (typeof console !== 'undefined') {
      console.error(`[ERROR] ${message}`, meta || '');
    }
  },
  debug: (message: string, meta?: any) => {
    if (typeof console !== 'undefined') {
      console.debug(`[DEBUG] ${message}`, meta || '');
    }
  }
};

export interface PerformanceMetric {
  name: string;
  duration: number;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface BenchmarkResult {
  name: string;
  iterations: number;
  totalTime: number;
  averageTime: number;
  minTime: number;
  maxTime: number;
  throughput: number;
  metadata?: Record<string, any>;
}

export class PerformanceMonitor {
  private static metrics: PerformanceMetric[] = [];
  private static readonly MAX_METRICS = 1000;

  /**
   * Measure execution time of a function
   */
  static async measure<T>(
    name: string,
    fn: () => Promise<T> | T,
    metadata?: Record<string, any>
  ): Promise<T> {
    const start = performance.now();
    
    try {
      const result = await fn();
      const duration = performance.now() - start;
      
      this.recordMetric({
        name,
        duration,
        timestamp: new Date(),
        metadata
      });

      // Log slow operations
      if (duration > 1000) {
        safeLogger.warn(`Slow operation detected: ${name}`, {
          duration: `${duration.toFixed(2)}ms`,
          metadata
        });
      }

      return result;
    } catch (error) {
      const duration = performance.now() - start;
      
      this.recordMetric({
        name: `${name}_error`,
        duration,
        timestamp: new Date(),
        metadata: { ...metadata, error: error.message }
      });

      throw error;
    }
  }

  /**
   * Create a performance timer
   */
  static createTimer(name: string, metadata?: Record<string, any>) {
    const start = performance.now();
    
    return {
      end: () => {
        const duration = performance.now() - start;
        this.recordMetric({
          name,
          duration,
          timestamp: new Date(),
          metadata
        });
        return duration;
      }
    };
  }

  /**
   * Record a performance metric
   */
  static recordMetric(metric: PerformanceMetric): void {
    this.metrics.push(metric);
    
    // Keep only the most recent metrics
    if (this.metrics.length > this.MAX_METRICS) {
      this.metrics = this.metrics.slice(-this.MAX_METRICS);
    }

    // Cache metric for real-time monitoring (if cache service is available)
    // Use setImmediate to avoid blocking
    setImmediate(async () => {
      try {
        const { cacheService } = await import('../services/cache.js');
        await cacheService.set(`perf:${metric.name}:${Date.now()}`, metric, { ttl: 3600 });
      } catch {
        // Cache service not available, skip caching
      }
    });
  }

  /**
   * Get performance statistics
   */
  static getStats(name?: string): {
    count: number;
    averageDuration: number;
    minDuration: number;
    maxDuration: number;
    totalDuration: number;
  } {
    const filteredMetrics = name 
      ? this.metrics.filter(m => m.name === name)
      : this.metrics;

    if (filteredMetrics.length === 0) {
      return {
        count: 0,
        averageDuration: 0,
        minDuration: 0,
        maxDuration: 0,
        totalDuration: 0
      };
    }

    const durations = filteredMetrics.map(m => m.duration);
    const totalDuration = durations.reduce((sum, d) => sum + d, 0);

    return {
      count: filteredMetrics.length,
      averageDuration: totalDuration / filteredMetrics.length,
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      totalDuration
    };
  }

  /**
   * Get recent metrics
   */
  static getRecentMetrics(limit: number = 100): PerformanceMetric[] {
    return this.metrics.slice(-limit);
  }

  /**
   * Clear all metrics
   */
  static clearMetrics(): void {
    this.metrics = [];
  }

  /**
   * Export metrics for analysis
   */
  static exportMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }
}

/**
 * Benchmark utility for performance testing
 */
export class Benchmark {
  /**
   * Run a benchmark test
   */
  static async run<T>(
    name: string,
    fn: () => Promise<T> | T,
    options: {
      iterations?: number;
      warmupIterations?: number;
      timeout?: number;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<BenchmarkResult> {
    const {
      iterations = 100,
      warmupIterations = 10,
      timeout = 30000,
      metadata = {}
    } = options;

    safeLogger.info(`Starting benchmark: ${name}`, {
      iterations,
      warmupIterations
    });

    // Warmup runs
    for (let i = 0; i < warmupIterations; i++) {
      await fn();
    }

    const times: number[] = [];
    const startTime = performance.now();

    // Actual benchmark runs
    for (let i = 0; i < iterations; i++) {
      const iterationStart = performance.now();
      
      // Check timeout
      if (performance.now() - startTime > timeout) {
        safeLogger.warn(`Benchmark timeout reached for ${name} after ${i} iterations`);
        break;
      }

      await fn();
      times.push(performance.now() - iterationStart);
    }

    const totalTime = times.reduce((sum, time) => sum + time, 0);
    const averageTime = totalTime / times.length;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const throughput = 1000 / averageTime; // operations per second

    const result: BenchmarkResult = {
      name,
      iterations: times.length,
      totalTime,
      averageTime,
      minTime,
      maxTime,
      throughput,
      metadata
    };

    safeLogger.info(`Benchmark completed: ${name}`, {
      iterations: result.iterations,
      averageTime: `${result.averageTime.toFixed(2)}ms`,
      throughput: `${result.throughput.toFixed(2)} ops/sec`
    });

    return result;
  }

  /**
   * Compare multiple benchmark results
   */
  static compare(results: BenchmarkResult[]): {
    fastest: BenchmarkResult;
    slowest: BenchmarkResult;
    comparisons: Array<{
      name: string;
      relativeThroughput: number;
      relativeTime: number;
    }>;
  } {
    if (results.length === 0) {
      throw new Error('No benchmark results to compare');
    }

    const fastest = results.reduce((prev, current) => 
      current.throughput > prev.throughput ? current : prev
    );

    const slowest = results.reduce((prev, current) => 
      current.throughput < prev.throughput ? current : prev
    );

    const comparisons = results.map(result => ({
      name: result.name,
      relativeThroughput: result.throughput / fastest.throughput,
      relativeTime: result.averageTime / fastest.averageTime
    }));

    return {
      fastest,
      slowest,
      comparisons
    };
  }
}

/**
 * Memory usage monitoring
 */
export class MemoryMonitor {
  /**
   * Get current memory usage
   */
  static getMemoryUsage(): NodeJS.MemoryUsage {
    return process.memoryUsage();
  }

  /**
   * Monitor memory usage during function execution
   */
  static async monitorMemory<T>(
    name: string,
    fn: () => Promise<T> | T
  ): Promise<{
    result: T;
    memoryDelta: {
      rss: number;
      heapUsed: number;
      heapTotal: number;
      external: number;
    };
  }> {
    const initialMemory = this.getMemoryUsage();
    
    const result = await fn();
    
    const finalMemory = this.getMemoryUsage();
    const memoryDelta = {
      rss: finalMemory.rss - initialMemory.rss,
      heapUsed: finalMemory.heapUsed - initialMemory.heapUsed,
      heapTotal: finalMemory.heapTotal - initialMemory.heapTotal,
      external: finalMemory.external - initialMemory.external
    };

    safeLogger.debug(`Memory usage for ${name}:`, {
      delta: memoryDelta,
      final: finalMemory
    });

    return {
      result,
      memoryDelta
    };
  }

  /**
   * Check for memory leaks
   */
  static checkMemoryLeak(threshold: number = 100 * 1024 * 1024): boolean {
    const usage = this.getMemoryUsage();
    const isLeaking = usage.heapUsed > threshold;
    
    if (isLeaking) {
      safeLogger.warn('Potential memory leak detected:', {
        heapUsed: `${(usage.heapUsed / 1024 / 1024).toFixed(2)}MB`,
        threshold: `${(threshold / 1024 / 1024).toFixed(2)}MB`
      });
    }

    return isLeaking;
  }
}

/**
 * Performance decorator
 */
export function performanceMonitor(name?: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    const metricName = name || `${target.constructor.name}.${propertyName}`;

    descriptor.value = async function (...args: any[]) {
      return PerformanceMonitor.measure(
        metricName,
        () => method.apply(this, args),
        { className: target.constructor.name, methodName: propertyName }
      );
    };
  };
}

/**
 * Rate limiter for performance testing
 */
export class RateLimiter {
  private requests: number[] = [];

  constructor(
    private maxRequests: number,
    private windowMs: number
  ) {}

  /**
   * Check if request is allowed
   */
  isAllowed(): boolean {
    const now = Date.now();
    
    // Remove old requests outside the window
    this.requests = this.requests.filter(time => now - time < this.windowMs);
    
    if (this.requests.length >= this.maxRequests) {
      return false;
    }

    this.requests.push(now);
    return true;
  }

  /**
   * Get current request count
   */
  getCurrentCount(): number {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < this.windowMs);
    return this.requests.length;
  }

  /**
   * Reset the rate limiter
   */
  reset(): void {
    this.requests = [];
  }
}