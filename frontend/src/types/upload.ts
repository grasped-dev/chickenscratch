// Upload-related type definitions
export interface UploadFile {
  id: string;
  file: File;
  preview?: string;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  progress: number;
  error?: string;
}

export interface UploadOptions {
  maxFiles?: number;
  maxFileSize?: number;
  acceptedFileTypes?: string[];
  enableCamera?: boolean;
}