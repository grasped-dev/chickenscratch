import { describe, it, expect } from 'vitest';

// Mock environment variables
process.env.OPENAI_API_KEY = 'test-api-key';

describe('Summary Service Basic Tests', () => {
  it('should import summary service without errors', async () => {
    // This test verifies that the service can be imported and instantiated
    const { SummaryService } = await import('../services/summary.js');
    expect(SummaryService).toBeDefined();
    
    // Test that we can create an instance
    const service = new SummaryService();
    expect(service).toBeDefined();
  });

  it('should import summary controller without errors', async () => {
    // This test verifies that the controller can be imported
    const summaryController = await import('../controllers/summary.js');
    expect(summaryController.generateSummary).toBeDefined();
    expect(summaryController.getSummary).toBeDefined();
    expect(summaryController.updateThemeImportance).toBeDefined();
    expect(summaryController.generateDigest).toBeDefined();
    expect(summaryController.getSummaryStats).toBeDefined();
    expect(summaryController.regenerateSummary).toBeDefined();
  });

  it('should have correct route structure', async () => {
    // This test verifies that the routes can be imported
    const summaryRoutes = await import('../routes/summary.js');
    expect(summaryRoutes.default).toBeDefined();
  });
});