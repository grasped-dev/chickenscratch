#!/usr/bin/env node

/**
 * Demo script for CSV export functionality
 * This script demonstrates the CSV export capabilities of the Chicken Scratch application
 */

import { ExportService } from './dist/services/export.js';

// Mock project data
const mockProject = {
  id: 'demo-project-123',
  userId: 'demo-user-123',
  name: 'Demo Project: Meeting Notes Analysis',
  description: 'Analysis of sticky notes from team brainstorming session',
  createdAt: new Date('2024-01-15T10:00:00Z'),
  updatedAt: new Date('2024-01-15T14:30:00Z'),
  status: 'completed',
  imageCount: 3,
  summary: {
    topThemes: [
      {
        label: 'User Experience Improvements',
        noteCount: 8,
        percentage: 42.1,
        keyTerms: ['UX', 'navigation', 'interface', 'usability'],
        representativeQuote: 'Users are confused by the current navigation structure'
      },
      {
        label: 'Performance Optimization',
        noteCount: 6,
        percentage: 31.6,
        keyTerms: ['speed', 'loading', 'optimization', 'performance'],
        representativeQuote: 'Page load times are too slow on mobile devices'
      },
      {
        label: 'Feature Requests',
        noteCount: 5,
        percentage: 26.3,
        keyTerms: ['features', 'functionality', 'requests', 'enhancement'],
        representativeQuote: 'Need dark mode and better search functionality'
      }
    ],
    overallInsights: 'The team identified three main areas for improvement: user experience, performance, and new features. The majority of feedback focused on navigation and interface issues, followed by performance concerns and feature enhancement requests.',
    distribution: [
      { theme: 'User Experience Improvements', count: 8, percentage: 42.1 },
      { theme: 'Performance Optimization', count: 6, percentage: 31.6 },
      { theme: 'Feature Requests', count: 5, percentage: 26.3 }
    ],
    representativeQuotes: [
      {
        text: 'Users are confused by the current navigation structure',
        theme: 'User Experience Improvements',
        confidence: 0.92,
        source: 'note-ux-001'
      },
      {
        text: 'Page load times are too slow on mobile devices',
        theme: 'Performance Optimization',
        confidence: 0.88,
        source: 'note-perf-003'
      },
      {
        text: 'Need dark mode and better search functionality',
        theme: 'Feature Requests',
        confidence: 0.85,
        source: 'note-feat-002'
      },
      {
        text: 'The menu system needs to be more intuitive',
        theme: 'User Experience Improvements',
        confidence: 0.90,
        source: 'note-ux-005'
      }
    ],
    metadata: {
      totalNotes: 19,
      processingTime: 2340,
      clustersFound: 3,
      averageConfidence: 0.887,
      generatedAt: new Date('2024-01-15T14:30:00Z')
    }
  }
};

// Mock images data
const mockImages = [
  {
    id: 'image-001',
    projectId: 'demo-project-123',
    originalUrl: 'https://s3.amazonaws.com/chicken-scratch/images/whiteboard-001.jpg',
    filename: 'whiteboard-session-1.jpg',
    fileSize: 2048576,
    mimeType: 'image/jpeg',
    uploadedAt: new Date('2024-01-15T10:15:00Z'),
    processingStatus: 'completed',
    boundingBoxes: [],
    ocrResults: {
      extractedText: [],
      boundingBoxes: [],
      confidence: 0.91,
      processingTime: 850
    }
  },
  {
    id: 'image-002',
    projectId: 'demo-project-123',
    originalUrl: 'https://s3.amazonaws.com/chicken-scratch/images/sticky-notes-001.jpg',
    filename: 'sticky-notes-batch-1.jpg',
    fileSize: 1536789,
    mimeType: 'image/jpeg',
    uploadedAt: new Date('2024-01-15T11:30:00Z'),
    processingStatus: 'completed',
    boundingBoxes: [],
    ocrResults: {
      extractedText: [],
      boundingBoxes: [],
      confidence: 0.87,
      processingTime: 720
    }
  },
  {
    id: 'image-003',
    projectId: 'demo-project-123',
    originalUrl: 'https://s3.amazonaws.com/chicken-scratch/images/notebook-pages-001.jpg',
    filename: 'notebook-pages.jpg',
    fileSize: 1789234,
    mimeType: 'image/jpeg',
    uploadedAt: new Date('2024-01-15T13:45:00Z'),
    processingStatus: 'completed',
    boundingBoxes: [],
    ocrResults: {
      extractedText: [],
      boundingBoxes: [],
      confidence: 0.89,
      processingTime: 680
    }
  }
];

async function demonstrateCSVExports() {
  console.log('🚀 Chicken Scratch CSV Export Demo\n');
  console.log('Project:', mockProject.name);
  console.log('Total Notes:', mockProject.summary.metadata.totalNotes);
  console.log('Themes Found:', mockProject.summary.topThemes.length);
  console.log('Images Processed:', mockImages.length);
  console.log('\n' + '='.repeat(60) + '\n');

  const exportOptions = {
    includeSummary: true,
    includeOriginalText: false,
    includeImages: true
  };

  // Demo 1: Detailed CSV Export
  console.log('📊 1. DETAILED CSV EXPORT');
  console.log('   Format: Complete project data with all sections');
  try {
    const detailedResult = await ExportService.generateCSV(
      mockProject,
      mockProject.summary,
      mockImages,
      {
        ...exportOptions,
        csvOptions: {
          format: 'detailed',
          includeMetadata: true,
          includeConfidence: true,
          delimiter: ',',
          encoding: 'utf8'
        }
      }
    );
    
    console.log('   ✅ Generated:', detailedResult.filename);
    console.log('   📏 Size:', detailedResult.size, 'bytes');
    console.log('   📝 Preview (first 300 chars):');
    console.log('   ' + detailedResult.content.substring(0, 300) + '...\n');
  } catch (error) {
    console.error('   ❌ Error:', error.message);
  }

  // Demo 2: Themes-only CSV Export
  console.log('🎯 2. THEMES-ONLY CSV EXPORT');
  console.log('   Format: Theme analysis with statistics');
  try {
    const themesResult = await ExportService.generateCSV(
      mockProject,
      mockProject.summary,
      mockImages,
      {
        ...exportOptions,
        csvOptions: {
          format: 'themes',
          includeMetadata: true,
          includeConfidence: true,
          delimiter: ',',
          encoding: 'utf8'
        }
      }
    );
    
    console.log('   ✅ Generated:', themesResult.filename);
    console.log('   📏 Size:', themesResult.size, 'bytes');
    console.log('   📝 Content:');
    console.log('   ' + themesResult.content.replace(/\n/g, '\n   ') + '\n');
  } catch (error) {
    console.error('   ❌ Error:', error.message);
  }

  // Demo 3: Quotes-only CSV Export
  console.log('💬 3. QUOTES-ONLY CSV EXPORT');
  console.log('   Format: Representative quotes with themes');
  try {
    const quotesResult = await ExportService.generateCSV(
      mockProject,
      mockProject.summary,
      mockImages,
      {
        ...exportOptions,
        csvOptions: {
          format: 'quotes',
          includeMetadata: false,
          includeConfidence: true,
          delimiter: ',',
          encoding: 'utf8'
        }
      }
    );
    
    console.log('   ✅ Generated:', quotesResult.filename);
    console.log('   📏 Size:', quotesResult.size, 'bytes');
    console.log('   📝 Content:');
    console.log('   ' + quotesResult.content.replace(/\n/g, '\n   ') + '\n');
  } catch (error) {
    console.error('   ❌ Error:', error.message);
  }

  // Demo 4: Summary CSV Export
  console.log('📋 4. SUMMARY CSV EXPORT');
  console.log('   Format: Project overview with insights');
  try {
    const summaryResult = await ExportService.generateCSV(
      mockProject,
      mockProject.summary,
      mockImages,
      {
        ...exportOptions,
        csvOptions: {
          format: 'summary',
          includeMetadata: true,
          includeConfidence: false,
          delimiter: ',',
          encoding: 'utf8'
        }
      }
    );
    
    console.log('   ✅ Generated:', summaryResult.filename);
    console.log('   📏 Size:', summaryResult.size, 'bytes');
    console.log('   📝 Preview (first 400 chars):');
    console.log('   ' + summaryResult.content.substring(0, 400) + '...\n');
  } catch (error) {
    console.error('   ❌ Error:', error.message);
  }

  // Demo 5: Different Delimiters and Encodings
  console.log('🔧 5. ALTERNATIVE FORMATS');
  
  // Semicolon delimiter
  console.log('   📄 Semicolon-delimited (European format):');
  try {
    const semicolonResult = await ExportService.generateCSV(
      mockProject,
      mockProject.summary,
      mockImages,
      {
        ...exportOptions,
        csvOptions: {
          format: 'themes',
          includeMetadata: false,
          includeConfidence: false,
          delimiter: ';',
          encoding: 'utf8'
        }
      }
    );
    
    console.log('     ✅ Generated with semicolon delimiter');
    console.log('     📝 Sample line:', semicolonResult.content.split('\n')[1]);
  } catch (error) {
    console.error('     ❌ Error:', error.message);
  }

  // Tab delimiter
  console.log('   📄 Tab-delimited (TSV format):');
  try {
    const tabResult = await ExportService.generateCSV(
      mockProject,
      mockProject.summary,
      mockImages,
      {
        ...exportOptions,
        csvOptions: {
          format: 'themes',
          includeMetadata: false,
          includeConfidence: false,
          delimiter: '\t',
          encoding: 'utf8'
        }
      }
    );
    
    console.log('     ✅ Generated with tab delimiter');
    console.log('     📝 Sample line:', tabResult.content.split('\n')[1]);
  } catch (error) {
    console.error('     ❌ Error:', error.message);
  }

  // UTF-16LE encoding
  console.log('   📄 UTF-16LE encoding (Excel compatibility):');
  try {
    const utf16Result = await ExportService.generateCSV(
      mockProject,
      mockProject.summary,
      mockImages,
      {
        ...exportOptions,
        csvOptions: {
          format: 'themes',
          includeMetadata: false,
          includeConfidence: false,
          delimiter: ',',
          encoding: 'utf16le'
        }
      }
    );
    
    const buffer = ExportService.convertCSVEncoding(utf16Result.content, 'utf16le');
    console.log('     ✅ Generated with UTF-16LE encoding');
    console.log('     📏 Buffer size:', buffer.length, 'bytes');
    console.log('     🔍 BOM present:', buffer[0] === 0xFF && buffer[1] === 0xFE ? 'Yes' : 'No');
  } catch (error) {
    console.error('     ❌ Error:', error.message);
  }

  console.log('\n' + '='.repeat(60));
  console.log('✨ CSV Export Demo Complete!');
  console.log('📚 All CSV formats support:');
  console.log('   • Multiple delimiters (comma, semicolon, tab)');
  console.log('   • Multiple encodings (UTF-8, UTF-16LE)');
  console.log('   • Configurable confidence scores');
  console.log('   • Optional metadata inclusion');
  console.log('   • Proper CSV escaping for special characters');
  console.log('   • Excel compatibility with BOM headers');
}

// Run the demo
demonstrateCSVExports().catch(console.error);