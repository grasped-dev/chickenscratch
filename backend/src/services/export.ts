import PDFDocument from 'pdfkit';
import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';
import { Project, ProcessedImage } from '../types/models.js';
import { ProjectSummary, Quote, ThemeSummary } from '../types/processing.js';

export interface ExportRequest {
  projectId: string;
  format: 'pdf' | 'csv';
  options: ExportOptions;
}

export interface ExportOptions {
  includeSummary: boolean;
  includeOriginalText: boolean;
  includeImages: boolean;
  customTemplate?: string;
  branding?: BrandingOptions;
}

export interface BrandingOptions {
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  fontFamily?: string;
  companyName?: string;
}

export interface PDFGenerationResult {
  buffer: Buffer;
  filename: string;
  size: number;
  generatedAt: Date;
}

export interface CSVGenerationResult {
  content: string;
  filename: string;
  size: number;
  generatedAt: Date;
}

export interface CSVExportOptions {
  format: 'themes' | 'quotes' | 'detailed' | 'summary';
  includeMetadata: boolean;
  includeConfidence: boolean;
  delimiter: ',' | ';' | '\t';
  encoding: 'utf8' | 'utf16le';
}

export class ExportService {
  private static readonly TEMP_DIR = path.join(process.cwd(), 'temp');
  private static readonly DEFAULT_BRANDING: BrandingOptions = {
    primaryColor: '#2563eb',
    secondaryColor: '#64748b',
    fontFamily: 'Helvetica',
    companyName: 'Chicken Scratch'
  };

  /**
   * Generate PDF report for a project
   */
  static async generatePDF(
    project: Project,
    summary: ProjectSummary,
    images: ProcessedImage[],
    options: ExportOptions
  ): Promise<PDFGenerationResult> {
    const branding = { ...this.DEFAULT_BRANDING, ...options.branding };
    
    // Ensure temp directory exists
    await this.ensureTempDirectory();
    
    // Create PDF document
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 }
    });
    
    const chunks: Buffer[] = [];
    doc.on('data', chunk => chunks.push(chunk));
    
    const pdfPromise = new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });
    
    // Generate PDF content
    await this.generatePDFContent(doc, project, summary, images, options, branding);
    
    doc.end();
    const buffer = await pdfPromise;
    
    return {
      buffer: Buffer.from(buffer),
      filename: `${project.name.replace(/[^a-zA-Z0-9]/g, '_')}_report.pdf`,
      size: buffer.length,
      generatedAt: new Date()
    };
  }

  /**
   * Generate PDF using Puppeteer for complex layouts
   */
  static async generatePDFWithPuppeteer(
    project: Project,
    summary: ProjectSummary,
    images: ProcessedImage[],
    options: ExportOptions
  ): Promise<PDFGenerationResult> {
    const branding = { ...this.DEFAULT_BRANDING, ...options.branding };
    
    // Generate HTML content
    const htmlContent = await this.generateHTMLTemplate(project, summary, images, options, branding);
    
    // Launch Puppeteer
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
      const page = await browser.newPage();
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
      
      const buffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '15mm',
          bottom: '20mm',
          left: '15mm'
        }
      });
      
      return {
        buffer,
        filename: `${project.name.replace(/[^a-zA-Z0-9]/g, '_')}_report.pdf`,
        size: buffer.length,
        generatedAt: new Date()
      };
    } finally {
      await browser.close();
    }
  }

  /**
   * Generate PDF content using PDFKit
   */
  private static async generatePDFContent(
    doc: PDFKit.PDFDocument,
    project: Project,
    summary: ProjectSummary,
    images: ProcessedImage[],
    options: ExportOptions,
    branding: BrandingOptions
  ): Promise<void> {
    // Header
    await this.addPDFHeader(doc, project, branding);
    
    // Project overview
    this.addProjectOverview(doc, project, summary);
    
    // Summary section
    if (options.includeSummary) {
      this.addSummarySection(doc, summary);
    }
    
    // Themes and insights
    this.addThemesSection(doc, summary);
    
    // Representative quotes
    this.addQuotesSection(doc, summary);
    
    // Images section
    if (options.includeImages && images.length > 0) {
      await this.addImagesSection(doc, images);
    }
    
    // Footer
    this.addPDFFooter(doc, branding);
  }

  /**
   * Add PDF header with branding
   */
  private static async addPDFHeader(
    doc: PDFKit.PDFDocument,
    project: Project,
    branding: BrandingOptions
  ): Promise<void> {
    // Company name/logo
    doc.fontSize(20)
       .fillColor(branding.primaryColor!)
       .text(branding.companyName!, 50, 50);
    
    // Title
    doc.fontSize(24)
       .fillColor('#000000')
       .text('Analysis Report', 50, 80);
    
    // Project name
    doc.fontSize(18)
       .fillColor(branding.secondaryColor!)
       .text(project.name, 50, 110);
    
    // Date
    doc.fontSize(12)
       .fillColor('#666666')
       .text(`Generated on ${new Date().toLocaleDateString()}`, 50, 140);
    
    // Horizontal line
    doc.moveTo(50, 160)
       .lineTo(545, 160)
       .strokeColor(branding.primaryColor!)
       .stroke();
    
    doc.y = 180;
  }

  /**
   * Add project overview section
   */
  private static addProjectOverview(
    doc: PDFKit.PDFDocument,
    project: Project,
    summary: ProjectSummary
  ): void {
    doc.fontSize(16)
       .fillColor('#000000')
       .text('Project Overview', 50, doc.y + 20);
    
    doc.fontSize(12)
       .fillColor('#333333')
       .text(`Project: ${project.name}`, 50, doc.y + 10);
    
    if (project.description) {
      doc.text(`Description: ${project.description}`, 50, doc.y + 5);
    }
    
    doc.text(`Total Notes Processed: ${summary.metadata.totalNotes}`, 50, doc.y + 5);
    doc.text(`Themes Identified: ${summary.metadata.clustersFound}`, 50, doc.y + 5);
    doc.text(`Average Confidence: ${(summary.metadata.averageConfidence * 100).toFixed(1)}%`, 50, doc.y + 5);
    
    doc.y += 20;
  }

  /**
   * Add summary section
   */
  private static addSummarySection(
    doc: PDFKit.PDFDocument,
    summary: ProjectSummary
  ): void {
    doc.fontSize(16)
       .fillColor('#000000')
       .text('Overall Insights', 50, doc.y + 20);
    
    doc.fontSize(12)
       .fillColor('#333333')
       .text(summary.overallInsights, 50, doc.y + 10, {
         width: 495,
         align: 'justify'
       });
    
    doc.y += 20;
  }

  /**
   * Add themes section
   */
  private static addThemesSection(
    doc: PDFKit.PDFDocument,
    summary: ProjectSummary
  ): void {
    doc.fontSize(16)
       .fillColor('#000000')
       .text('Key Themes', 50, doc.y + 20);
    
    summary.topThemes.forEach((theme, index) => {
      // Check if we need a new page
      if (doc.y > 700) {
        doc.addPage();
        doc.y = 50;
      }
      
      doc.fontSize(14)
         .fillColor('#2563eb')
         .text(`${index + 1}. ${theme.label}`, 50, doc.y + 15);
      
      doc.fontSize(12)
         .fillColor('#666666')
         .text(`${theme.noteCount} notes (${theme.percentage.toFixed(1)}%)`, 70, doc.y + 5);
      
      doc.fontSize(11)
         .fillColor('#333333')
         .text(`Key terms: ${theme.keyTerms.join(', ')}`, 70, doc.y + 5);
      
      if (theme.representativeQuote) {
        doc.fontSize(11)
           .fillColor('#555555')
           .text(`"${theme.representativeQuote}"`, 70, doc.y + 5, {
             width: 475
           });
      }
      
      doc.y += 10;
    });
    
    doc.y += 20;
  }

  /**
   * Add quotes section
   */
  private static addQuotesSection(
    doc: PDFKit.PDFDocument,
    summary: ProjectSummary
  ): void {
    if (summary.representativeQuotes.length === 0) return;
    
    doc.fontSize(16)
       .fillColor('#000000')
       .text('Representative Quotes', 50, doc.y + 20);
    
    summary.representativeQuotes.forEach((quote, index) => {
      // Check if we need a new page
      if (doc.y > 700) {
        doc.addPage();
        doc.y = 50;
      }
      
      doc.fontSize(12)
         .fillColor('#333333')
         .text(`${index + 1}. "${quote.text}"`, 50, doc.y + 15, {
           width: 495
         });
      
      doc.fontSize(10)
         .fillColor('#666666')
         .text(`Theme: ${quote.theme} | Confidence: ${(quote.confidence * 100).toFixed(1)}%`, 70, doc.y + 5);
      
      doc.y += 10;
    });
  }

  /**
   * Add images section
   */
  private static async addImagesSection(
    doc: PDFKit.PDFDocument,
    images: ProcessedImage[]
  ): Promise<void> {
    doc.addPage();
    doc.fontSize(16)
       .fillColor('#000000')
       .text('Original Images', 50, 50);
    
    let yPosition = 80;
    
    for (const image of images.slice(0, 4)) { // Limit to 4 images
      if (yPosition > 600) {
        doc.addPage();
        yPosition = 50;
      }
      
      try {
        // Note: In a real implementation, you'd fetch the image from S3
        // For now, we'll just add a placeholder
        doc.fontSize(12)
           .fillColor('#666666')
           .text(`Image: ${image.filename}`, 50, yPosition);
        
        doc.fontSize(10)
           .fillColor('#888888')
           .text(`Uploaded: ${image.uploadedAt.toLocaleDateString()}`, 50, yPosition + 15);
        
        yPosition += 150; // Space for image placeholder
      } catch (error) {
        console.error('Error adding image to PDF:', error);
      }
    }
  }

  /**
   * Add PDF footer
   */
  private static addPDFFooter(
    doc: PDFKit.PDFDocument,
    branding: BrandingOptions
  ): void {
    const pageRange = doc.bufferedPageRange();
    const pageCount = pageRange.count;
    
    for (let i = 0; i < pageCount; i++) {
      const pageIndex = pageRange.start + i;
      doc.switchToPage(pageIndex);
      
      // Footer line
      doc.moveTo(50, 792 - 40)
         .lineTo(545, 792 - 40)
         .strokeColor(branding.primaryColor!)
         .stroke();
      
      // Footer text
      doc.fontSize(10)
         .fillColor('#666666')
         .text(
           `Generated by ${branding.companyName} | Page ${i + 1} of ${pageCount}`,
           50,
           792 - 30,
           { align: 'center', width: 495 }
         );
    }
  }

  /**
   * Generate HTML template for Puppeteer
   */
  private static async generateHTMLTemplate(
    project: Project,
    summary: ProjectSummary,
    images: ProcessedImage[],
    options: ExportOptions,
    branding: BrandingOptions
  ): Promise<string> {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${project.name} - Analysis Report</title>
    <style>
        body {
            font-family: ${branding.fontFamily}, Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
        }
        .header {
            border-bottom: 3px solid ${branding.primaryColor};
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        .company-name {
            color: ${branding.primaryColor};
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 10px;
        }
        .report-title {
            font-size: 32px;
            margin-bottom: 10px;
        }
        .project-name {
            color: ${branding.secondaryColor};
            font-size: 20px;
            margin-bottom: 10px;
        }
        .date {
            color: #666;
            font-size: 14px;
        }
        .section {
            margin-bottom: 30px;
        }
        .section-title {
            font-size: 20px;
            color: ${branding.primaryColor};
            border-bottom: 1px solid #eee;
            padding-bottom: 5px;
            margin-bottom: 15px;
        }
        .overview-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 20px;
            margin-bottom: 20px;
        }
        .stat-card {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            border-left: 4px solid ${branding.primaryColor};
        }
        .stat-value {
            font-size: 24px;
            font-weight: bold;
            color: ${branding.primaryColor};
        }
        .stat-label {
            color: #666;
            font-size: 14px;
        }
        .theme-item {
            background: #f8f9fa;
            padding: 15px;
            margin-bottom: 15px;
            border-radius: 8px;
            border-left: 4px solid ${branding.primaryColor};
        }
        .theme-title {
            font-size: 16px;
            font-weight: bold;
            color: ${branding.primaryColor};
            margin-bottom: 5px;
        }
        .theme-stats {
            color: #666;
            font-size: 14px;
            margin-bottom: 8px;
        }
        .theme-terms {
            color: #555;
            font-size: 13px;
            margin-bottom: 8px;
        }
        .theme-quote {
            font-style: italic;
            color: #555;
            font-size: 13px;
            border-left: 2px solid #ddd;
            padding-left: 10px;
        }
        .quote-item {
            background: #f8f9fa;
            padding: 15px;
            margin-bottom: 10px;
            border-radius: 8px;
            border-left: 4px solid ${branding.secondaryColor};
        }
        .quote-text {
            font-style: italic;
            margin-bottom: 8px;
        }
        .quote-meta {
            color: #666;
            font-size: 12px;
        }
        .footer {
            border-top: 1px solid #eee;
            padding-top: 20px;
            margin-top: 40px;
            text-align: center;
            color: #666;
            font-size: 12px;
        }
        @media print {
            body { margin: 0; }
            .section { page-break-inside: avoid; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="company-name">${branding.companyName}</div>
        <div class="report-title">Analysis Report</div>
        <div class="project-name">${project.name}</div>
        <div class="date">Generated on ${new Date().toLocaleDateString()}</div>
    </div>

    <div class="section">
        <h2 class="section-title">Project Overview</h2>
        <div class="overview-grid">
            <div class="stat-card">
                <div class="stat-value">${summary.metadata.totalNotes}</div>
                <div class="stat-label">Total Notes</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${summary.metadata.clustersFound}</div>
                <div class="stat-label">Themes Identified</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${(summary.metadata.averageConfidence * 100).toFixed(1)}%</div>
                <div class="stat-label">Average Confidence</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${images.length}</div>
                <div class="stat-label">Images Processed</div>
            </div>
        </div>
        ${project.description ? `<p><strong>Description:</strong> ${project.description}</p>` : ''}
    </div>

    ${options.includeSummary ? `
    <div class="section">
        <h2 class="section-title">Overall Insights</h2>
        <p>${summary.overallInsights}</p>
    </div>
    ` : ''}

    <div class="section">
        <h2 class="section-title">Key Themes</h2>
        ${summary.topThemes.map((theme, index) => `
            <div class="theme-item">
                <div class="theme-title">${index + 1}. ${theme.label}</div>
                <div class="theme-stats">${theme.noteCount} notes (${theme.percentage.toFixed(1)}%)</div>
                <div class="theme-terms">Key terms: ${theme.keyTerms.join(', ')}</div>
                ${theme.representativeQuote ? `<div class="theme-quote">"${theme.representativeQuote}"</div>` : ''}
            </div>
        `).join('')}
    </div>

    ${summary.representativeQuotes.length > 0 ? `
    <div class="section">
        <h2 class="section-title">Representative Quotes</h2>
        ${summary.representativeQuotes.map((quote, index) => `
            <div class="quote-item">
                <div class="quote-text">"${quote.text}"</div>
                <div class="quote-meta">Theme: ${quote.theme} | Confidence: ${(quote.confidence * 100).toFixed(1)}%</div>
            </div>
        `).join('')}
    </div>
    ` : ''}

    <div class="footer">
        Generated by ${branding.companyName} | ${new Date().toLocaleString()}
    </div>
</body>
</html>
    `;
  }

  /**
   * Ensure temp directory exists
   */
  private static async ensureTempDirectory(): Promise<void> {
    try {
      await fs.access(this.TEMP_DIR);
    } catch {
      await fs.mkdir(this.TEMP_DIR, { recursive: true });
    }
  }

  /**
   * Generate CSV export for a project
   */
  static async generateCSV(
    project: Project,
    summary: ProjectSummary,
    images: ProcessedImage[],
    options: ExportOptions & { csvOptions?: CSVExportOptions }
  ): Promise<CSVGenerationResult> {
    const csvOptions: CSVExportOptions = {
      format: 'detailed',
      includeMetadata: true,
      includeConfidence: true,
      delimiter: ',',
      encoding: 'utf8',
      ...options.csvOptions
    };

    let csvContent: string;
    let filename: string;

    switch (csvOptions.format) {
      case 'themes':
        csvContent = this.generateThemesCSV(summary, csvOptions);
        filename = `${project.name.replace(/[^a-zA-Z0-9]/g, '_')}_themes.csv`;
        break;
      case 'quotes':
        csvContent = this.generateQuotesCSV(summary, csvOptions);
        filename = `${project.name.replace(/[^a-zA-Z0-9]/g, '_')}_quotes.csv`;
        break;
      case 'summary':
        csvContent = this.generateSummaryCSV(project, summary, images, csvOptions);
        filename = `${project.name.replace(/[^a-zA-Z0-9]/g, '_')}_summary.csv`;
        break;
      case 'detailed':
      default:
        csvContent = this.generateDetailedCSV(project, summary, images, csvOptions);
        filename = `${project.name.replace(/[^a-zA-Z0-9]/g, '_')}_detailed.csv`;
        break;
    }

    return {
      content: csvContent,
      filename,
      size: Buffer.byteLength(csvContent, csvOptions.encoding),
      generatedAt: new Date()
    };
  }

  /**
   * Generate themes-focused CSV
   */
  private static generateThemesCSV(
    summary: ProjectSummary,
    options: CSVExportOptions
  ): string {
    const headers = [
      'Theme',
      'Note Count',
      'Percentage',
      'Key Terms',
      'Representative Quote'
    ];

    if (options.includeConfidence) {
      headers.push('Confidence Score');
    }

    const rows: string[][] = [headers];

    summary.topThemes.forEach(theme => {
      const row = [
        this.escapeCSVField(theme.label, options.delimiter),
        theme.noteCount.toString(),
        theme.percentage.toFixed(2),
        this.escapeCSVField(theme.keyTerms.join('; '), options.delimiter),
        this.escapeCSVField(theme.representativeQuote, options.delimiter)
      ];

      if (options.includeConfidence) {
        // Calculate theme confidence based on note count and percentage
        const confidence = Math.min(0.95, (theme.noteCount / 10) * (theme.percentage / 100));
        row.push(confidence.toFixed(3));
      }

      rows.push(row);
    });

    if (options.includeMetadata) {
      rows.push([]);
      rows.push(['Metadata']);
      rows.push(['Total Notes', summary.metadata.totalNotes.toString()]);
      rows.push(['Clusters Found', summary.metadata.clustersFound.toString()]);
      rows.push(['Average Confidence', summary.metadata.averageConfidence.toFixed(3)]);
      rows.push(['Generated At', summary.metadata.generatedAt.toISOString()]);
    }

    return rows.map(row => row.join(options.delimiter)).join('\n');
  }

  /**
   * Generate quotes-focused CSV
   */
  private static generateQuotesCSV(
    summary: ProjectSummary,
    options: CSVExportOptions
  ): string {
    const headers = [
      'Quote',
      'Theme',
      'Source'
    ];

    if (options.includeConfidence) {
      headers.push('Confidence');
    }

    const rows: string[][] = [headers];

    summary.representativeQuotes.forEach(quote => {
      const row = [
        this.escapeCSVField(quote.text, options.delimiter),
        this.escapeCSVField(quote.theme, options.delimiter),
        this.escapeCSVField(quote.source, options.delimiter)
      ];

      if (options.includeConfidence) {
        row.push(quote.confidence.toFixed(3));
      }

      rows.push(row);
    });

    if (options.includeMetadata) {
      rows.push([]);
      rows.push(['Metadata']);
      rows.push(['Total Quotes', summary.representativeQuotes.length.toString()]);
      rows.push(['Generated At', summary.metadata.generatedAt.toISOString()]);
    }

    return rows.map(row => row.join(options.delimiter)).join('\n');
  }

  /**
   * Generate summary-focused CSV
   */
  private static generateSummaryCSV(
    project: Project,
    summary: ProjectSummary,
    images: ProcessedImage[],
    options: CSVExportOptions
  ): string {
    const rows: string[][] = [
      ['Project Summary'],
      ['Project Name', this.escapeCSVField(project.name, options.delimiter)],
      ['Description', this.escapeCSVField(project.description || '', options.delimiter)],
      ['Created At', project.createdAt.toISOString()],
      ['Status', project.status],
      ['Image Count', images.length.toString()],
      [],
      ['Overall Insights'],
      [this.escapeCSVField(summary.overallInsights, options.delimiter)],
      [],
      ['Theme Distribution'],
      ['Theme', 'Count', 'Percentage']
    ];

    summary.distribution.forEach(dist => {
      rows.push([
        this.escapeCSVField(dist.theme, options.delimiter),
        dist.count.toString(),
        dist.percentage.toFixed(2)
      ]);
    });

    if (options.includeMetadata) {
      rows.push([]);
      rows.push(['Processing Metadata']);
      rows.push(['Total Notes', summary.metadata.totalNotes.toString()]);
      rows.push(['Processing Time (ms)', summary.metadata.processingTime.toString()]);
      rows.push(['Clusters Found', summary.metadata.clustersFound.toString()]);
      rows.push(['Average Confidence', summary.metadata.averageConfidence.toFixed(3)]);
      rows.push(['Generated At', summary.metadata.generatedAt.toISOString()]);
    }

    return rows.map(row => row.join(options.delimiter)).join('\n');
  }

  /**
   * Generate detailed CSV with all data
   */
  private static generateDetailedCSV(
    project: Project,
    summary: ProjectSummary,
    images: ProcessedImage[],
    options: CSVExportOptions
  ): string {
    const rows: string[][] = [];

    // Project information
    rows.push(['Project Information']);
    rows.push(['Field', 'Value']);
    rows.push(['Name', this.escapeCSVField(project.name, options.delimiter)]);
    rows.push(['Description', this.escapeCSVField(project.description || '', options.delimiter)]);
    rows.push(['Created At', project.createdAt.toISOString()]);
    rows.push(['Updated At', project.updatedAt.toISOString()]);
    rows.push(['Status', project.status]);
    rows.push(['Image Count', images.length.toString()]);
    rows.push([]);

    // Overall insights
    rows.push(['Overall Insights']);
    rows.push([this.escapeCSVField(summary.overallInsights, options.delimiter)]);
    rows.push([]);

    // Themes section
    rows.push(['Themes']);
    const themeHeaders = ['Theme', 'Note Count', 'Percentage', 'Key Terms', 'Representative Quote'];
    if (options.includeConfidence) {
      themeHeaders.push('Confidence Score');
    }
    rows.push(themeHeaders);

    summary.topThemes.forEach(theme => {
      const row = [
        this.escapeCSVField(theme.label, options.delimiter),
        theme.noteCount.toString(),
        theme.percentage.toFixed(2),
        this.escapeCSVField(theme.keyTerms.join('; '), options.delimiter),
        this.escapeCSVField(theme.representativeQuote, options.delimiter)
      ];

      if (options.includeConfidence) {
        const confidence = Math.min(0.95, (theme.noteCount / 10) * (theme.percentage / 100));
        row.push(confidence.toFixed(3));
      }

      rows.push(row);
    });
    rows.push([]);

    // Quotes section
    rows.push(['Representative Quotes']);
    const quoteHeaders = ['Quote', 'Theme', 'Source'];
    if (options.includeConfidence) {
      quoteHeaders.push('Confidence');
    }
    rows.push(quoteHeaders);

    summary.representativeQuotes.forEach(quote => {
      const row = [
        this.escapeCSVField(quote.text, options.delimiter),
        this.escapeCSVField(quote.theme, options.delimiter),
        this.escapeCSVField(quote.source, options.delimiter)
      ];

      if (options.includeConfidence) {
        row.push(quote.confidence.toFixed(3));
      }

      rows.push(row);
    });
    rows.push([]);

    // Theme distribution
    rows.push(['Theme Distribution']);
    rows.push(['Theme', 'Count', 'Percentage']);
    summary.distribution.forEach(dist => {
      rows.push([
        this.escapeCSVField(dist.theme, options.delimiter),
        dist.count.toString(),
        dist.percentage.toFixed(2)
      ]);
    });
    rows.push([]);

    // Images information
    if (images.length > 0) {
      rows.push(['Images']);
      const imageHeaders = ['Filename', 'File Size (bytes)', 'MIME Type', 'Uploaded At', 'Processing Status'];
      if (options.includeConfidence) {
        imageHeaders.push('OCR Confidence');
      }
      rows.push(imageHeaders);

      images.forEach(image => {
        const row = [
          this.escapeCSVField(image.filename, options.delimiter),
          image.fileSize.toString(),
          image.mimeType,
          image.uploadedAt.toISOString(),
          image.processingStatus
        ];

        if (options.includeConfidence && image.ocrResults) {
          row.push(image.ocrResults.confidence.toFixed(3));
        } else if (options.includeConfidence) {
          row.push('N/A');
        }

        rows.push(row);
      });
      rows.push([]);
    }

    // Processing metadata
    if (options.includeMetadata) {
      rows.push(['Processing Metadata']);
      rows.push(['Field', 'Value']);
      rows.push(['Total Notes', summary.metadata.totalNotes.toString()]);
      rows.push(['Processing Time (ms)', summary.metadata.processingTime.toString()]);
      rows.push(['Clusters Found', summary.metadata.clustersFound.toString()]);
      rows.push(['Average Confidence', summary.metadata.averageConfidence.toFixed(3)]);
      rows.push(['Generated At', summary.metadata.generatedAt.toISOString()]);
    }

    return rows.map(row => row.join(options.delimiter)).join('\n');
  }

  /**
   * Escape CSV field content to handle special characters
   */
  private static escapeCSVField(field: string, delimiter: string): string {
    if (!field) return '';
    
    // Convert to string if not already
    const str = String(field);
    
    // Check if field contains delimiter, quotes, or newlines
    const needsEscaping = str.includes(delimiter) || str.includes('"') || str.includes('\n') || str.includes('\r');
    
    if (needsEscaping) {
      // Escape quotes by doubling them and wrap in quotes
      return `"${str.replace(/"/g, '""')}"`;
    }
    
    return str;
  }

  /**
   * Convert CSV content to different encodings
   */
  static convertCSVEncoding(content: string, encoding: 'utf8' | 'utf16le'): Buffer {
    switch (encoding) {
      case 'utf16le':
        // Add BOM for UTF-16LE
        const bom = Buffer.from([0xFF, 0xFE]);
        const contentBuffer = Buffer.from(content, 'utf16le');
        return Buffer.concat([bom, contentBuffer]);
      case 'utf8':
      default:
        // Add BOM for UTF-8 to ensure proper Excel compatibility
        const utf8Bom = Buffer.from([0xEF, 0xBB, 0xBF]);
        const utf8Buffer = Buffer.from(content, 'utf8');
        return Buffer.concat([utf8Bom, utf8Buffer]);
    }
  }

  /**
   * Clean up temporary files
   */
  static async cleanupTempFiles(): Promise<void> {
    try {
      const files = await fs.readdir(this.TEMP_DIR);
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      
      for (const file of files) {
        const filePath = path.join(this.TEMP_DIR, file);
        const stats = await fs.stat(filePath);
        
        if (now - stats.mtime.getTime() > maxAge) {
          await fs.unlink(filePath);
        }
      }
    } catch (error) {
      console.error('Error cleaning up temp files:', error);
    }
  }
}