# Project Structure

## Root Directory Organization

```
chicken-scratch/
├── frontend/                 # React.js application
├── backend/                  # Node.js API server
├── shared/                   # Shared TypeScript types and utilities
├── docker-compose.yml        # Local development environment
├── .env.example             # Environment variables template
└── README.md                # Project documentation
```

## Frontend Structure (`frontend/`)

```
frontend/
├── src/
│   ├── components/          # Reusable React components
│   │   ├── upload/         # File upload and camera components
│   │   ├── processing/     # OCR and analysis UI components
│   │   ├── results/        # Summary and export components
│   │   └── common/         # Shared UI components
│   ├── pages/              # Route-level page components
│   ├── hooks/              # Custom React hooks
│   ├── services/           # API client and external service integrations
│   ├── types/              # TypeScript type definitions
│   ├── utils/              # Helper functions and utilities
│   └── styles/             # Tailwind CSS configurations
├── public/                 # Static assets
└── package.json           # Frontend dependencies
```

## Backend Structure (`backend/`)

```
backend/
├── src/
│   ├── controllers/        # Express route handlers
│   ├── services/           # Business logic layer
│   │   ├── upload/        # File upload handling
│   │   ├── ocr/           # AWS Textract integration
│   │   ├── processing/    # Text cleaning and normalization
│   │   ├── clustering/    # Semantic analysis and clustering
│   │   ├── export/        # PDF/CSV generation
│   │   └── auth/          # Authentication services
│   ├── models/            # Database models and schemas
│   ├── middleware/        # Express middleware (auth, validation, etc.)
│   ├── routes/            # API route definitions
│   ├── utils/             # Helper functions and utilities
│   ├── config/            # Configuration files
│   └── types/             # TypeScript type definitions
├── migrations/            # Database migration scripts
├── tests/                # Unit and integration tests
└── package.json          # Backend dependencies
```

## Shared Structure (`shared/`)

```
shared/
├── types/                 # Common TypeScript interfaces
│   ├── api.ts            # API request/response types
│   ├── models.ts         # Database entity types
│   └── processing.ts     # OCR and analysis types
└── utils/                # Utilities used by both frontend and backend
```

## Key Architectural Patterns

### Component Organization
- **Atomic Design**: Components organized by complexity (atoms, molecules, organisms)
- **Feature-based**: Group related components, hooks, and services together
- **Separation of Concerns**: Clear distinction between UI, business logic, and data layers

### Service Layer Pattern
- **Controllers**: Handle HTTP requests/responses, minimal business logic
- **Services**: Contain business logic, orchestrate data operations
- **Models**: Database interactions and data validation
- **Utilities**: Pure functions for data transformation and helpers

### File Naming Conventions
- **Components**: PascalCase (e.g., `UploadComponent.tsx`)
- **Services**: camelCase (e.g., `ocrService.ts`)
- **Types**: PascalCase interfaces (e.g., `ProcessingRequest`)
- **Utilities**: camelCase (e.g., `textCleaner.ts`)

### Import Organization
```typescript
// External libraries
import React from 'react';
import express from 'express';

// Internal modules (absolute paths)
import { UploadService } from '@/services/upload';
import { ProcessingRequest } from '@/types/processing';

// Relative imports
import './Component.styles.css';
```

## Configuration Management
- **Environment Variables**: Separate configs for development, staging, production
- **Secrets**: Never commit sensitive data, use environment variables
- **Feature Flags**: Toggle features without code deployment
- **API Versioning**: Maintain backward compatibility with versioned endpoints