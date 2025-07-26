import { textCleaningService } from './src/services/textCleaning.ts';

const testRequest = {
  rawText: [
    {
      id: 'test-1',
      text: 'Teh  quick   brown fox.',
      confidence: 0.8,
      boundingBox: { left: 0, top: 0, width: 100, height: 20 },
      type: 'LINE',
    },
  ],
  cleaningOptions: {
    spellCheck: true,
    removeArtifacts: true,
    normalizeSpacing: true,
  },
};

console.log('Testing text cleaning service...');
textCleaningService.cleanText(testRequest).then(results => {
  console.log('Results:', JSON.stringify(results, null, 2));
}).catch(error => {
  console.error('Error:', error);
});