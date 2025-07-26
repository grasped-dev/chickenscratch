import { textCleaningService } from './src/services/textCleaning.ts';

// Test the removeOCRArtifacts method directly
const testText = 'br0wn f0x d0g';
console.log('Testing character substitution directly...');

// Since the method is private, let's test the public cleanText method with only artifacts enabled
const testRequest = {
  rawText: [
    {
      id: 'test-char',
      text: testText,
      confidence: 0.8,
      boundingBox: { left: 0, top: 0, width: 100, height: 20 },
      type: 'LINE',
    },
  ],
  cleaningOptions: {
    spellCheck: false,
    removeArtifacts: true,
    normalizeSpacing: false,
  },
};

textCleaningService.cleanText(testRequest).then(results => {
  console.log('Input:', testText);
  console.log('Output:', results[0].cleanedText);
  console.log('Corrections:', results[0].corrections);
}).catch(error => {
  console.error('Error:', error);
});