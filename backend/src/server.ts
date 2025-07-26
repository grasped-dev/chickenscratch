import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import compression from 'compression'
import dotenv from 'dotenv'
import { createServer } from 'http'

// Import routes
import authRoutes from './routes/auth.js'
import uploadRoutes from './routes/upload.js'
import ocrRoutes from './routes/ocr.js'
import boundingBoxRoutes from './routes/boundingBox.js'
import clusteringRoutes from './routes/clustering.js'
import summaryRoutes from './routes/summary.js'
import exportRoutes from './routes/export.js'
import projectRoutes from './routes/project.js'
import jobRoutes from './routes/jobs.js'
import workflowRoutes from './routes/workflow.js'

// Import services
import { initializeWebSocketService } from './services/websocket.js'
import { initializeJobQueueService } from './services/jobQueue.js'
import { initializeJobWorkerService } from './services/jobWorker.js'
import { initializeWorkflowService } from './services/workflow.js'

// Import error handling middleware
import {
  requestIdMiddleware,
  requestLoggingMiddleware,
  errorHandlingMiddleware,
  notFoundHandler,
  errorSystemHealthCheck,
  gracefulShutdownHandler,
  setupGlobalErrorHandlers
} from './middleware/errorHandler.js'
import Logger, { LogCategory } from './utils/logger.js'

// Load environment variables
dotenv.config()

// Setup global error handlers
setupGlobalErrorHandlers()

const app = express()
const server = createServer(app)
const PORT = process.env.PORT || 3001

// Error handling middleware (must be first)
app.use(requestIdMiddleware)
app.use(requestLoggingMiddleware)

// Security and parsing middleware
app.use(helmet())
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}))
app.use(compression())

// Custom morgan format that includes request ID
app.use(morgan(':method :url :status :res[content-length] - :response-time ms [:req[x-request-id]]'))

app.use(express.json({ 
  limit: '10mb'
}))

// Handle JSON parsing errors
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (error instanceof SyntaxError && 'body' in error) {
    return next(error); // Let the main error handler deal with it
  }
  next(error);
})
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/upload', uploadRoutes)
app.use('/api/ocr', ocrRoutes)
app.use('/api/boundingBox', boundingBoxRoutes)
app.use('/api/clustering', clusteringRoutes)
app.use('/api/summary', summaryRoutes)
app.use('/api/export', exportRoutes)
app.use('/api/projects', projectRoutes)
app.use('/api/jobs', jobRoutes)
app.use('/api', workflowRoutes)

// Health check endpoints
app.get('/api/health', (_req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  })
})

// Error system health check
app.get('/api/health/errors', (_req, res) => {
  const healthCheck = errorSystemHealthCheck()
  res.json({
    ...healthCheck,
    timestamp: new Date().toISOString()
  })
})

// 404 handler (must be after all routes)
app.use('*', notFoundHandler)

// Error handling middleware (must be last)
app.use(errorHandlingMiddleware)

server.listen(PORT, () => {
  Logger.info(`Server starting on port ${PORT}`, {
    category: LogCategory.SYSTEM,
    metadata: { port: PORT, environment: process.env.NODE_ENV || 'development' }
  })
  
  console.log(`🚀 Server running on port ${PORT}`)
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`)
  console.log(`🔍 Error monitoring: http://localhost:${PORT}/api/health/errors`)
  
  try {
    // Initialize services
    initializeWebSocketService(server)
    Logger.info('WebSocket service initialized', { category: LogCategory.SYSTEM })
    console.log(`🔌 WebSocket service initialized`)
    
    initializeJobQueueService()
    Logger.info('Job queue service initialized', { category: LogCategory.SYSTEM })
    console.log(`⚡ Job queue service initialized`)
    
    const jobWorkerService = initializeJobWorkerService()
    jobWorkerService.start()
    Logger.info('Job worker service started', { category: LogCategory.SYSTEM })
    console.log(`👷 Job worker service started`)
    
    initializeWorkflowService()
    Logger.info('Workflow service initialized', { category: LogCategory.SYSTEM })
    console.log(`🔄 Workflow service initialized`)
    
    Logger.info('All services initialized successfully', { category: LogCategory.SYSTEM })
  } catch (error) {
    Logger.error('Failed to initialize services', error as Error, { category: LogCategory.SYSTEM })
    process.exit(1)
  }
})

// Setup graceful shutdown
gracefulShutdownHandler(server)