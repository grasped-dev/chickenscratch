import { describe, it, expect, beforeEach } from 'vitest';
import { PerformanceMonitor, Benchmark, MemoryMonitor, RateLimiter } from '../utils/performance.js';

describe('Performance Utilities', () => {
  beforeEach(() => {
    PerformanceMonitor.clearMetrics();
  });

  describe('PerformanceMonitor', () => {
    it('should measure function execution time', async () => {
      const result = await PerformanceMonitor.measure('test-function', async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return 'test-result';
      });

      expect(result).toBe('test-result');
      
      const stats = PerformanceMonitor.getStats('test-function');
      expect(stats.count).toBe(1);
      expect(stats.averageDuration).toBeGreaterThan(40);
      expect(stats.averageDuration).toBeLessThan(100);
    });

    it('should create and use timers', () => {
      const timer = PerformanceMonitor.createTimer('timer-test');
      
      // Simulate some work
      const start = Date.now();
      while (Date.now() - start < 10) {
        // Busy wait
      }
      
      const duration = timer.end();
      expect(duration).toBeGreaterThan(5);
      
      const stats = PerformanceMonitor.getStats('timer-test');
      expect(stats.count).toBe(1);
    });
  });

  describe('Benchmark', () => {
    it('should run benchmark tests', async () => {
      let counter = 0;
      
      const result = await Benchmark.run(
        'counter-increment',
        () => {
          counter++;
          return counter;
        },
        {
          iterations: 100,
          warmupIterations: 10
        }
      );

      expect(result.name).toBe('counter-increment');
      expect(result.iterations).toBe(100);
      expect(result.averageTime).toBeGreaterThan(0);
      expect(result.throughput).toBeGreaterThan(0);
      expect(counter).toBe(110); // 10 warmup + 100 actual
    });
  });

  describe('MemoryMonitor', () => {
    it('should get memory usage', () => {
      const usage = MemoryMonitor.getMemoryUsage();
      
      expect(usage).toHaveProperty('rss');
      expect(usage).toHaveProperty('heapUsed');
      expect(usage).toHaveProperty('heapTotal');
      expect(usage).toHaveProperty('external');
      
      expect(usage.rss).toBeGreaterThan(0);
      expect(usage.heapUsed).toBeGreaterThan(0);
    });
  });

  describe('RateLimiter', () => {
    it('should allow requests within limit', () => {
      const limiter = new RateLimiter(5, 1000); // 5 requests per second
      
      for (let i = 0; i < 5; i++) {
        expect(limiter.isAllowed()).toBe(true);
      }
      
      expect(limiter.isAllowed()).toBe(false);
      expect(limiter.getCurrentCount()).toBe(5);
    });

    it('should reset manually', () => {
      const limiter = new RateLimiter(1, 1000);
      
      expect(limiter.isAllowed()).toBe(true);
      expect(limiter.isAllowed()).toBe(false);
      
      limiter.reset();
      expect(limiter.isAllowed()).toBe(true);
    });
  });
});