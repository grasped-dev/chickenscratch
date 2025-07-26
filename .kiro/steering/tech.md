# Technology Stack

## Frontend
- **Framework**: React.js with TypeScript
- **Styling**: Tailwind CSS for responsive design
- **PWA**: Progressive Web App capabilities for mobile experience
- **Features**: File upload with drag-and-drop, camera integration

## Backend
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript for type safety and consistency
- **Authentication**: JWT-based session management
- **API**: RESTful design with OpenAPI documentation

## Cloud Services
- **OCR**: AWS Textract for text extraction from images
- **Storage**: AWS S3 for image storage with CloudFront CDN
- **AI/ML**: OpenAI API for embeddings and LLM processing
- **Cache**: Redis for caching and session storage

## Database
- **Primary**: PostgreSQL for structured data (projects, users, metadata)
- **Vector**: Pinecone or Weaviate for embedding storage and similarity search

## Infrastructure
- **Containers**: Docker for deployment
- **Orchestration**: AWS ECS or similar container orchestration
- **Load Balancing**: Application Load Balancer for high availability

## Common Commands

### Development Setup
```bash
# Install dependencies
npm install

# Start development servers
npm run dev          # Frontend development server
npm run dev:api      # Backend API server

# Build for production
npm run build        # Frontend build
npm run build:api    # Backend build
```

### Testing
```bash
npm test             # Run unit tests
npm run test:e2e     # Run end-to-end tests
npm run test:integration  # Run integration tests
```

### Docker Operations
```bash
# Build containers
docker-compose build

# Start services
docker-compose up -d

# View logs
docker-compose logs -f
```

## Code Quality Tools
- **Linting**: ESLint with TypeScript rules
- **Formatting**: Prettier for consistent code style
- **Testing**: Jest for unit tests, Cypress for E2E
- **Type Checking**: TypeScript strict mode enabled