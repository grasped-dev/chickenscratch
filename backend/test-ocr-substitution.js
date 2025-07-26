import { textCleaningService } from './src/services/textCleaning.ts';

const testRequest = {
  rawText: [
    {
      id: 'test-ocr',
      text: 'Teh quick br0wn f0x jurnps 0ver teh lazy d0g.',
      confidence: 0.6,
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

console.log('Testing OCR character substitution...');
textCleaningService.cleanText(testRequest).then(results => {
  console.log('Results:', JSON.stringify(results, null, 2));
}).catch(error => {
  console.error('Error:', error);
});