import { apiClient } from '../utils/api';

export interface UploadResponse {
  fileId: string;
  filename: string;
  url: string;
  size: number;
  mimeType: string;
}

export interface UploadStatus {
  fileId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  error?: string;
}

export interface PresignedUrlResponse {
  uploadUrl: string;
  fileId: string;
  fields: Record<string, string>;
}

class UploadService {
  async uploadSingle(file: File, projectId: string): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('projectId', projectId);

    const response = await apiClient.post<UploadResponse>('/upload/file', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data;
  }

  async uploadMultiple(files: File[], projectId: string): Promise<UploadResponse[]> {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    formData.append('projectId', projectId);

    const response = await apiClient.post<UploadResponse[]>('/upload/files', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data;
  }

  async getUploadStatus(fileId: string): Promise<UploadStatus> {
    const response = await apiClient.get<UploadStatus>(`/upload/status/${fileId}`);
    return response.data;
  }

  async deleteFile(fileId: string): Promise<void> {
    await apiClient.delete(`/upload/file/${fileId}`);
  }

  async generatePresignedUrl(filename: string, contentType: string): Promise<PresignedUrlResponse> {
    const response = await apiClient.post<PresignedUrlResponse>('/upload/presigned-url', {
      filename,
      contentType,
    });
    return response.data;
  }

  async getProjectFiles(projectId: string): Promise<UploadResponse[]> {
    const response = await apiClient.get<UploadResponse[]>(`/upload/project/${projectId}/files`);
    return response.data;
  }

  async uploadWithProgress(
    file: File, 
    projectId: string, 
    onProgress?: (progress: number) => void
  ): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('projectId', projectId);

    const response = await apiClient.post<UploadResponse>('/upload/file', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total && onProgress) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(progress);
        }
      },
    });

    return response.data;
  }
}

export const uploadService = new UploadService();