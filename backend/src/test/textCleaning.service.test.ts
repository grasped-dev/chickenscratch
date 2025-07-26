import { describe, it, expect, beforeEach } from 'vitest';
import { TextCleaningService, textCleaningService } from '../services/textCleaning.js';
import { TextCleaningRequest, TextBlock } from '../../../shared/src/types/processing.js';

describe('TextCleaningService', () => {
  let service: TextCleaningService;

  beforeEach(() => {
    service = textCleaningService;
  });

  describe('cleanText', () => {
    it('should clean text with all options enabled', async () => {
      const textBlocks: TextBlock[] = [
        {
          id: 'test-1',
          text: 'Teh  quick   brown fox jumps over teh lazy dog.',
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
      expect(results[0].cleanedText).toBe('the quick brown fox jumps over the lazy dog.');
      expect(results[0].corrections).toHaveLength(2); // 1 artifact + 1 spacing
      expect(results[0].confidence).toBeGreaterThan(0);
    });

    it('should handle OCR artifacts removal', async () => {
      const textBlocks: TextBlock[] = [
        {
          id: 'test-artifact',
          text: 'Hello@#$%World!!!....',
          confidence: 0.7,
          boundingBox: { left: 0, top: 0, width: 100, height: 20 },
          type: 'LINE',
        },
      ];

      const request: TextCleaningRequest = {
        rawText: textBlocks,
        cleaningOptions: {
          spellCheck: false,
          removeArtifacts: true,
          normalizeSpacing: false,
        },
      };

      const results = await service.cleanText(request);

      expect(results[0].cleanedText).not.toContain('@#$%');
      expect(results[0].corrections.some(c => c.type === 'artifact')).toBe(true);
    });

    it('should normalize spacing correctly', async () => {
      const textBlocks: TextBlock[] = [
        {
          id: 'test-spacing',
          text: 'Hello    world  ,  how   are you ?',
          confidence: 0.9,
          boundingBox: { left: 0, top: 0, width: 100, height: 20 },
          type: 'LINE',
        },
      ];

      const request: TextCleaningRequest = {
        rawText: textBlocks,
        cleaningOptions: {
          spellCheck: false,
          removeArtifacts: false,
          normalizeSpacing: true,
        },
      };

      const results = await service.cleanText(request);

      expect(results[0].cleanedText).toBe('Hello world, how are you?');
      expect(results[0].corrections.some(c => c.type === 'spacing')).toBe(true);
    });

    it('should perform spell checking', async () => {
      const textBlocks: TextBlock[] = [
        {
          id: 'test-spelling',
          text: 'I beleive this is definately correct.',
          confidence: 0.8,
          boundingBox: { left: 0, top: 0, width: 100, height: 20 },
          type: 'LINE',
        },
      ];

      const request: TextCleaningRequest = {
        rawText: textBlocks,
        cleaningOptions: {
          spellCheck: true,
          removeArtifacts: false,
          normalizeSpacing: false,
        },
      };

      const results = await service.cleanText(request);

      expect(results[0].cleanedText).toBe('I believe this is definitely correct.');
      expect(results[0].corrections.some(c => c.type === 'spelling')).toBe(true);
      expect(results[0].corrections.filter(c => c.type === 'spelling')).toHaveLength(2);
    });

    it('should handle empty text blocks', async () => {
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

    it('should handle text with no corrections needed', async () => {
      const textBlocks: TextBlock[] = [
        {
          id: 'test-clean',
          text: 'This text is already perfect and correct.',
          confidence: 0.95,
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

      expect(results[0].cleanedText).toBe('This text is already perfect and correct.');
      expect(results[0].corrections).toHaveLength(0);
      expect(results[0].confidence).toBe(0.95);
    });

    it('should handle multiple text blocks', async () => {
      const textBlocks: TextBlock[] = [
        {
          id: 'test-1',
          text: 'First  line with  spacing issues.',
          confidence: 0.8,
          boundingBox: { left: 0, top: 0, width: 100, height: 20 },
          type: 'LINE',
        },
        {
          id: 'test-2',
          text: 'Second line with definately spelling errors.',
          confidence: 0.7,
          boundingBox: { left: 0, top: 25, width: 100, height: 20 },
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

      expect(results).toHaveLength(2);
      expect(results[0].cleanedText).toBe('First line with spacing issues.');
      expect(results[1].cleanedText).toBe('Second line with definitely spelling errors.');
    });

    it('should handle common OCR character substitutions', async () => {
      const textBlocks: TextBlock[] = [
        {
          id: 'test-ocr',
          text: 'Teh quick br0wn f0x jurnps 0ver teh lazy d0g.',
          confidence: 0.6,
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

      expect(results[0].cleanedText).toContain('the');
      expect(results[0].cleanedText).toContain('brown');
      expect(results[0].cleanedText).toContain('fox');
      expect(results[0].cleanedText).toContain('over');
      expect(results[0].cleanedText).toContain('the');
      expect(results[0].cleanedText).toContain('dog');
    });

    it('should adjust confidence based on corrections', async () => {
      const textBlocks: TextBlock[] = [
        {
          id: 'test-confidence-high',
          text: 'Perfect text with no errors.',
          confidence: 0.9,
          boundingBox: { left: 0, top: 0, width: 100, height: 20 },
          type: 'LINE',
        },
        {
          id: 'test-confidence-low',
          text: 'Terribl3 t3xt w1th m4ny 3rr0rs.',
          confidence: 0.5,
          boundingBox: { left: 0, top: 25, width: 100, height: 20 },
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

      // Text with no corrections should maintain high confidence
      expect(results[0].confidence).toBeGreaterThanOrEqual(0.9);
      
      // Text with many corrections should have adjusted confidence
      expect(results[1].confidence).toBeLessThan(0.9);
    });
  });

  describe('preserveRegionMapping', () => {
    it('should preserve bounding box mapping for cleaned text', () => {
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
      expect(mapping.get('test-1')?.cleanedText).toBe('Cleaned text');
    });
  });

  describe('cleanTextBatch', () => {
    it('should process multiple cleaning requests in batch', async () => {
      const requests: TextCleaningRequest[] = [
        {
          rawText: [
            {
              id: 'batch-1',
              text: 'First  batch  text.',
              confidence: 0.8,
              boundingBox: { left: 0, top: 0, width: 100, height: 20 },
              type: 'LINE',
            },
          ],
          cleaningOptions: {
            spellCheck: false,
            removeArtifacts: false,
            normalizeSpacing: true,
          },
        },
        {
          rawText: [
            {
              id: 'batch-2',
              text: 'Second batch with definately errors.',
              confidence: 0.7,
              boundingBox: { left: 0, top: 25, width: 100, height: 20 },
              type: 'LINE',
            },
          ],
          cleaningOptions: {
            spellCheck: true,
            removeArtifacts: false,
            normalizeSpacing: false,
          },
        },
      ];

      const results = await service.cleanTextBatch(requests);

      expect(results).toHaveLength(2);
      expect(results[0]).toHaveLength(1);
      expect(results[1]).toHaveLength(1);
      expect(results[0][0].cleanedText).toBe('First batch text.');
      expect(results[1][0].cleanedText).toBe('Second batch with definitely errors.');
    });
  });

  describe('getCleaningStats', () => {
    it('should calculate cleaning statistics correctly', () => {
      const cleanedResults = [
        {
          originalId: 'test-1',
          cleanedText: 'Cleaned text 1',
          corrections: [
            { original: 'teh', corrected: 'the', confidence: 0.9, type: 'spelling' as const },
            { original: '  ', corrected: ' ', confidence: 1.0, type: 'spacing' as const },
          ],
          confidence: 0.85,
        },
        {
          originalId: 'test-2',
          cleanedText: 'Cleaned text 2',
          corrections: [
            { original: '@#$', corrected: '', confidence: 0.8, type: 'artifact' as const },
          ],
          confidence: 0.75,
        },
      ];

      const stats = service.getCleaningStats(cleanedResults);

      expect(stats.totalTexts).toBe(2);
      expect(stats.totalCorrections).toBe(3);
      expect(stats.averageConfidence).toBe(0.8);
      expect(stats.correctionsByType.spelling).toBe(1);
      expect(stats.correctionsByType.spacing).toBe(1);
      expect(stats.correctionsByType.artifact).toBe(1);
    });

    it('should handle empty results', () => {
      const stats = service.getCleaningStats([]);

      expect(stats.totalTexts).toBe(0);
      expect(stats.totalCorrections).toBe(0);
      expect(stats.averageConfidence).toBe(0);
      expect(stats.correctionsByType.spelling).toBe(0);
      expect(stats.correctionsByType.spacing).toBe(0);
      expect(stats.correctionsByType.artifact).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle text with only punctuation', async () => {
      const textBlocks: TextBlock[] = [
        {
          id: 'test-punct',
          text: '!@#$%^&*()',
          confidence: 0.3,
          boundingBox: { left: 0, top: 0, width: 50, height: 20 },
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
      expect(results[0].cleanedText.length).toBeLessThan(textBlocks[0].text.length);
    });

    it('should handle very long text', async () => {
      const longText = 'This is a very long text that contains many words and should be processed correctly even though it is quite lengthy and might contain various types of errors including spelling mistakes like definately and spacing  issues  and maybe some artifacts.';
      
      const textBlocks: TextBlock[] = [
        {
          id: 'test-long',
          text: longText,
          confidence: 0.8,
          boundingBox: { left: 0, top: 0, width: 500, height: 100 },
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
      expect(results[0].cleanedText).toContain('definitely');
      expect(results[0].cleanedText).not.toMatch(/\s{2,}/); // No multiple spaces
    });

    it('should handle text with mixed case', async () => {
      const textBlocks: TextBlock[] = [
        {
          id: 'test-case',
          text: 'ThIs Is MiXeD cAsE tExT wItH dEfInAtElY sPeLlInG eRrOrS.',
          confidence: 0.7,
          boundingBox: { left: 0, top: 0, width: 200, height: 20 },
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

      expect(results[0].cleanedText).toContain('definitely');
      expect(results[0].corrections.some(c => c.type === 'spelling')).toBe(true);
    });

    it('should handle text with numbers and special characters', async () => {
      const textBlocks: TextBlock[] = [
        {
          id: 'test-mixed',
          text: 'Meeting on 12/25/2023 at 3:30 PM - discuss Q4 results & plan for 2024.',
          confidence: 0.9,
          boundingBox: { left: 0, top: 0, width: 300, height: 20 },
          type: 'LINE',
        },
      ];

      const request: TextCleaningRequest = {
        rawText: textBlocks,
        cleaningOptions: {
          spellCheck: true,
          removeArtifacts: false, // Don't remove legitimate special chars
          normalizeSpacing: true,
        },
      };

      const results = await service.cleanText(request);

      expect(results[0].cleanedText).toContain('12/25/2023');
      expect(results[0].cleanedText).toContain('3:30');
      expect(results[0].cleanedText).toContain('Q4');
      expect(results[0].cleanedText).toContain('&');
    });
  });
});