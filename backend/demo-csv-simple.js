#!/usr/bin/env node

/**
 * Simple CSV export demo without TypeScript compilation
 * This demonstrates the CSV generation logic directly
 */

// Mock CSV generation functions (simplified versions of the actual implementation)

function escapeCSVField(field, delimiter) {
  if (!field) return '';
  
  const str = String(field);
  const needsEscaping = str.includes(delimiter) || str.includes('"') || str.includes('\n') || str.includes('\r');
  
  if (needsEscaping) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  
  return str;
}

function generateThemesCSV(summary, options) {
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

  const rows = [headers];

  summary.topThemes.forEach(theme => {
    const row = [
      escapeCSVField(theme.label, options.delimiter),
      theme.noteCount.toString(),
      theme.percentage.toFixed(2),
      escapeCSVField(theme.keyTerms.join('; '), options.delimiter),
      escapeCSVField(theme.representativeQuote, options.delimiter)
    ];

    if (options.includeConfidence) {
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

function generateQuotesCSV(summary, options) {
  const headers = [
    'Quote',
    'Theme',
    'Source'
  ];

  if (options.includeConfidence) {
    headers.push('Confidence');
  }

  const rows = [headers];

  summary.representativeQuotes.forEach(quote => {
    const row = [
      escapeCSVField(quote.text, options.delimiter),
      escapeCSVField(quote.theme, options.delimiter),
      escapeCSVField(quote.source, options.delimiter)
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

function generateDetailedCSV(project, summary, images, options) {
  const rows = [];

  // Project information
  rows.push(['Project Information']);
  rows.push(['Field', 'Value']);
  rows.push(['Name', escapeCSVField(project.name, options.delimiter)]);
  rows.push(['Description', escapeCSVField(project.description || '', options.delimiter)]);
  rows.push(['Created At', project.createdAt.toISOString()]);
  rows.push(['Status', project.status]);
  rows.push(['Image Count', images.length.toString()]);
  rows.push([]);

  // Overall insights
  rows.push(['Overall Insights']);
  rows.push([escapeCSVField(summary.overallInsights, options.delimiter)]);
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
      escapeCSVField(theme.label, options.delimiter),
      theme.noteCount.toString(),
      theme.percentage.toFixed(2),
      escapeCSVField(theme.keyTerms.join('; '), options.delimiter),
      escapeCSVField(theme.representativeQuote, options.delimiter)
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
      escapeCSVField(quote.text, options.delimiter),
      escapeCSVField(quote.theme, options.delimiter),
      escapeCSVField(quote.source, options.delimiter)
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
      escapeCSVField(dist.theme, options.delimiter),
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
        escapeCSVField(image.filename, options.delimiter),
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
  }
];

function demonstrateCSVExports() {
  console.log('🚀 Chicken Scratch CSV Export Demo (Simplified)\n');
  console.log('Project:', mockProject.name);
  console.log('Total Notes:', mockProject.summary.metadata.totalNotes);
  console.log('Themes Found:', mockProject.summary.topThemes.length);
  console.log('Images Processed:', mockImages.length);
  console.log('\n' + '='.repeat(60) + '\n');

  // Demo 1: Themes CSV Export
  console.log('🎯 1. THEMES CSV EXPORT');
  const themesOptions = {
    includeMetadata: true,
    includeConfidence: true,
    delimiter: ',',
    encoding: 'utf8'
  };

  const themesCSV = generateThemesCSV(mockProject.summary, themesOptions);
  console.log('   📝 Content:');
  console.log('   ' + themesCSV.replace(/\n/g, '\n   ') + '\n');

  // Demo 2: Quotes CSV Export
  console.log('💬 2. QUOTES CSV EXPORT');
  const quotesOptions = {
    includeMetadata: false,
    includeConfidence: true,
    delimiter: ',',
    encoding: 'utf8'
  };

  const quotesCSV = generateQuotesCSV(mockProject.summary, quotesOptions);
  console.log('   📝 Content:');
  console.log('   ' + quotesCSV.replace(/\n/g, '\n   ') + '\n');

  // Demo 3: Detailed CSV Export (first 800 chars)
  console.log('📊 3. DETAILED CSV EXPORT (Preview)');
  const detailedOptions = {
    includeMetadata: true,
    includeConfidence: true,
    delimiter: ',',
    encoding: 'utf8'
  };

  const detailedCSV = generateDetailedCSV(mockProject, mockProject.summary, mockImages, detailedOptions);
  console.log('   📝 Preview (first 800 chars):');
  console.log('   ' + detailedCSV.substring(0, 800).replace(/\n/g, '\n   ') + '...\n');

  // Demo 4: Different Delimiters
  console.log('🔧 4. ALTERNATIVE DELIMITERS');
  
  // Semicolon delimiter
  const semicolonOptions = { ...themesOptions, delimiter: ';' };
  const semicolonCSV = generateThemesCSV(mockProject.summary, semicolonOptions);
  console.log('   📄 Semicolon-delimited:');
  console.log('   ' + semicolonCSV.split('\n')[1] + '\n');

  // Tab delimiter
  const tabOptions = { ...themesOptions, delimiter: '\t' };
  const tabCSV = generateThemesCSV(mockProject.summary, tabOptions);
  console.log('   📄 Tab-delimited:');
  console.log('   ' + tabCSV.split('\n')[1] + '\n');

  // Demo 5: Special Character Escaping
  console.log('🔒 5. SPECIAL CHARACTER ESCAPING');
  const specialProject = {
    ...mockProject,
    name: 'Project with "quotes" and, commas',
    summary: {
      ...mockProject.summary,
      topThemes: [
        {
          label: 'Theme with "quotes" and, commas',
          noteCount: 5,
          percentage: 50,
          keyTerms: ['term1', 'term2'],
          representativeQuote: 'Quote with "quotes" and, commas\nand newlines'
        }
      ]
    }
  };

  const escapedCSV = generateThemesCSV(specialProject.summary, themesOptions);
  console.log('   📝 Escaped content:');
  console.log('   ' + escapedCSV.split('\n')[1] + '\n');

  console.log('='.repeat(60));
  console.log('✨ CSV Export Demo Complete!');
  console.log('📚 Features demonstrated:');
  console.log('   • Multiple CSV formats (themes, quotes, detailed)');
  console.log('   • Multiple delimiters (comma, semicolon, tab)');
  console.log('   • Configurable confidence scores and metadata');
  console.log('   • Proper CSV escaping for special characters');
  console.log('   • Structured data export for spreadsheet compatibility');
}

// Run the demo
demonstrateCSVExports();