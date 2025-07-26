import OpenAI from 'openai';
import { ClusterRepository } from '../models/ClusterRepository.js';
import { NoteRepository } from '../models/NoteRepository.js';
import { ProjectRepository } from '../models/ProjectRepository.js';
import type { 
  ProjectSummary,
  ThemeSummary,
  ThemeDistribution,
  Quote,
  SummaryMetadata
} from 'chicken-scratch-shared/types/processing';
import type { 
  Cluster,
  Note,
  UpdateProjectInput
} from 'chicken-scratch-shared/types/models';

// Configuration for OpenAI API
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface SummaryRequest {
  projectId: string;
  summaryOptions?: {
    includeQuotes: boolean;
    includeDistribution: boolean;
    maxThemes: number;
    minThemePercentage: number;
  };
}

export class SummaryService {
  private clusterRepository: ClusterRepository;
  private noteRepository: NoteRepository;
  private projectRepository: ProjectRepository;

  constructor() {
    this.clusterRepository = new ClusterRepository();
    this.noteRepository = new NoteRepository();
    this.projectRepository = new ProjectRepository();
  }

  /**
   * Generate comprehensive project summary
   */
  async generateProjectSummary(request: SummaryRequest): Promise<ProjectSummary> {
    const startTime = Date.now();
    
    try {
      // Set default options
      const options = {
        includeQuotes: true,
        includeDistribution: true,
        maxThemes: 10,
        minThemePercentage: 2,
        ...request.summaryOptions
      };

      // Get project clusters and notes
      const clusters = await this.clusterRepository.findByProjectId(request.projectId);
      const allNotes = await this.noteRepository.findByProjectId(request.projectId);

      if (clusters.length === 0 || allNotes.length === 0) {
        throw new Error('No clusters or notes found for project');
      }

      // Calculate theme frequency and importance
      const themeDistribution = this.calculateThemeDistribution(clusters, allNotes);
      
      // Filter themes by minimum percentage
      const significantThemes = themeDistribution.filter(
        theme => theme.percentage >= options.minThemePercentage
      );

      // Generate theme summaries
      const topThemes = await this.generateThemeSummaries(
        clusters,
        allNotes,
        significantThemes.slice(0, options.maxThemes)
      );

      // Extract representative quotes
      const representativeQuotes = options.includeQuotes 
        ? await this.extractRepresentativeQuotes(clusters, allNotes)
        : [];

      // Generate overall insights
      const overallInsights = await this.generateOverallInsights(
        topThemes,
        themeDistribution,
        allNotes.length
      );

      // Create metadata
      const metadata: SummaryMetadata = {
        totalNotes: allNotes.length,
        processingTime: Date.now() - startTime,
        clustersFound: clusters.length,
        averageConfidence: this.calculateAverageConfidence(clusters),
        generatedAt: new Date()
      };

      const summary: ProjectSummary = {
        topThemes,
        overallInsights,
        distribution: options.includeDistribution ? themeDistribution : [],
        representativeQuotes,
        metadata
      };

      // Save summary to project
      await this.saveProjectSummary(request.projectId, summary);

      return summary;
    } catch (error) {
      console.error('Error generating project summary:', error);
      throw error;
    }
  }

  /**
   * Calculate theme frequency and distribution
   */
  private calculateThemeDistribution(
    clusters: Cluster[],
    allNotes: Note[]
  ): ThemeDistribution[] {
    const totalNotes = allNotes.length;
    
    return clusters
      .map(cluster => ({
        theme: cluster.label,
        count: cluster.textBlocks.length,
        percentage: Math.round((cluster.textBlocks.length / totalNotes) * 100 * 100) / 100
      }))
      .sort((a, b) => b.percentage - a.percentage);
  }

  /**
   * Generate detailed theme summaries with key terms and insights
   */
  private async generateThemeSummaries(
    clusters: Cluster[],
    allNotes: Note[],
    themeDistribution: ThemeDistribution[]
  ): Promise<ThemeSummary[]> {
    const noteMap = new Map<string, Note>();
    allNotes.forEach(note => noteMap.set(note.id, note));

    const themeSummaries: ThemeSummary[] = [];

    for (const theme of themeDistribution) {
      const cluster = clusters.find(c => c.label === theme.theme);
      if (!cluster) continue;

      // Get notes for this cluster
      const clusterNotes = cluster.textBlocks
        .map(noteId => noteMap.get(noteId))
        .filter(Boolean) as Note[];

      if (clusterNotes.length === 0) continue;

      // Extract key terms
      const keyTerms = await this.extractKeyTerms(clusterNotes);

      // Find representative quote
      const representativeQuote = this.findRepresentativeQuote(clusterNotes);

      const themeSummary: ThemeSummary = {
        label: cluster.label,
        noteCount: clusterNotes.length,
        percentage: theme.percentage,
        keyTerms,
        representativeQuote
      };

      themeSummaries.push(themeSummary);
    }

    return themeSummaries;
  }

  /**
   * Extract key terms from cluster notes using frequency analysis and LLM
   */
  private async extractKeyTerms(notes: Note[]): Promise<string[]> {
    try {
      // Combine all text from notes
      const combinedText = notes.map(note => note.cleanedText).join(' ');
      
      // Use LLM to extract key terms
      const prompt = `
Analyze the following text and extract the 5-8 most important key terms or phrases that represent the main concepts.

Guidelines:
- Focus on nouns, noun phrases, and important concepts
- Avoid common words like "the", "and", "is"
- Include both single words and short phrases (2-3 words max)
- Prioritize terms that appear frequently or are conceptually important
- Return terms in order of importance

Text to analyze:
${combinedText}

Respond with a JSON array of key terms:
["term1", "term2", "term3", "term4", "term5"]`;

      const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: "You are an expert at text analysis and key term extraction."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 300
      });

      const content = response.choices[0].message?.content || "";
      const keyTerms = this.parseKeyTermsResponse(content);
      
      return keyTerms.slice(0, 8); // Limit to 8 terms
    } catch (error) {
      console.error('Error extracting key terms:', error);
      // Fallback to simple frequency analysis
      return this.extractKeyTermsFrequency(notes);
    }
  }

  /**
   * Parse key terms response from LLM
   */
  private parseKeyTermsResponse(response: string): string[] {
    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/) || response.match(/```json\n([\s\S]*)\n```/);
      const jsonContent = jsonMatch ? jsonMatch[0].replace(/```json\n|```\n|```/g, '') : response;
      const terms = JSON.parse(jsonContent);
      
      if (Array.isArray(terms)) {
        return terms.filter(term => typeof term === 'string' && term.length > 0);
      }
      
      return [];
    } catch (error) {
      console.error('Error parsing key terms response:', error);
      return [];
    }
  }

  /**
   * Fallback key term extraction using frequency analysis
   */
  private extractKeyTermsFrequency(notes: Note[]): string[] {
    const text = notes.map(note => note.cleanedText).join(' ').toLowerCase();
    const words = text.split(/\s+/).filter(word => 
      word.length > 3 && 
      !this.isStopWord(word) &&
      /^[a-zA-Z]+$/.test(word)
    );

    // Count word frequency
    const wordCount = new Map<string, number>();
    words.forEach(word => {
      wordCount.set(word, (wordCount.get(word) || 0) + 1);
    });

    // Sort by frequency and return top terms
    return Array.from(wordCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([word]) => word);
  }

  /**
   * Check if word is a stop word
   */
  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
      'by', 'from', 'up', 'about', 'into', 'through', 'during', 'before',
      'after', 'above', 'below', 'between', 'among', 'this', 'that', 'these',
      'those', 'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves',
      'you', 'your', 'yours', 'yourself', 'yourselves', 'he', 'him', 'his',
      'himself', 'she', 'her', 'hers', 'herself', 'it', 'its', 'itself',
      'they', 'them', 'their', 'theirs', 'themselves', 'what', 'which',
      'who', 'whom', 'whose', 'this', 'that', 'these', 'those', 'am', 'is',
      'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
      'having', 'do', 'does', 'did', 'doing', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'can', 'shall'
    ]);
    
    return stopWords.has(word.toLowerCase());
  }

  /**
   * Find the most representative quote from cluster notes
   */
  private findRepresentativeQuote(notes: Note[]): string {
    if (notes.length === 0) return '';

    // Sort notes by confidence and length to find good representative quote
    const sortedNotes = notes
      .filter(note => note.cleanedText.length >= 10) // Minimum length
      .sort((a, b) => {
        // Prefer higher confidence and moderate length
        const scoreA = a.confidence * 0.7 + (Math.min(a.cleanedText.length, 100) / 100) * 0.3;
        const scoreB = b.confidence * 0.7 + (Math.min(b.cleanedText.length, 100) / 100) * 0.3;
        return scoreB - scoreA;
      });

    return sortedNotes.length > 0 ? sortedNotes[0].cleanedText : notes[0].cleanedText;
  }

  /**
   * Extract representative quotes from all clusters
   */
  private async extractRepresentativeQuotes(
    clusters: Cluster[],
    allNotes: Note[]
  ): Promise<Quote[]> {
    const noteMap = new Map<string, Note>();
    allNotes.forEach(note => noteMap.set(note.id, note));

    const quotes: Quote[] = [];

    for (const cluster of clusters) {
      const clusterNotes = cluster.textBlocks
        .map(noteId => noteMap.get(noteId))
        .filter(Boolean) as Note[];

      if (clusterNotes.length === 0) continue;

      // Find best quotes from this cluster
      const clusterQuotes = await this.findBestQuotes(clusterNotes, cluster.label);
      quotes.push(...clusterQuotes);
    }

    // Sort quotes by confidence and return top ones
    return quotes
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, Math.min(15, clusters.length * 2)); // Max 15 quotes or 2 per cluster
  }

  /**
   * Find best quotes from a cluster
   */
  private async findBestQuotes(notes: Note[], theme: string): Promise<Quote[]> {
    // Filter notes that are good candidates for quotes
    const candidates = notes.filter(note => 
      note.cleanedText.length >= 15 && 
      note.cleanedText.length <= 200 &&
      note.confidence >= 0.6
    );

    if (candidates.length === 0) {
      // Fallback to any available note
      const fallback = notes.find(note => note.cleanedText.length >= 10);
      return fallback ? [{
        text: fallback.cleanedText,
        theme,
        confidence: fallback.confidence,
        source: `Note ${fallback.id.slice(-8)}`
      }] : [];
    }

    // Score candidates based on multiple factors
    const scoredCandidates = candidates.map(note => ({
      note,
      score: this.calculateQuoteScore(note)
    }));

    // Sort by score and take top 2 quotes per cluster
    const topQuotes = scoredCandidates
      .sort((a, b) => b.score - a.score)
      .slice(0, 2)
      .map(({ note }) => ({
        text: note.cleanedText,
        theme,
        confidence: note.confidence,
        source: `Note ${note.id.slice(-8)}`
      }));

    return topQuotes;
  }

  /**
   * Calculate quote quality score
   */
  private calculateQuoteScore(note: Note): number {
    const length = note.cleanedText.length;
    const confidence = note.confidence;
    
    // Prefer moderate length (50-150 chars), high confidence
    const lengthScore = length >= 50 && length <= 150 ? 1.0 : 
                       length >= 30 && length <= 200 ? 0.8 : 0.6;
    
    const confidenceScore = confidence;
    
    // Check for complete sentences
    const sentenceScore = /[.!?]$/.test(note.cleanedText.trim()) ? 1.1 : 1.0;
    
    return lengthScore * 0.4 + confidenceScore * 0.5 + sentenceScore * 0.1;
  }

  /**
   * Generate overall insights using LLM
   */
  private async generateOverallInsights(
    topThemes: ThemeSummary[],
    distribution: ThemeDistribution[],
    totalNotes: number
  ): Promise<string> {
    try {
      // Prepare data for LLM analysis
      const themeData = topThemes.map(theme => ({
        label: theme.label,
        percentage: theme.percentage,
        noteCount: theme.noteCount,
        keyTerms: theme.keyTerms.slice(0, 5),
        quote: theme.representativeQuote.slice(0, 100)
      }));

      const prompt = `
Analyze the following theme analysis results and generate 2-3 key insights about the overall patterns and findings.

Data Summary:
- Total notes analyzed: ${totalNotes}
- Number of themes identified: ${topThemes.length}
- Theme distribution: ${distribution.slice(0, 5).map(d => `${d.theme} (${d.percentage}%)`).join(', ')}

Top Themes:
${themeData.map(theme => `
- ${theme.label} (${theme.percentage}%, ${theme.noteCount} notes)
  Key terms: ${theme.keyTerms.join(', ')}
  Sample: "${theme.quote}..."
`).join('')}

Generate insights that:
1. Identify the most dominant themes and what they reveal
2. Note any interesting patterns or relationships between themes
3. Highlight key takeaways or actionable findings

Keep the response concise (2-3 sentences per insight) and focus on meaningful observations.
Format as a brief paragraph without bullet points.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: "You are an expert analyst who specializes in identifying patterns and insights from thematic data."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.4,
        max_tokens: 500
      });

      return response.choices[0].message?.content?.trim() || 
             this.generateFallbackInsights(topThemes, totalNotes);
    } catch (error) {
      console.error('Error generating overall insights:', error);
      return this.generateFallbackInsights(topThemes, totalNotes);
    }
  }

  /**
   * Generate fallback insights when LLM is unavailable
   */
  private generateFallbackInsights(topThemes: ThemeSummary[], totalNotes: number): string {
    if (topThemes.length === 0) {
      return `Analysis of ${totalNotes} notes revealed diverse content that requires further categorization.`;
    }

    const dominantTheme = topThemes[0];
    const themeCount = topThemes.length;
    
    let insights = `Analysis of ${totalNotes} notes identified ${themeCount} distinct themes. `;
    
    if (dominantTheme.percentage > 30) {
      insights += `The dominant theme "${dominantTheme.label}" represents ${dominantTheme.percentage}% of all content, indicating a strong focus area. `;
    } else if (topThemes.length >= 3 && topThemes[2].percentage > 15) {
      insights += `The content shows balanced distribution across multiple themes, with the top three themes accounting for ${topThemes.slice(0, 3).reduce((sum, t) => sum + t.percentage, 0)}% of all notes. `;
    }

    if (themeCount >= 5) {
      insights += `The diversity of ${themeCount} themes suggests comprehensive coverage of the topic area.`;
    } else {
      insights += `The focused set of ${themeCount} themes indicates clear thematic concentration.`;
    }

    return insights;
  }

  /**
   * Calculate average confidence across all clusters
   */
  private calculateAverageConfidence(clusters: Cluster[]): number {
    if (clusters.length === 0) return 0;
    
    const totalConfidence = clusters.reduce((sum, cluster) => sum + cluster.confidence, 0);
    return Math.round((totalConfidence / clusters.length) * 100) / 100;
  }

  /**
   * Save summary to project
   */
  private async saveProjectSummary(projectId: string, summary: ProjectSummary): Promise<void> {
    const updateData: UpdateProjectInput = {
      summary,
      status: 'completed'
    };
    
    await this.projectRepository.updateById(projectId, updateData);
  }

  /**
   * Get existing project summary
   */
  async getProjectSummary(projectId: string): Promise<ProjectSummary | null> {
    const project = await this.projectRepository.findById(projectId);
    return project?.summary || null;
  }

  /**
   * Update theme importance scores based on user feedback
   */
  async updateThemeImportance(
    projectId: string,
    themeUpdates: Array<{ theme: string; importance: number }>
  ): Promise<ProjectSummary | null> {
    try {
      const currentSummary = await this.getProjectSummary(projectId);
      if (!currentSummary) {
        throw new Error('No summary found for project');
      }

      // Update theme importance and recalculate distribution
      const updatedThemes = currentSummary.topThemes.map(theme => {
        const update = themeUpdates.find(u => u.theme === theme.label);
        return update ? { ...theme, percentage: update.importance } : theme;
      });

      // Normalize percentages to sum to 100
      const totalImportance = updatedThemes.reduce((sum, theme) => sum + theme.percentage, 0);
      if (totalImportance > 0) {
        updatedThemes.forEach(theme => {
          theme.percentage = Math.round((theme.percentage / totalImportance) * 100 * 100) / 100;
        });
      }

      // Update distribution
      const updatedDistribution = updatedThemes.map(theme => ({
        theme: theme.label,
        count: theme.noteCount,
        percentage: theme.percentage
      }));

      const updatedSummary: ProjectSummary = {
        ...currentSummary,
        topThemes: updatedThemes,
        distribution: updatedDistribution
      };

      await this.saveProjectSummary(projectId, updatedSummary);
      return updatedSummary;
    } catch (error) {
      console.error('Error updating theme importance:', error);
      return null;
    }
  }

  /**
   * Generate summary digest in different formats
   */
  async generateSummaryDigest(
    projectId: string,
    format: 'brief' | 'detailed' | 'executive'
  ): Promise<string> {
    const summary = await this.getProjectSummary(projectId);
    if (!summary) {
      throw new Error('No summary found for project');
    }

    switch (format) {
      case 'brief':
        return this.generateBriefDigest(summary);
      case 'detailed':
        return this.generateDetailedDigest(summary);
      case 'executive':
        return this.generateExecutiveDigest(summary);
      default:
        return this.generateBriefDigest(summary);
    }
  }

  /**
   * Generate brief summary digest
   */
  private generateBriefDigest(summary: ProjectSummary): string {
    const topThemes = summary.topThemes.slice(0, 3);
    const themeList = topThemes.map(theme => 
      `${theme.label} (${theme.percentage}%)`
    ).join(', ');

    return `Analysis of ${summary.metadata.totalNotes} notes identified ${summary.topThemes.length} themes. ` +
           `Top themes: ${themeList}. ${summary.overallInsights}`;
  }

  /**
   * Generate detailed summary digest
   */
  private generateDetailedDigest(summary: ProjectSummary): string {
    let digest = `# Summary Analysis\n\n`;
    digest += `**Total Notes:** ${summary.metadata.totalNotes}\n`;
    digest += `**Themes Identified:** ${summary.topThemes.length}\n`;
    digest += `**Analysis Confidence:** ${(summary.metadata.averageConfidence * 100).toFixed(1)}%\n\n`;
    
    digest += `## Key Insights\n${summary.overallInsights}\n\n`;
    
    digest += `## Top Themes\n`;
    summary.topThemes.forEach((theme, index) => {
      digest += `\n### ${index + 1}. ${theme.label} (${theme.percentage}%)\n`;
      digest += `- **Notes:** ${theme.noteCount}\n`;
      digest += `- **Key Terms:** ${theme.keyTerms.join(', ')}\n`;
      digest += `- **Representative Quote:** "${theme.representativeQuote}"\n`;
    });

    if (summary.representativeQuotes.length > 0) {
      digest += `\n## Notable Quotes\n`;
      summary.representativeQuotes.slice(0, 5).forEach(quote => {
        digest += `- "${quote.text}" *(${quote.theme})*\n`;
      });
    }

    return digest;
  }

  /**
   * Generate executive summary digest
   */
  private generateExecutiveDigest(summary: ProjectSummary): string {
    const topTheme = summary.topThemes[0];
    const secondaryThemes = summary.topThemes.slice(1, 4);

    let digest = `## Executive Summary\n\n`;
    digest += `Analysis of ${summary.metadata.totalNotes} notes reveals `;
    
    if (topTheme) {
      digest += `"${topTheme.label}" as the primary focus area, representing ${topTheme.percentage}% of all content. `;
    }
    
    if (secondaryThemes.length > 0) {
      const secondaryList = secondaryThemes.map(t => t.label).join(', ');
      digest += `Secondary themes include ${secondaryList}. `;
    }
    
    digest += `\n\n**Key Findings:**\n${summary.overallInsights}\n\n`;
    
    if (topTheme && topTheme.keyTerms.length > 0) {
      digest += `**Primary Focus Areas:** ${topTheme.keyTerms.slice(0, 5).join(', ')}\n\n`;
    }
    
    digest += `*Analysis completed with ${(summary.metadata.averageConfidence * 100).toFixed(1)}% confidence across ${summary.metadata.clustersFound} thematic clusters.*`;

    return digest;
  }
}