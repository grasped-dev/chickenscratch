# OCR Service Documentation

## Overview

The OCR (Optical Character Recognition) service provides comprehensive text extraction capabilities using AWS Textract. It supports both synchronous and asynchronous processing, handles various document types including handwritten notes, printed text, tables, and forms.

## Features

- **Synchronous Processing**: Fast processing for small images
- **Asynchronous Processing**: Scalable processing for large images or batch operations
- **Advanced Text Detection**: Supports handwriting, printed text, tables, and forms
- **Retry Logic**: Automatic retry with exponential backoff for transient failures
- **Batch Processing**: Process multiple images concurrently
- **Error Handling**: Comprehensive error categorization and handling
- **AWS SDK v3**: Modern AWS SDK implementation with improved performance

## API Endpoints

### POST /api/ocr/process/sync
Process an image synchronously using AWS Textract.

**Request Body:**
```json
{
  "imageUrl": "s3://bucket/image.jpg",
  "processingOptions": {
    "detectHandwriting": true,
    "detectTables": false,
    "detectForms": false
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "extractedText": [
      {
        "id": "text-1",
        "text": "Hello World",
        "confidence": 95.5,
        "boundingBox": {
          "left": 0.1,
          "top": 0.2,
          "width": 0.3,
          "height": 0.05
        },
        "type": "LINE"
      }
    ],
    "boundingBoxes": [...],
    "confidence": 95.5,
    "processingTime": 1500
  }
}
```

### POST /api/ocr/process/async
Start asynchronous processing for large images or when advanced features are needed.

**Request Body:**
```json
{
  "imageUrl": "s3://bucket/large-image.jpg",
  "processingOptions": {
    "detectHandwriting": true,
    "detectTables": true,
    "detectForms": true
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "jobId": "job-123",
    "status": "processing",
    "message": "OCR processing started successfully"
  }
}
```

### GET /api/ocr/jobs/:jobId/results
Get results from an asynchronous processing job.

**Response:**
```json
{
  "success": true,
  "data": {
    "extractedText": [...],
    "boundingBoxes": [...],
    "confidence": 92.3,
    "processingTime": 2500
  }
}
```

### GET /api/ocr/jobs/:jobId/status
Check the status of an asynchronous processing job.

**Response:**
```json
{
  "success": true,
  "data": {
    "jobId": "job-123",
    "status": "SUCCEEDED"
  }
}
```

### POST /api/ocr/process/retry
Process an image with automatic retry logic for improved reliability.

**Request Body:**
```json
{
  "imageUrl": "s3://bucket/image.jpg",
  "maxRetries": 3,
  "useAsync": false,
  "processingOptions": {
    "detectHandwriting": true,
    "detectTables": false,
    "detectForms": false
  }
}
```

### POST /api/ocr/process/batch
Process multiple images in batch with concurrency control.

**Request Body:**
```json
{
  "requests": [
    {
      "imageUrl": "s3://bucket/image1.jpg",
      "processingOptions": {
        "detectHandwriting": true,
        "detectTables": false,
        "detectForms": false
      }
    },
    {
      "imageUrl": "s3://bucket/image2.jpg",
      "processingOptions": {
        "detectHandwriting": true,
        "detectTables": true,
        "detectForms": false
      }
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "results": [...],
    "totalProcessed": 2,
    "totalRequested": 2
  }
}
```

## Processing Options

### detectHandwriting
- **Type**: boolean
- **Default**: true
- **Description**: Enable handwriting detection for handwritten notes and annotations

### detectTables
- **Type**: boolean
- **Default**: false
- **Description**: Enable table detection and cell extraction for structured data

### detectForms
- **Type**: boolean
- **Default**: false
- **Description**: Enable form detection for key-value pairs and form fields

## Error Handling

The service provides comprehensive error handling with categorized error types:

### Error Categories

1. **Access Errors** (403)
   - AWS credentials invalid
   - S3 bucket access denied
   - Textract service permissions

2. **Resource Errors** (404)
   - Image not found in S3
   - Invalid S3 URL
   - Job ID not found

3. **Validation Errors** (400)
   - Invalid image format
   - Missing required parameters
   - Malformed request

4. **Rate Limiting** (429)
   - AWS Textract throttling
   - Service quota exceeded

5. **Processing Errors** (408)
   - OCR processing timeout
   - Image quality too poor

6. **Server Errors** (500)
   - Internal service errors
   - AWS service unavailable

### Error Response Format

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "retryable": true,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Retry Logic

The service implements intelligent retry logic with:

- **Exponential Backoff**: 2s, 4s, 8s delays between retries
- **Error Classification**: Automatic detection of retryable vs non-retryable errors
- **Configurable Retries**: Default 3 retries, configurable per request
- **Circuit Breaker**: Prevents cascading failures

### Retryable Errors
- Network timeouts
- Service throttling
- Temporary service unavailability
- Rate limiting

### Non-Retryable Errors
- Access denied
- Invalid credentials
- Malformed requests
- Resource not found

## Performance Considerations

### Synchronous Processing
- **Best for**: Images < 5MB
- **Response time**: 1-5 seconds
- **Concurrency**: Limited by AWS Textract sync limits

### Asynchronous Processing
- **Best for**: Images > 5MB or batch processing
- **Response time**: 10-60 seconds
- **Concurrency**: Higher throughput for large volumes

### Batch Processing
- **Concurrency Limit**: 5 concurrent requests
- **Chunking**: Automatic request chunking for large batches
- **Error Isolation**: Individual request failures don't affect the batch

## Configuration

### Environment Variables

```bash
# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_S3_BUCKET=your-bucket-name

# Textract Async Configuration (optional)
AWS_SNS_TOPIC_ARN=arn:aws:sns:region:account:topic
AWS_TEXTRACT_ROLE_ARN=arn:aws:iam::account:role/TextractRole

# Processing Timeouts
OCR_TIMEOUT=30000
```

### AWS Permissions

Required IAM permissions for the service:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "textract:DetectDocumentText",
        "textract:AnalyzeDocument",
        "textract:StartDocumentTextDetection",
        "textract:StartDocumentAnalysis",
        "textract:GetDocumentTextDetection",
        "textract:GetDocumentAnalysis"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject"
      ],
      "Resource": "arn:aws:s3:::your-bucket/*"
    }
  ]
}
```

## Usage Examples

### Basic Text Extraction

```typescript
import { ocrService } from './services/ocr';

const result = await ocrService.processImageSync({
  imageUrl: 's3://bucket/handwritten-note.jpg',
  processingOptions: {
    detectHandwriting: true,
    detectTables: false,
    detectForms: false
  }
});

console.log('Extracted text:', result.extractedText);
console.log('Confidence:', result.confidence);
```

### Table Processing

```typescript
const result = await ocrService.processImageSync({
  imageUrl: 's3://bucket/table-document.jpg',
  processingOptions: {
    detectHandwriting: false,
    detectTables: true,
    detectForms: false
  }
});

// Filter table cells
const tableCells = result.extractedText.filter(block => block.type === 'CELL');
```

### Batch Processing

```typescript
const requests = [
  { imageUrl: 's3://bucket/image1.jpg', processingOptions: { detectHandwriting: true, detectTables: false, detectForms: false } },
  { imageUrl: 's3://bucket/image2.jpg', processingOptions: { detectHandwriting: true, detectTables: true, detectForms: false } }
];

const results = await ocrService.processBatch(requests);
console.log(`Processed ${results.length} images`);
```

## Testing

The service includes comprehensive test coverage:

- **Unit Tests**: Mock AWS services for isolated testing
- **Integration Tests**: End-to-end API testing
- **Error Scenarios**: Comprehensive error handling tests
- **Performance Tests**: Load testing for batch operations

### Running Tests

```bash
# Unit tests
npm test src/test/ocr.service.test.ts

# Integration tests
npm run test:integration tests/integration/ocr.integration.test.ts

# All tests
npm test
```

## Monitoring and Observability

### Metrics to Monitor

- **Processing Time**: Average OCR processing duration
- **Success Rate**: Percentage of successful OCR operations
- **Error Rate**: Categorized error rates by type
- **Confidence Scores**: Average confidence of extracted text
- **Throughput**: Requests per second/minute

### Logging

The service provides structured logging for:

- Request/response details
- Processing times
- Error details with stack traces
- AWS service interactions
- Retry attempts and outcomes

## Troubleshooting

### Common Issues

1. **Low Confidence Scores**
   - Check image quality and resolution
   - Ensure proper lighting and contrast
   - Consider image preprocessing

2. **Processing Timeouts**
   - Use async processing for large images
   - Check AWS service status
   - Verify network connectivity

3. **Access Denied Errors**
   - Verify AWS credentials
   - Check IAM permissions
   - Ensure S3 bucket access

4. **Rate Limiting**
   - Implement exponential backoff
   - Use batch processing for multiple images
   - Consider AWS service quotas

### Debug Mode

Enable debug logging by setting:

```bash
NODE_ENV=development
LOG_LEVEL=debug
```

This provides detailed information about:
- AWS API calls and responses
- Processing steps and timing
- Error details and stack traces
- Retry attempts and decisions