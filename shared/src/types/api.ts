// API request and response types

export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface UploadRequest {
  files: File[]
  projectName?: string
}

export interface UploadResponse {
  uploadId: string
  fileIds: string[]
  status: 'uploaded' | 'processing' | 'failed'
}

export interface ProcessingStatus {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  message?: string
  error?: string
}