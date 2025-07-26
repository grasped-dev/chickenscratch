// Database entity types
import type { OCRResponse, ProjectSummary, BoundingBox } from './processing'

export interface User {
  id: string
  email: string
  name: string
  passwordHash: string
  createdAt: Date
  updatedAt: Date
  preferences: UserPreferences
}

export interface UserPreferences {
  defaultClusteringMethod: 'embeddings' | 'llm' | 'hybrid'
  autoProcessing: boolean
  exportFormat: 'pdf' | 'csv'
  theme: 'light' | 'dark'
}

export interface Project {
  id: string
  userId: string
  name: string
  description?: string
  createdAt: Date
  updatedAt: Date
  status: 'processing' | 'completed' | 'failed'
  imageCount: number
  summary?: ProjectSummary
}

export interface ProcessedImage {
  id: string
  projectId: string
  originalUrl: string
  filename: string
  fileSize: number
  mimeType: string
  uploadedAt: Date
  processingStatus: 'pending' | 'processing' | 'completed' | 'failed'
  ocrResults?: OCRResponse
  boundingBoxes: BoundingBox[]
  errorMessage?: string
}

export interface Note {
  id: string
  imageId: string
  originalText: string
  cleanedText: string
  boundingBox: BoundingBox
  confidence: number
  clusterId?: string
  embedding?: number[]
  createdAt: Date
  updatedAt: Date
}

export interface Cluster {
  id: string
  projectId: string
  label: string
  textBlocks: string[]
  centroid?: number[]
  confidence: number
  createdAt: Date
  updatedAt: Date
}

// Database input types (for creation)
export interface CreateUserInput {
  email: string
  name: string
  passwordHash: string
  preferences?: Partial<UserPreferences>
}

export interface CreateProjectInput {
  userId: string
  name: string
  description?: string
}

export interface CreateProcessedImageInput {
  projectId: string
  originalUrl: string
  filename: string
  fileSize: number
  mimeType: string
}

export interface CreateNoteInput {
  imageId: string
  originalText: string
  cleanedText: string
  boundingBox: BoundingBox
  confidence: number
}

export interface CreateClusterInput {
  projectId: string
  label: string
  textBlocks: string[]
  centroid?: number[]
  confidence: number
}

// Database update types
export interface UpdateUserInput {
  name?: string
  preferences?: Partial<UserPreferences>
}

export interface UpdateProjectInput {
  name?: string
  description?: string
  status?: 'processing' | 'completed' | 'failed'
  imageCount?: number
  summary?: ProjectSummary
}

export interface UpdateProcessedImageInput {
  processingStatus?: 'pending' | 'processing' | 'completed' | 'failed'
  ocrResults?: OCRResponse
  boundingBoxes?: BoundingBox[]
  errorMessage?: string
}

export interface UpdateNoteInput {
  cleanedText?: string
  clusterId?: string
  embedding?: number[]
}

export interface UpdateClusterInput {
  label?: string
  textBlocks?: string[]
  centroid?: number[]
  confidence?: number
}

