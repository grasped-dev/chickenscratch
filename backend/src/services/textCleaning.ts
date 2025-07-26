import { TextCleaningRequest, CleanedText, TextCorrection, TextBlock } from '../../../shared/src/types/processing.js';

export class TextCleaningService {
  private commonOCRErrors: Map<string, string> = new Map();
  private commonMisspellings: Map<string, string> = new Map();

  constructor() {
    this.initializeOCRErrorMappings();
    this.initializeCommonMisspellings();
  }

  async cleanText(request: TextCleaningRequest): Promise<CleanedText[]> {
    const results: CleanedText[] = [];

    for (const textBlock of request.rawText) {
      const corrections: TextCorrection[] = [];
      let cleanedText = textBlock.text;

      if (request.cleaningOptions.removeArtifacts) {
        const { text: artifactCleanedText, corrections: artifactCorrections } = 
          this.removeOCRArtifacts(cleanedText);
        cleanedText = artifactCleanedText;
        corrections.push(...artifactCorrections);
      }

      if (request.cleaningOptions.normalizeSpacing) {
        const { text: normalizedText, corrections: spacingCorrections } = 
          this.normalizeSpacing(cleanedText);
        cleanedText = normalizedText;
        corrections.push(...spacingCorrections);
      }

      if (request.cleaningOptions.spellCheck) {
        const { text: spellCheckedText, corrections: spellCorrections } = 
          await this.performSpellCheck(cleanedText);
        cleanedText = spellCheckedText;
        corrections.push(...spellCorrections);
      }

      const confidence = this.calculateCleaningConfidence(
        textBlock.confidence,
        corrections,
        textBlock.text,
        cleanedText
      );

      results.push({
        originalId: textBlock.id,
        cleanedText,
        corrections,
        confidence,
      });
    }

    return results;
  }

  private removeOCRArtifacts(text: string): { text: string; corrections: TextCorrection[] } {
    let cleanedText = text;
    const corrections: TextCorrection[] = [];

    for (const [error, correction] of this.commonOCRErrors) {
      if (error.length > 2) {
        const regex = new RegExp(`\\b${this.escapeRegex(error)}\\b`, 'gi');
        if (regex.test(cleanedText)) {
          const original = cleanedText;
          cleanedText = cleanedText.replace(regex, correction);
          
          if (original !== cleanedText) {
            corrections.push({
              original: error,
              corrected: correction,
              confidence: 0.9,
              type: 'artifact',
            });
          }
        }
      }
    }

    const noisePatterns = [
      { pattern: /[@#$%&]/g, replacement: '', desc: 'isolated symbols' },
    ];

    for (const { pattern, replacement, desc } of noisePatterns) {
      if (pattern.test(cleanedText)) {
        const original = cleanedText;
        cleanedText = cleanedText.replace(pattern, replacement);
        
        if (original !== cleanedText) {
          corrections.push({
            original: desc,
            corrected: 'removed/normalized',
            confidence: 0.8,
            type: 'artifact',
          });
        }
      }
    }

    return { text: cleanedText, corrections };
  }

  private escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private normalizeSpacing(text: string): { text: string; corrections: TextCorrection[] } {
    let normalizedText = text;
    const corrections: TextCorrection[] = [];
    const original = text;

    normalizedText = normalizedText.replace(/\s{2,}/g, ' ');
    normalizedText = normalizedText.replace(/\s+([,.!?;:])/g, '$1');
    normalizedText = normalizedText.replace(/([,.!?;:])\s*([a-zA-Z])/g, '$1 $2');
    normalizedText = normalizedText.trim();

    if (original !== normalizedText) {
      corrections.push({
        original: 'spacing issues',
        corrected: 'normalized spacing',
        confidence: 1.0,
        type: 'spacing',
      });
    }

    return { text: normalizedText, corrections };
  }

  private async performSpellCheck(text: string): Promise<{ text: string; corrections: TextCorrection[] }> {
    const corrections: TextCorrection[] = [];
    let correctedText = text;

    for (const [misspelling, correction] of this.commonMisspellings) {
      const regex = new RegExp(`\\b${this.escapeRegex(misspelling)}\\b`, 'gi');
      const matches = correctedText.match(regex);
      
      if (matches) {
        correctedText = correctedText.replace(regex, correction);
        
        corrections.push({
          original: misspelling,
          corrected: correction,
          confidence: 0.9,
          type: 'spelling',
        });
      }
    }

    return { text: correctedText, corrections };
  }

  private calculateCleaningConfidence(
    originalConfidence: number,
    corrections: TextCorrection[],
    originalText: string,
    cleanedText: string
  ): number {
    let confidence = originalConfidence;
    const totalCorrections = corrections.length;

    if (totalCorrections === 0) {
      return confidence;
    }

    const textLength = originalText.length;
    const correctionRatio = totalCorrections / Math.max(textLength / 10, 1);
    const avgCorrectionConfidence = corrections.reduce((sum, c) => sum + c.confidence, 0) / totalCorrections;

    if (correctionRatio > 0.5) {
      confidence = Math.max(confidence * 0.7, 0.3);
    } else {
      confidence = Math.min(confidence + (avgCorrectionConfidence - confidence) * 0.3, 0.95);
    }

    return Math.round(confidence * 100) / 100;
  }

  preserveRegionMapping(
    originalBlocks: TextBlock[],
    cleanedResults: CleanedText[]
  ): Map<string, { originalBoundingBox: any; cleanedText: string }> {
    const mapping = new Map();

    for (let i = 0; i < originalBlocks.length && i < cleanedResults.length; i++) {
      const originalBlock = originalBlocks[i];
      const cleanedResult = cleanedResults[i];

      mapping.set(cleanedResult.originalId, {
        originalBoundingBox: originalBlock.boundingBox,
        cleanedText: cleanedResult.cleanedText,
      });
    }

    return mapping;
  }

  private initializeOCRErrorMappings(): void {
    this.commonOCRErrors = new Map([
      ['teh', 'the'], ['adn', 'and'], ['hte', 'the'], ['taht', 'that'],
      ['thier', 'their'], ['recieve', 'receive'], ['seperate', 'separate'],
      ['definately', 'definitely'], ['occured', 'occurred'], ['begining', 'beginning'],
      ['beleive', 'believe'], ['acheive', 'achieve'], ['recieved', 'received'],
    ]);
  }

  private initializeCommonMisspellings(): void {
    this.commonMisspellings = new Map([
      ['accomodate', 'accommodate'],
      ['acheive', 'achieve'],
      ['begining', 'beginning'],
      ['beleive', 'believe'],
      ['definately', 'definitely'],
      ['recieve', 'receive'],
      ['seperate', 'separate'],
      ['thier', 'their'],
    ]);
  }

  async cleanTextBatch(requests: TextCleaningRequest[]): Promise<CleanedText[][]> {
    const results: CleanedText[][] = [];
    const concurrencyLimit = 10;
    const chunks = this.chunkArray(requests, concurrencyLimit);

    for (const chunk of chunks) {
      const chunkPromises = chunk.map(request => this.cleanText(request));
      const chunkResults = await Promise.all(chunkPromises);
      results.push(...chunkResults);
    }

    return results;
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  getCleaningStats(cleanedResults: CleanedText[]): {
    totalTexts: number;
    totalCorrections: number;
    averageConfidence: number;
    correctionsByType: Record<string, number>;
  } {
    const totalTexts = cleanedResults.length;
    let totalCorrections = 0;
    let totalConfidence = 0;
    const correctionsByType: Record<string, number> = {
      spelling: 0,
      artifact: 0,
      spacing: 0,
    };

    for (const result of cleanedResults) {
      totalCorrections += result.corrections.length;
      totalConfidence += result.confidence;

      for (const correction of result.corrections) {
        correctionsByType[correction.type] = (correctionsByType[correction.type] || 0) + 1;
      }
    }

    return {
      totalTexts,
      totalCorrections,
      averageConfidence: totalTexts > 0 ? totalConfidence / totalTexts : 0,
      correctionsByType,
    };
  }
}

export const textCleaningService = new TextCleaningService();
