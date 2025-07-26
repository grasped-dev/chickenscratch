import { apiClient } from '../utils/api';

export interface ExportOptions {
  format: 'pdf' | 'csv';
  includeImages?: boolean;
  includeMetadata?: boolean;
  groupByTheme?: boolean;
  customBranding?: {
    logo?: string;
    companyName?: string;
    colors?: {
      primary?: string;
      secondary?: string;
    };
  };
}

export interface ExportPreview {
  totalPages?: number;
  totalRows?: number;
  estimatedSize: string;
  themes: string[];
  noteCount: number;
  previewUrl?: string;
}

export interface ExportResult {
  downloadUrl: string;
  filename: string;
  size: number;
  expiresAt: string;
}

export interface ExportTemplate {
  id: string;
  name: string;
  description: string;
  format: 'pdf' | 'csv';
  options: ExportOptions;
}

class ExportService {
  async getExportOptions(): Promise<{
    templates: ExportTemplate[];
    supportedFormats: string[];
    maxFileSize: number;
  }> {
    const response = await apiClient.get<{
      templates: ExportTemplate[];
      supportedFormats: string[];
      maxFileSize: number;
    }>('/export/options');
    return response.data;
  }

  async previewExport(projectId: string, options: ExportOptions): Promise<ExportPreview> {
    const response = await apiClient.post<ExportPreview>(`/export/${projectId}/preview`, options);
    return response.data;
  }

  async generatePDF(projectId: string, options: ExportOptions): Promise<ExportResult> {
    const response = await apiClient.post<ExportResult>(`/export/${projectId}/pdf`, options);
    return response.data;
  }

  async generateAdvancedPDF(projectId: string, options: ExportOptions & {
    template?: string;
    customCSS?: string;
    pageOptions?: {
      format?: 'A4' | 'Letter' | 'Legal';
      orientation?: 'portrait' | 'landscape';
      margin?: {
        top?: string;
        right?: string;
        bottom?: string;
        left?: string;
      };
    };
  }): Promise<ExportResult> {
    const response = await apiClient.post<ExportResult>(`/export/${projectId}/pdf/advanced`, options);
    return response.data;
  }

  async generateCSV(projectId: string, options: ExportOptions & {
    delimiter?: ',' | ';' | '\t';
    includeHeaders?: boolean;
    encoding?: 'utf-8' | 'utf-16' | 'ascii';
  }): Promise<ExportResult> {
    const response = await apiClient.post<ExportResult>(`/export/${projectId}/csv`, options);
    return response.data;
  }

  async downloadFile(downloadUrl: string, filename: string): Promise<void> {
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error('Failed to download file');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  async exportAndDownload(
    projectId: string, 
    options: ExportOptions,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    // Start export
    const result = options.format === 'pdf' 
      ? await this.generatePDF(projectId, options)
      : await this.generateCSV(projectId, options);

    // Simulate progress for download
    if (onProgress) {
      onProgress(50);
    }

    // Download the file
    await this.downloadFile(result.downloadUrl, result.filename);

    if (onProgress) {
      onProgress(100);
    }
  }
}

export const exportService = new ExportService();