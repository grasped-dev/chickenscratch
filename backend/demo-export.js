// Demo script to show PDF export functionality
import { ExportService } from './src/services/export.js';
import fs from 'fs';

// Mock project data
const mockProject = {
  id: 'project-123',
  userId: 'user-123',
  name: 'Demo Project',
  description: 'A demonstration of the PDF export functionality',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  status: 'completed',
  imageCount: 2
};

const mockSummary = {
  topThemes: [
    {
      label: 'User Experience',
      noteCount: 5,
      percentage: 45.5,
      keyTerms: ['UX', 'design', 'user', 'interface'],
      representativeQuote: 'Users need better navigation and clearer visual hierarchy'
    },
    {
      label: 'Performance Optimization',
      noteCount: 3,
      percentage: 27.3,
      keyTerms: ['speed', 'optimization', 'performance', 'loading'],
      representativeQuote: 'App needs to load faster and respond more quickly'
    },
    {
      label: 'Accessibility',
      noteCount: 2,
      percentage: 18.2,
      keyTerms: ['accessibility', 'a11y', 'screen reader', 'keyboard'],
      representativeQuote: 'Need to improve keyboard navigation and screen reader support'
    }
  ],
  overallInsights: 'The project analysis reveals three main areas of focus: improving user experience through better design and navigation, optimizing performance for faster loading times, and enhancing accessibility features to make the application more inclusive.',
  distribution: [
    { theme: 'User Experience', count: 5, percentage: 45.5 },
    { theme: 'Performance Optimization', count: 3, percentage: 27.3 },
    { theme: 'Accessibility', count: 2, percentage: 18.2 }
  ],
  representativeQuotes: [
    {
      text: 'Users need better navigation and clearer visual hierarchy',
      theme: 'User Experience',
      confidence: 0.92,
      source: 'note-1'
    },
    {
      text: 'App needs to load faster and respond more quickly',
      theme: 'Performance Optimization',
      confidence: 0.88,
      source: 'note-2'
    },
    {
      text: 'Need to improve keyboard navigation and screen reader support',
      theme: 'Accessibility',
      confidence: 0.85,
      source: 'note-3'
    }
  ],
  metadata: {
    totalNotes: 10,
    processingTime: 2500,
    clustersFound: 3,
    averageConfidence: 0.883,
    generatedAt: new Date('2024-01-01')
  }
};

const mockImages = [
  {
    id: 'image-1',
    projectId: 'project-123',
    originalUrl: 'https://example.com/image1.jpg',
    filename: 'whiteboard_notes.jpg',
    fileSize: 1024000,
    mimeType: 'image/jpeg',
    uploadedAt: new Date('2024-01-01'),
    processingStatus: 'completed',
    boundingBoxes: []
  },
  {
    id: 'image-2',
    projectId: 'project-123',
    originalUrl: 'https://example.com/image2.jpg',
    filename: 'sticky_notes.jpg',
    fileSize: 2048000,
    mimeType: 'image/jpeg',
    uploadedAt: new Date('2024-01-01'),
    processingStatus: 'completed',
    boundingBoxes: []
  }
];

async function demonstrateExport() {
  console.log('🚀 Demonstrating PDF Export Service...\n');

  try {
    // Test basic PDF generation
    console.log('📄 Generating basic PDF report...');
    const basicOptions = {
      includeSummary: true,
      includeOriginalText: false,
      includeImages: true
    };

    const basicResult = await ExportService.generatePDF(
      mockProject,
      mockSummary,
      mockImages,
      basicOptions
    );

    fs.writeFileSync('demo_basic_report.pdf', basicResult.buffer);
    console.log(`✅ Basic PDF generated: ${basicResult.filename} (${basicResult.size} bytes)`);

    // Test PDF with custom branding
    console.log('\n🎨 Generating PDF with custom branding...');
    const brandedOptions = {
      includeSummary: true,
      includeOriginalText: false,
      includeImages: true,
      branding: {
        companyName: 'Acme Research Corp',
        primaryColor: '#8b5cf6',
        secondaryColor: '#64748b',
        fontFamily: 'Helvetica'
      }
    };

    const brandedResult = await ExportService.generatePDF(
      mockProject,
      mockSummary,
      mockImages,
      brandedOptions
    );

    fs.writeFileSync('demo_branded_report.pdf', brandedResult.buffer);
    console.log(`✅ Branded PDF generated: ${brandedResult.filename} (${brandedResult.size} bytes)`);

    // Test advanced PDF with Puppeteer
    console.log('\n🔧 Generating advanced PDF with Puppeteer...');
    const advancedResult = await ExportService.generatePDFWithPuppeteer(
      mockProject,
      mockSummary,
      mockImages,
      brandedOptions
    );

    fs.writeFileSync('demo_advanced_report.pdf', advancedResult.buffer);
    console.log(`✅ Advanced PDF generated: ${advancedResult.filename} (${advancedResult.size} bytes)`);

    console.log('\n🎉 All PDF exports completed successfully!');
    console.log('\nGenerated files:');
    console.log('- demo_basic_report.pdf (PDFKit)');
    console.log('- demo_branded_report.pdf (PDFKit with branding)');
    console.log('- demo_advanced_report.pdf (Puppeteer)');

  } catch (error) {
    console.error('❌ Error during PDF generation:', error.message);
  }
}

// Run the demonstration
demonstrateExport();