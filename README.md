# Chicken Scratch

Transform physical notes and scribbles into actionable digital insights.

## Overview

Chicken Scratch is a web-based application that transforms physical notes into digital insights through a multi-stage processing pipeline. Users can capture photos of sticky notes, whiteboards, chart paper, index cards, or notebook pages, and the system will automatically extract text, organize content semantically, and provide summarized insights that can be easily shared and exported.

## Features

- 📱 **Multi-platform capture**: Mobile camera integration and desktop file upload
- 🔍 **Advanced OCR**: AWS Textract for handwritten and printed text extraction
- 🎯 **Smart clustering**: Semantic analysis and theme identification
- 📊 **Comprehensive summaries**: Automated insights with exportable reports
- 💾 **Project management**: History tracking and organization
- 🚀 **Progressive Web App**: Mobile-optimized experience

## Technology Stack

### Frontend
- React.js with TypeScript
- Tailwind CSS for styling
- Progressive Web App (PWA) capabilities
- Vite for build tooling

### Backend
- Node.js with Express.js
- TypeScript for type safety
- PostgreSQL database
- Redis for caching and job queues

### Cloud Services
- AWS Textract for OCR processing
- AWS S3 for file storage
- OpenAI API for embeddings and analysis

## Quick Start

### Prerequisites

- Node.js 18+ and npm 9+
- Docker and Docker Compose
- AWS account with Textract access
- OpenAI API key

### Development Setup

1. **Clone and install dependencies**
   ```bash
   git clone <repository-url>
   cd chicken-scratch
   npm run setup
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start development environment**
   ```bash
   # Using Docker (recommended)
   npm run docker:up
   
   # Or run locally
   npm run dev
   ```

4. **Access the application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:3001
   - Database: localhost:5432
   - Redis: localhost:6379

### Available Scripts

#### Root Level
- `npm run dev` - Start both frontend and backend in development mode
- `npm run build` - Build all packages for production
- `npm test` - Run tests across all packages
- `npm run lint` - Lint all packages
- `npm run format` - Format code with Prettier
- `npm run setup` - Install dependencies and build shared package
- `npm run clean` - Clean all build artifacts and dependencies

#### Docker Commands
- `npm run docker:build` - Build Docker containers
- `npm run docker:up` - Start services in detached mode
- `npm run docker:down` - Stop and remove containers
- `npm run docker:logs` - View container logs

#### Individual Packages
- `npm run dev:frontend` - Start frontend development server
- `npm run dev:backend` - Start backend development server
- `npm run test:frontend` - Run frontend tests
- `npm run test:backend` - Run backend tests
- `npm run test:e2e` - Run end-to-end tests
- `npm run test:integration` - Run integration tests

## Project Structure

```
chicken-scratch/
├── frontend/                 # React.js application
│   ├── src/
│   │   ├── components/      # Reusable React components
│   │   ├── pages/          # Route-level page components
│   │   ├── hooks/          # Custom React hooks
│   │   ├── services/       # API client and external services
│   │   ├── types/          # TypeScript type definitions
│   │   ├── utils/          # Helper functions
│   │   └── styles/         # Tailwind CSS configurations
│   └── public/             # Static assets
├── backend/                 # Node.js API server
│   ├── src/
│   │   ├── controllers/    # Express route handlers
│   │   ├── services/       # Business logic layer
│   │   ├── models/         # Database models
│   │   ├── middleware/     # Express middleware
│   │   ├── routes/         # API route definitions
│   │   ├── utils/          # Helper functions
│   │   ├── config/         # Configuration files
│   │   └── types/          # TypeScript type definitions
│   ├── migrations/         # Database migration scripts
│   └── tests/              # Unit and integration tests
├── shared/                  # Shared TypeScript types and utilities
│   ├── src/
│   │   ├── types/          # Common interfaces
│   │   └── utils/          # Shared utilities
└── docker-compose.yml       # Local development environment
```

## Environment Configuration

Copy `.env.example` to `.env` and configure the following:

### Required Configuration
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `JWT_SECRET` - Secret key for JWT tokens
- `AWS_ACCESS_KEY_ID` - AWS access key
- `AWS_SECRET_ACCESS_KEY` - AWS secret key
- `AWS_S3_BUCKET` - S3 bucket for file storage
- `OPENAI_API_KEY` - OpenAI API key

### Optional Configuration
- `PORT` - Backend server port (default: 3001)
- `NODE_ENV` - Environment (development/production)
- `CORS_ORIGIN` - Frontend URL for CORS
- `MAX_FILE_SIZE` - Maximum upload file size
- `OCR_TIMEOUT` - OCR processing timeout
- `CLUSTERING_TIMEOUT` - Clustering processing timeout

## Development Guidelines

### Code Style
- TypeScript strict mode enabled
- ESLint for code linting
- Prettier for code formatting
- Consistent import organization

### Testing
- Unit tests with Vitest
- Integration tests for API endpoints
- End-to-end tests with Cypress
- Component tests with React Testing Library

### Git Workflow
- Feature branches from main
- Pull requests for code review
- Conventional commit messages
- Automated testing in CI/CD

## Deployment

### Production Build
```bash
npm run build
npm run docker:build
```

### Environment Setup
- Configure production environment variables
- Set up AWS services (S3, Textract)
- Configure database and Redis instances
- Set up monitoring and logging

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For questions and support, please open an issue in the GitHub repository.