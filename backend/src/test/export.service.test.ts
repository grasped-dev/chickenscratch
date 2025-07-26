import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ExportService, ExportOptions, BrandingOptions, CSVExportOptions } from '../services/export.js';
import { Project, ProcessedImage } from 'chicken-scratch-shared/types/models';
import { ProjectSummary } from 'chicken-scratch-shared/types/processing';
import fs from 'fs/promises';
import puppeteer from 'puppeteer';

// Mock dependencies
vi.mock('fs/promises');
vi.mock('puppeteer');

describe('ExportService', () => {
  const mockProject: Project = {
    id: 'project-123',
    userId: 'user-123',
    name: 'Test Project',
    description: 'A test project for PDF export',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    status: 'completed',
    imageCount: 2,
    summary: {
      topThemes: [
        {
          label: 'User Experience',
          noteCount: 5,
          percentage: 45.5,
          keyTerms: ['UX', 'design', 'user'],
          representativeQuote: 'Users need better navigation'
        },
        {
          label: 'Performance',
          noteCount: 3,
          percentage: 27.3,
          keyTerms: ['speed', 'optimization', 'performance'],
          representativeQuote: 'App needs to load faster'
        }
      ],
      overallInsights: 'The project focuses on improving user experience and performance.',
      distribution: [
        { theme: 'User Experience', count: 5, percentage: 45.5 },
        { theme: 'Performance', count: 3, percentage: 27.3 }
      ],
      representativeQuotes: [
        {
          text: 'Users need better navigation',
          theme: 'User Experience',
          confidence: 0.9,
          source: 'note-1'
        },
        {
          text: 'App needs to load faster',
          theme: 'Performance',
          confidence: 0.85,
          source: 'note-2'
        }
      ],
      metadata: {
        totalNotes: 8,
        processingTime: 1500,
        clustersFound: 2,
        averageConfidence: 0.875,
        generatedAt: new Date('2024-01-01')
      }
    }
  };

  const mockImages: ProcessedImage[] = [
    {
      id: 'image-1',
      projectId: 'project-123',
      originalUrl: 'https://example.com/image1.jpg',
      filename: 'notes1.jpg',
      fileSize: 1024000,
      mimeType: 'image/jpeg',
      uploadedAt: new Date('2024-01-01'),
      processingStatus: 'completed',
      boundingBoxes: [],
      ocrResults: {
        extractedText: [],
        boundingBoxes: [],
        confidence: 0.9,
        processingTime: 500
      }
    }
  ];

  const defaultOptions: ExportOptions = {
    includeSummary: true,
    includeOriginalText: false,
    includeImages: true
  };

  const customBranding: BrandingOptions = {
    companyName: 'Test Company',
    primaryColor: '#2563eb',
    secondaryColor: '#64748b',
    fontFamily: 'Arial'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock fs operations
    vi.mocked(fs.access).mockResolvedValue(undefined);
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.readdir).mockResolvedValue([]);
    vi.mocked(fs.stat).mockResolvedValue({
      mtime: new Date()
    } as any);
    vi.mocked(fs.unlink).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('generatePDF', () => {
    it('should generate PDF with default options', async () => {
      const result = await ExportService.generatePDF(
        mockProject,
        mockProject.summary!,
        mockImages,
        defaultOptions
      );

      expect(result).toHaveProperty('buffer');
      expect(result).toHaveProperty('filename');
      expect(result).toHaveProperty('size');
      expect(result).toHaveProperty('generatedAt');
      expect(result.filename).toBe('Test_Project_report.pdf');
      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.size).toBeGreaterThan(0);
    });

    it('should generate PDF with custom branding', async () => {
      const optionsWithBranding: ExportOptions = {
        ...defaultOptions,
        branding: customBranding
      };

      const result = await ExportService.generatePDF(
        mockProject,
        mockProject.summary!,
        mockImages,
        optionsWithBranding
      );

      expect(result).toHaveProperty('buffer');
      expect(result.filename).toBe('Test_Project_report.pdf');
      expect(result.buffer).toBeInstanceOf(Buffer);
    });

    it('should generate PDF without summary when option is false', async () => {
      const optionsWithoutSummary: ExportOptions = {
        ...defaultOptions,
        includeSummary: false
      };

      const result = await ExportService.generatePDF(
        mockProject,
        mockProject.summary!,
        mockImages,
        optionsWithoutSummary
      );

      expect(result).toHaveProperty('buffer');
      expect(result.buffer).toBeInstanceOf(Buffer);
    });

    it('should generate PDF without images when option is false', async () => {
      const optionsWithoutImages: ExportOptions = {
        ...defaultOptions,
        includeImages: false
      };

      const result = await ExportService.generatePDF(
        mockProject,
        mockProject.summary!,
        [],
        optionsWithoutImages
      );

      expect(result).toHaveProperty('buffer');
      expect(result.buffer).toBeInstanceOf(Buffer);
    });

    it('should handle projects with no quotes', async () => {
      const summaryWithoutQuotes: ProjectSummary = {
        ...mockProject.summary!,
        representativeQuotes: []
      };

      const result = await ExportService.generatePDF(
        mockProject,
        summaryWithoutQuotes,
        mockImages,
        defaultOptions
      );

      expect(result).toHaveProperty('buffer');
      expect(result.buffer).toBeInstanceOf(Buffer);
    });

    it('should sanitize filename for special characters', async () => {
      const projectWithSpecialChars = {
        ...mockProject,
        name: 'Test/Project: With "Special" Characters!'
      };

      const result = await ExportService.generatePDF(
        projectWithSpecialChars,
        mockProject.summary!,
        mockImages,
        defaultOptions
      );

      expect(result.filename).toBe('Test_Project__With__Special__Characters__report.pdf');
    });
  });

  describe('generatePDFWithPuppeteer', () => {
    const mockBrowser = {
      newPage: vi.fn(),
      close: vi.fn()
    };

    const mockPage = {
      setContent: vi.fn(),
      pdf: vi.fn()
    };

    beforeEach(() => {
      vi.mocked(puppeteer.launch).mockResolvedValue(mockBrowser as any);
      mockBrowser.newPage.mockResolvedValue(mockPage);
      mockPage.setContent.mockResolvedValue(undefined);
      mockPage.pdf.mockResolvedValue(Buffer.from('mock-pdf-content'));
    });

    it('should generate PDF using Puppeteer', async () => {
      const result = await ExportService.generatePDFWithPuppeteer(
        mockProject,
        mockProject.summary!,
        mockImages,
        defaultOptions
      );

      expect(puppeteer.launch).toHaveBeenCalledWith({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      expect(mockBrowser.newPage).toHaveBeenCalled();
      expect(mockPage.setContent).toHaveBeenCalled();
      expect(mockPage.pdf).toHaveBeenCalledWith({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '15mm',
          bottom: '20mm',
          left: '15mm'
        }
      });
      expect(mockBrowser.close).toHaveBeenCalled();

      expect(result).toHaveProperty('buffer');
      expect(result).toHaveProperty('filename');
      expect(result.filename).toBe('Test_Project_report.pdf');
      expect(result.buffer).toBeInstanceOf(Buffer);
    });

    it('should close browser even if PDF generation fails', async () => {
      mockPage.pdf.mockRejectedValue(new Error('PDF generation failed'));

      await expect(
        ExportService.generatePDFWithPuppeteer(
          mockProject,
          mockProject.summary!,
          mockImages,
          defaultOptions
        )
      ).rejects.toThrow('PDF generation failed');

      expect(mockBrowser.close).toHaveBeenCalled();
    });

    it('should generate HTML with custom branding', async () => {
      const optionsWithBranding: ExportOptions = {
        ...defaultOptions,
        branding: customBranding
      };

      await ExportService.generatePDFWithPuppeteer(
        mockProject,
        mockProject.summary!,
        mockImages,
        optionsWithBranding
      );

      const htmlContent = mockPage.setContent.mock.calls[0][0];
      expect(htmlContent).toContain(customBranding.companyName);
      expect(htmlContent).toContain(customBranding.primaryColor);
      expect(htmlContent).toContain(customBranding.fontFamily);
    });

    it('should include all themes in HTML output', async () => {
      await ExportService.generatePDFWithPuppeteer(
        mockProject,
        mockProject.summary!,
        mockImages,
        defaultOptions
      );

      const htmlContent = mockPage.setContent.mock.calls[0][0];
      expect(htmlContent).toContain('User Experience');
      expect(htmlContent).toContain('Performance');
      expect(htmlContent).toContain('Users need better navigation');
      expect(htmlContent).toContain('App needs to load faster');
    });

    it('should conditionally include sections based on options', async () => {
      const minimalOptions: ExportOptions = {
        includeSummary: false,
        includeOriginalText: false,
        includeImages: false
      };

      await ExportService.generatePDFWithPuppeteer(
        mockProject,
        mockProject.summary!,
        mockImages,
        minimalOptions
      );

      const htmlContent = mockPage.setContent.mock.calls[0][0];
      expect(htmlContent).not.toContain('Overall Insights');
    });
  });

  describe('cleanupTempFiles', () => {
    it('should clean up old temporary files', async () => {
      const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
      const recentDate = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1 hour ago

      vi.mocked(fs.readdir).mockResolvedValue(['old-file.pdf', 'recent-file.pdf'] as any);
      vi.mocked(fs.stat)
        .mockResolvedValueOnce({ mtime: oldDate } as any)
        .mockResolvedValueOnce({ mtime: recentDate } as any);

      await ExportService.cleanupTempFiles();

      expect(fs.unlink).toHaveBeenCalledTimes(1);
      expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining('old-file.pdf'));
    });

    it('should handle cleanup errors gracefully', async () => {
      vi.mocked(fs.readdir).mockRejectedValue(new Error('Directory not found'));

      // Should not throw
      await expect(ExportService.cleanupTempFiles()).resolves.toBeUndefined();
    });

    it('should not delete recent files', async () => {
      const recentDate = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1 hour ago

      vi.mocked(fs.readdir).mockResolvedValue(['recent-file.pdf'] as any);
      vi.mocked(fs.stat).mockResolvedValue({ mtime: recentDate } as any);

      await ExportService.cleanupTempFiles();

      expect(fs.unlink).not.toHaveBeenCalled();
    });
  });

  describe('generateCSV', () => {
    const defaultCSVOptions: CSVExportOptions = {
      format: 'detailed',
      includeMetadata: true,
      includeConfidence: true,
      delimiter: ',',
      encoding: 'utf8'
    };

    it('should generate detailed CSV with default options', async () => {
      const result = await ExportService.generateCSV(
        mockProject,
        mockProject.summary!,
        mockImages,
        { ...defaultOptions, csvOptions: defaultCSVOptions }
      );

      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('filename');
      expect(result).toHaveProperty('size');
      expect(result).toHaveProperty('generatedAt');
      expect(result.filename).toBe('Test_Project_detailed.csv');
      expect(result.content).toContain('Project Information');
      expect(result.content).toContain('User Experience');
      expect(result.content).toContain('Performance');
      expect(result.size).toBeGreaterThan(0);
    });

    it('should generate themes-only CSV', async () => {
      const themesOptions: CSVExportOptions = {
        ...defaultCSVOptions,
        format: 'themes'
      };

      const result = await ExportService.generateCSV(
        mockProject,
        mockProject.summary!,
        mockImages,
        { ...defaultOptions, csvOptions: themesOptions }
      );

      expect(result.filename).toBe('Test_Project_themes.csv');
      expect(result.content).toContain('Theme,Note Count,Percentage');
      expect(result.content).toContain('User Experience,5,45.50');
      expect(result.content).toContain('Performance,3,27.30');
      expect(result.content).not.toContain('Project Information');
    });

    it('should generate quotes-only CSV', async () => {
      const quotesOptions: CSVExportOptions = {
        ...defaultCSVOptions,
        format: 'quotes'
      };

      const result = await ExportService.generateCSV(
        mockProject,
        mockProject.summary!,
        mockImages,
        { ...defaultOptions, csvOptions: quotesOptions }
      );

      expect(result.filename).toBe('Test_Project_quotes.csv');
      expect(result.content).toContain('Quote,Theme,Source');
      expect(result.content).toContain('Users need better navigation');
      expect(result.content).toContain('App needs to load faster');
      expect(result.content).not.toContain('Project Information');
    });

    it('should generate summary CSV', async () => {
      const summaryOptions: CSVExportOptions = {
        ...defaultCSVOptions,
        format: 'summary'
      };

      const result = await ExportService.generateCSV(
        mockProject,
        mockProject.summary!,
        mockImages,
        { ...defaultOptions, csvOptions: summaryOptions }
      );

      expect(result.filename).toBe('Test_Project_summary.csv');
      expect(result.content).toContain('Project Summary');
      expect(result.content).toContain('Overall Insights');
      expect(result.content).toContain('Theme Distribution');
      expect(result.content).toContain(mockProject.summary!.overallInsights);
    });

    it('should handle different delimiters', async () => {
      const semicolonOptions: CSVExportOptions = {
        ...defaultCSVOptions,
        delimiter: ';'
      };

      const result = await ExportService.generateCSV(
        mockProject,
        mockProject.summary!,
        mockImages,
        { ...defaultOptions, csvOptions: semicolonOptions }
      );

      expect(result.content).toContain('Theme;Note Count;Percentage');
      expect(result.content).not.toContain('Theme,Note Count,Percentage');
    });

    it('should handle tab delimiter', async () => {
      const tabOptions: CSVExportOptions = {
        ...defaultCSVOptions,
        delimiter: '\t'
      };

      const result = await ExportService.generateCSV(
        mockProject,
        mockProject.summary!,
        mockImages,
        { ...defaultOptions, csvOptions: tabOptions }
      );

      expect(result.content).toContain('Theme\tNote Count\tPercentage');
    });

    it('should exclude confidence scores when option is false', async () => {
      const noConfidenceOptions: CSVExportOptions = {
        ...defaultCSVOptions,
        includeConfidence: false
      };

      const result = await ExportService.generateCSV(
        mockProject,
        mockProject.summary!,
        mockImages,
        { ...defaultOptions, csvOptions: noConfidenceOptions }
      );

      expect(result.content).not.toContain('Confidence Score');
      expect(result.content).not.toContain('OCR Confidence');
    });

    it('should exclude metadata when option is false', async () => {
      const noMetadataOptions: CSVExportOptions = {
        ...defaultCSVOptions,
        includeMetadata: false
      };

      const result = await ExportService.generateCSV(
        mockProject,
        mockProject.summary!,
        mockImages,
        { ...defaultOptions, csvOptions: noMetadataOptions }
      );

      expect(result.content).not.toContain('Processing Metadata');
      expect(result.content).not.toContain('Total Notes');
    });

    it('should properly escape CSV fields with special characters', async () => {
      const projectWithSpecialChars = {
        ...mockProject,
        name: 'Test "Project" with, commas and\nnewlines'
      };

      const summaryWithSpecialChars: ProjectSummary = {
        ...mockProject.summary!,
        topThemes: [
          {
            label: 'Theme with "quotes" and, commas',
            noteCount: 5,
            percentage: 50,
            keyTerms: ['term1', 'term2'],
            representativeQuote: 'Quote with "quotes" and, commas\nand newlines'
          }
        ]
      };

      const result = await ExportService.generateCSV(
        projectWithSpecialChars,
        summaryWithSpecialChars,
        mockImages,
        { ...defaultOptions, csvOptions: defaultCSVOptions }
      );

      expect(result.content).toContain('"Test ""Project"" with, commas and\nnewlines"');
      expect(result.content).toContain('"Theme with ""quotes"" and, commas"');
      expect(result.content).toContain('"Quote with ""quotes"" and, commas\nand newlines"');
    });

    it('should handle empty themes and quotes', async () => {
      const emptySummary: ProjectSummary = {
        ...mockProject.summary!,
        topThemes: [],
        representativeQuotes: []
      };

      const result = await ExportService.generateCSV(
        mockProject,
        emptySummary,
        mockImages,
        { ...defaultOptions, csvOptions: defaultCSVOptions }
      );

      expect(result.content).toContain('Themes');
      expect(result.content).toContain('Representative Quotes');
      expect(result.size).toBeGreaterThan(0);
    });

    it('should handle projects without images', async () => {
      const result = await ExportService.generateCSV(
        mockProject,
        mockProject.summary!,
        [],
        { ...defaultOptions, csvOptions: defaultCSVOptions }
      );

      expect(result.content).toContain('Project Information');
      expect(result.content).not.toContain('Images');
      expect(result.size).toBeGreaterThan(0);
    });

    it('should sanitize filename for special characters', async () => {
      const projectWithSpecialChars = {
        ...mockProject,
        name: 'Test/Project: With "Special" Characters!'
      };

      const result = await ExportService.generateCSV(
        projectWithSpecialChars,
        mockProject.summary!,
        mockImages,
        { ...defaultOptions, csvOptions: defaultCSVOptions }
      );

      expect(result.filename).toBe('Test_Project__With__Special__Characters__detailed.csv');
    });
  });

  describe('convertCSVEncoding', () => {
    const testContent = 'Name,Value\nTest,123\nUnicode,测试';

    it('should convert to UTF-8 with BOM', () => {
      const buffer = ExportService.convertCSVEncoding(testContent, 'utf8');
      
      // Check for UTF-8 BOM
      expect(buffer[0]).toBe(0xEF);
      expect(buffer[1]).toBe(0xBB);
      expect(buffer[2]).toBe(0xBF);
      
      // Check content
      const content = buffer.slice(3).toString('utf8');
      expect(content).toBe(testContent);
    });

    it('should convert to UTF-16LE with BOM', () => {
      const buffer = ExportService.convertCSVEncoding(testContent, 'utf16le');
      
      // Check for UTF-16LE BOM
      expect(buffer[0]).toBe(0xFF);
      expect(buffer[1]).toBe(0xFE);
      
      // Check content
      const content = buffer.slice(2).toString('utf16le');
      expect(content).toBe(testContent);
    });
  });

  describe('Error Handling', () => {
    it('should handle temp directory creation errors', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('Access denied'));
      vi.mocked(fs.mkdir).mockRejectedValue(new Error('Cannot create directory'));

      await expect(
        ExportService.generatePDF(
          mockProject,
          mockProject.summary!,
          mockImages,
          defaultOptions
        )
      ).rejects.toThrow('Cannot create directory');
    });

    it('should handle invalid CSV format gracefully', async () => {
      const invalidOptions: CSVExportOptions = {
        format: 'invalid' as any,
        includeMetadata: true,
        includeConfidence: true,
        delimiter: ',',
        encoding: 'utf8'
      };

      const result = await ExportService.generateCSV(
        mockProject,
        mockProject.summary!,
        mockImages,
        { ...defaultOptions, csvOptions: invalidOptions }
      );

      // Should default to detailed format
      expect(result.filename).toContain('detailed.csv');
      expect(result.content).toContain('Project Information');
    });
  });

  describe('PDF Content Generation', () => {
    it('should handle empty themes array', async () => {
      const summaryWithoutThemes: ProjectSummary = {
        ...mockProject.summary!,
        topThemes: []
      };

      const result = await ExportService.generatePDF(
        mockProject,
        summaryWithoutThemes,
        mockImages,
        defaultOptions
      );

      expect(result).toHaveProperty('buffer');
      expect(result.buffer).toBeInstanceOf(Buffer);
    });

    it('should handle long project descriptions', async () => {
      const projectWithLongDescription = {
        ...mockProject,
        description: 'A'.repeat(1000) // Very long description
      };

      const result = await ExportService.generatePDF(
        projectWithLongDescription,
        mockProject.summary!,
        mockImages,
        defaultOptions
      );

      expect(result).toHaveProperty('buffer');
      expect(result.buffer).toBeInstanceOf(Buffer);
    });

    it('should handle many themes (pagination)', async () => {
      const manyThemes = Array.from({ length: 20 }, (_, i) => ({
        label: `Theme ${i + 1}`,
        noteCount: 5,
        percentage: 5,
        keyTerms: [`term${i}`, `keyword${i}`],
        representativeQuote: `Quote for theme ${i + 1}`
      }));

      const summaryWithManyThemes: ProjectSummary = {
        ...mockProject.summary!,
        topThemes: manyThemes
      };

      const result = await ExportService.generatePDF(
        mockProject,
        summaryWithManyThemes,
        mockImages,
        defaultOptions
      );

      expect(result).toHaveProperty('buffer');
      expect(result.buffer).toBeInstanceOf(Buffer);
    });
  });
});