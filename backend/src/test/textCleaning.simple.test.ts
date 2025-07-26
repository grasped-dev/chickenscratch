import { describe, it, expect } from 'vitest';
import { textCleaningService } from '../services/textCleaning';
import { TextCleaningRequest, TextBlock } from '../../../shared/src/types/processing.js';

describe('TextCleaningService - Simple Tests', () => {
  const service = textCleaningService;

  describe('Basic functionality', () => {
    it('should clean text with basic corrections', async () => {
      const textBlocks: TextBlock[] = [
        {
          id: 'test-1',
          text: 'Teh  quick   brown fox.',
          confidence: 0.8,
          boundingBox: { left: 0, top: 0, width: 100, height: 20 },
          type: 'LINE',
        },
      ];

      const request: TextCleaningRequest = {
        rawText: textBlocks,
        cleaningOptions: {
          spellCheck: true,
          removeArtifacts: true,
          normalizeSpacing: true,
        },
      };

      const results = await service.cleanText(request);

      expect(results).toHaveLength(1);
      expect(results[0].originalId).toBe('test-1');
      expect(results[0].cleanedText).toBe('the quick brown fox.');
      expect(results[0].corrections.length).toBeGreaterThan(0);
      expect(results[0].confidence).toBeGreaterThan(0);
    });

    it('should handle empty text', async () => {
      const textBlocks: TextBlock[] = [
        {
          id: 'test-empty',
          text: '',
          confidence: 0.0,
          boundingBox: { left: 0, top: 0, width: 0, height: 0 },
          type: 'LINE',
        },
      ];

      const request: TextCleaningRequest = {
        rawText: textBlocks,
        cleaningOptions: {
          spellCheck: true,
          removeArtifacts: true,
          normalizeSpacing: true,
        },
      };

      const results = await service.cleanText(request);

      expect(results).toHaveLength(1);
      expect(results[0].cleanedText).toBe('');
      expect(results[0].corrections).toHaveLength(0);
    });

    it('should preserve region mapping', () => {
      const originalBlocks: TextBlock[] = [
        {
          id: 'test-1',
          text: 'Original text',
          confidence: 0.8,
          boundingBox: { left: 10, top: 20, width: 100, height: 30 },
          type: 'LINE',
        },
      ];

      const cleanedResults = [
        {
          originalId: 'test-1',
          cleanedText: 'Cleaned text',
          corrections: [],
          confidence: 0.8,
        },
      ];

      const mapping = service.preserveRegionMapping(originalBlocks, cleanedResults);

      expect(mapping.has('test-1')).toBe(true);
      expect(mapping.get('test-1')?.originalBoundingBox).toEqual({
        left: 10,
        top: 20,
        width: 100,
        height: 30,
      });
    });

    it('should calculate cleaning statistics', () => {
      const cleanedResults = [
        {
          originalId: 'test-1',
          cleanedText: 'Cleaned text 1',
          corrections: [
            { original: 'teh', corrected: 'the', confidence: 0.9, type: 'spelling' as const },
          ],
          confidence: 0.85,
        },
        {
          originalId: 'test-2',
          cleanedText: 'Cleaned text 2',
          corrections: [
            { original: 'noise', corrected: '', confidence: 0.8, type: 'artifact' as const },
          ],
          confidence: 0.75,
        },
      ];

      const stats = service.getCleaningStats(cleanedResults);

      expect(stats.totalTexts).toBe(2);
      expect(stats.totalCorrections).toBe(2);
      expect(stats.averageConfidence).toBe(0.8);
      expect(stats.correctionsByType.spelling).toBe(1);
      expect(stats.correctionsByType.artifact).toBe(1);
    });
  });
});