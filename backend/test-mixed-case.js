import { textCleaningService } from './src/services/textCleaning.ts';

const testRequest = {
  rawText: [
    {
      id: 'test-mixed',
      text: 'ThIs Is MiXeD cAsE tExT wItH dEfInAtElY sPeLlInG eRrOrS.',
      confidence: 0.7,
      boundingBox: { left: 0, top: 0, width: 200, height: 20 },
      type: 'LINE',
    },
  ],
  cleaningOptions: {
    spellCheck: true,
    removeArtifacts: true,
    normalizeSpacing: true,
  },
};

console.log('Testing mixed case...');
textCleaningService.cleanText(testRequest).then(results => {
  console.log('Results:', JSON.stringify(results, null, 2));
}).catch(error => {
  console.error('Error:', error);
});