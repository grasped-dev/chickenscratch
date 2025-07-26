# PDF Export Service Documentation

## Overview

The PDF Export Service provides comprehensive PDF generation capabilities for Chicken Scratch project reports. It supports both PDFKit and Puppeteer-based generation with customizable branding and export options.

## Features

### Core Functionality
- **PDF Generation**: Two methods available (PDFKit and Puppeteer)
- **Custom Branding**: Company logos, colors, fonts, and styling
- **Flexible Options**: Include/exclude summaries, images, and original text
- **Template System**: Default, minimal, and detailed templates
- **File Management**: Automatic cleanup of temporary files

### Export Options
- `includeSummary`: Include overall insights section
- `includeOriginalText`: Include raw extracted text
- `includeImages`: Embed original images in PDF
- `customTemplate`: Custom HTML template for advanced layouts
- `branding`: Custom styling and branding options

### Branding Options
- `companyName`: Organization name for headers/footers
- `primaryColor`: Main brand color (hex code)
- `secondaryColor`: Secondary brand color (hex code)
- `fontFamily`: Font family for text
- `logoUrl`: Company logo URL (optional)

## API Endpoints

### GET /api/export/options
Returns available export options and templates.

**Response:**
```json
{
  "formats": ["pdf"],
  "templates": ["default", "minimal", "detailed"],
  "brandingOptions": {
    "primaryColor": "Hex color code for primary branding",
    "secondaryColor": "Hex color code for secondary branding",
    "fontFamily": "Font family name",
    "companyName": "Company or organization name",
    "logoUrl": "URL to company logo (optional)"
  },
  "exportOptions": {
    "includeSummary": "Include overall insights section",
    "includeOriginalText": "Include original extracted text",
    "includeImages": "Include original images in export",
    "customTemplate": "Custom HTML template (advanced users)"
  }
}
```

### POST /api/export/:projectId/preview
Generate export preview without creating actual PDF.

**Request Body:**
```json
{
  "includeSummary": true,
  "includeImages": true,
  "includeOriginalText": false,
  "branding": {
    "companyName": "My Company",
    "primaryColor": "#2563eb"
  }
}
```

**Response:**
```json
{
  "project": {
    "name": "Project Name",
    "description": "Project description",
    "createdAt": "2024-01-01T00:00:00.000Z"
  },
  "summary": { /* ProjectSummary object */ },
  "imageCount": 2,
  "estimatedPages": 4,
  "sections": {
    "overview": true,
    "insights": true,
    "themes": true,
    "quotes": true,
    "images": true
  }
}
```

### POST /api/export/:projectId/pdf
Generate PDF using PDFKit (faster, basic layouts).

**Request Body:**
```json
{
  "includeSummary": true,
  "includeImages": true,
  "includeOriginalText": false,
  "branding": {
    "companyName": "My Company",
    "primaryColor": "#2563eb",
    "secondaryColor": "#64748b",
    "fontFamily": "Arial"
  }
}
```

**Response:** PDF file download

### POST /api/export/:projectId/pdf/advanced
Generate PDF using Puppeteer (slower, advanced layouts).

**Request Body:** Same as basic PDF endpoint

**Response:** PDF file download

## Service Architecture

### ExportService Class

#### Methods

**generatePDF(project, summary, images, options)**
- Uses PDFKit for fast PDF generation
- Suitable for standard layouts
- Supports custom branding and styling
- Returns PDFGenerationResult

**generatePDFWithPuppeteer(project, summary, images, options)**
- Uses Puppeteer for HTML-to-PDF conversion
- Supports complex layouts and CSS styling
- Better for custom templates
- Returns PDFGenerationResult

**cleanupTempFiles()**
- Removes temporary files older than 24 hours
- Runs automatically during PDF generation
- Prevents disk space issues

#### PDF Content Sections

1. **Header**: Company branding, project name, generation date
2. **Project Overview**: Basic project information and statistics
3. **Overall Insights**: Summary of key findings (optional)
4. **Key Themes**: Detailed theme analysis with quotes
5. **Representative Quotes**: Additional notable quotes
6. **Images**: Original uploaded images (optional)
7. **Footer**: Page numbers and branding

## Implementation Details

### PDFKit Implementation
- Direct PDF generation using JavaScript
- Custom styling with programmatic layout
- Automatic page breaks and pagination
- Footer generation across all pages

### Puppeteer Implementation
- HTML template generation
- CSS styling for professional layouts
- Print-optimized CSS with proper margins
- Responsive design considerations

### Error Handling
- Comprehensive error categorization
- Graceful fallbacks for missing data
- Proper cleanup on failures
- User-friendly error messages

### Security Considerations
- Input validation for all parameters
- File size limits for generated PDFs
- Temporary file cleanup
- User authentication required

## Testing

### Unit Tests (export.service.test.ts)
- PDF generation with various options
- Branding customization
- Error handling scenarios
- File cleanup functionality
- Edge cases (empty themes, long text)

### Integration Tests (export.integration.test.ts)
- API endpoint testing
- Authentication verification
- Request/response validation
- Error response handling

## Usage Examples

### Basic PDF Generation
```javascript
const options = {
  includeSummary: true,
  includeImages: true,
  includeOriginalText: false
};

const result = await ExportService.generatePDF(
  project,
  summary,
  images,
  options
);
```

### Custom Branding
```javascript
const options = {
  includeSummary: true,
  includeImages: true,
  branding: {
    companyName: 'Acme Corp',
    primaryColor: '#8b5cf6',
    secondaryColor: '#64748b',
    fontFamily: 'Helvetica'
  }
};

const result = await ExportService.generatePDFWithPuppeteer(
  project,
  summary,
  images,
  options
);
```

## Performance Considerations

### PDFKit vs Puppeteer
- **PDFKit**: Faster, lower memory usage, basic layouts
- **Puppeteer**: Slower, higher memory usage, advanced layouts

### Optimization Strategies
- Temporary file cleanup
- Memory-efficient PDF generation
- Concurrent request limiting
- Caching for repeated exports

## Future Enhancements

### Planned Features
- CSV export support (Task 13)
- Custom template uploads
- Batch export capabilities
- Export scheduling
- Additional output formats

### Template System
- Template marketplace
- Custom CSS injection
- Dynamic layout options
- Multi-language support

## Dependencies

- **pdfkit**: PDF generation library
- **puppeteer**: Headless Chrome for HTML-to-PDF
- **fs/promises**: File system operations
- **path**: File path utilities

## Configuration

### Environment Variables
- `TEMP_DIR`: Temporary file directory (default: ./temp)
- `MAX_PDF_SIZE`: Maximum PDF file size
- `CLEANUP_INTERVAL`: File cleanup interval

### Default Settings
- Page size: A4
- Margins: 50px all sides
- Font: Helvetica
- Primary color: #2563eb
- Secondary color: #64748b