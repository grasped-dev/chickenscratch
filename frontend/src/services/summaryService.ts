import { apiClient } from '../utils/api';
import type { ProjectSummary } from '../../../shared/src/types/processing';

export interface SummaryGenerationRequest {
  includeInsights?: boolean;
  maxThemes?: number;
  minConfidence?: number;
  customPrompt?: string;
}

export interface SummaryStats {
  totalNotes: number;
  totalClusters: number;
  averageConfidence: number;
  processingTime: number;
  topThemes: Array<{
    label: string;
    noteCount: number;
    percentage: number;
  }>;
}

export interface SummaryDigest {
  format: 'brief' | 'detailed' | 'executive';
  content: string;
  wordCount: number;
  generatedAt: string;
}

export interface ThemeImportanceUpdate {
  clusterId: string;
  importance: number;
  reason?: string;
}

class SummaryService {
  async generateSummary(projectId: string, options?: SummaryGenerationRequest): Promise<ProjectSummary> {
    const response = await apiClient.post<ProjectSummary>('/summary/generate', {
      projectId,
      ...options,
    });
    return response.data;
  }

  async getSummary(projectId: string): Promise<ProjectSummary> {
    const response = await apiClient.get<ProjectSummary>(`/summary/${projectId}`);
    return response.data;
  }

  async getSummaryStats(projectId: string): Promise<SummaryStats> {
    const response = await apiClient.get<SummaryStats>(`/summary/${projectId}/stats`);
    return response.data;
  }

  async updateThemeImportance(updates: ThemeImportanceUpdate[]): Promise<void> {
    await apiClient.put('/summary/theme-importance', { updates });
  }

  async generateDigest(
    projectId: string, 
    format: 'brief' | 'detailed' | 'executive' = 'brief'
  ): Promise<SummaryDigest> {
    const response = await apiClient.post<SummaryDigest>('/summary/digest', {
      projectId,
      format,
    });
    return response.data;
  }

  async regenerateSummary(
    projectId: string, 
    options?: SummaryGenerationRequest & {
      preserveCustomLabels?: boolean;
      recalculateClusters?: boolean;
    }
  ): Promise<ProjectSummary> {
    const response = await apiClient.post<ProjectSummary>(`/summary/${projectId}/regenerate`, options);
    return response.data;
  }

  async compareSummaries(projectIds: string[]): Promise<{
    commonThemes: string[];
    uniqueThemes: Record<string, string[]>;
    overallInsights: string;
    projects: Array<{
      id: string;
      name: string;
      summary: ProjectSummary;
    }>;
  }> {
    const summaries = await Promise.all(
      projectIds.map(async (id) => {
        const summary = await this.getSummary(id);
        return { id, summary };
      })
    );

    // Simple comparison logic (could be enhanced)
    const allThemes = summaries.flatMap(s => s.summary.topThemes.map(t => t.label));
    const themeCount = allThemes.reduce((acc, theme) => {
      acc[theme] = (acc[theme] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const commonThemes = Object.entries(themeCount)
      .filter(([, count]) => count > 1)
      .map(([theme]) => theme);

    const uniqueThemes = summaries.reduce((acc, { id, summary }) => {
      const unique = summary.topThemes
        .map(t => t.label)
        .filter(theme => !commonThemes.includes(theme));
      if (unique.length > 0) {
        acc[id] = unique;
      }
      return acc;
    }, {} as Record<string, string[]>);

    return {
      commonThemes,
      uniqueThemes,
      overallInsights: `Analysis of ${projectIds.length} projects reveals ${commonThemes.length} common themes and varying unique insights across projects.`,
      projects: summaries.map(s => ({ 
        id: s.id, 
        name: `Project ${s.id}`, // Would need project name from API
        summary: s.summary 
      })),
    };
  }
}

export const summaryService = new SummaryService();