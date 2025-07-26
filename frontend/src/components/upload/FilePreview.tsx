import React from 'react';
import { X, FileImage, AlertCircle, CheckCircle, Loader } from 'lucide-react';
import { UploadFile } from '../../types/upload';

interface FilePreviewProps {
  files: UploadFile[];
  onRemoveFile: (fileId: string) => void;
  className?: string;
}

const FilePreview: React.FC<FilePreviewProps> = ({
  files,
  onRemoveFile,
  className = '',
}) => {
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStatusIcon = (status: UploadFile['status']) => {
    switch (status) {
      case 'pending':
        return <FileImage className="h-4 w-4 text-gray-400" />;
      case 'uploading':
        return <Loader className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <FileImage className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: UploadFile['status']) => {
    switch (status) {
      case 'pending':
        return 'bg-gray-200';
      case 'uploading':
        return 'bg-blue-200';
      case 'completed':
        return 'bg-green-200';
      case 'error':
        return 'bg-red-200';
      default:
        return 'bg-gray-200';
    }
  };

  if (files.length === 0) {
    return null;
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <h3 className="text-sm font-medium text-gray-900">
        Selected Files ({files.length})
      </h3>
      
      <div className="space-y-2">
        {files.map((uploadFile) => (
          <div
            key={uploadFile.id}
            className={`
              flex items-center p-3 rounded-lg border transition-colors
              ${getStatusColor(uploadFile.status)}
            `}
          >
            {/* File preview thumbnail */}
            <div className="flex-shrink-0 mr-3">
              {uploadFile.preview ? (
                <img
                  src={uploadFile.preview}
                  alt={uploadFile.file.name}
                  className="h-12 w-12 object-cover rounded border"
                />
              ) : (
                <div className="h-12 w-12 bg-gray-100 rounded border flex items-center justify-center">
                  <FileImage className="h-6 w-6 text-gray-400" />
                </div>
              )}
            </div>
            
            {/* File info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2">
                {getStatusIcon(uploadFile.status)}
                <p className="text-sm font-medium text-gray-900 truncate">
                  {uploadFile.file.name}
                </p>
              </div>
              
              <div className="flex items-center space-x-4 mt-1">
                <p className="text-xs text-gray-500">
                  {formatFileSize(uploadFile.file.size)}
                </p>
                
                {uploadFile.status === 'uploading' && (
                  <div className="flex items-center space-x-2">
                    <div className="w-16 bg-gray-200 rounded-full h-1.5">
                      <div
                        className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${uploadFile.progress}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500">
                      {uploadFile.progress}%
                    </span>
                  </div>
                )}
                
                {uploadFile.status === 'error' && uploadFile.error && (
                  <p className="text-xs text-red-600 truncate">
                    {uploadFile.error}
                  </p>
                )}
              </div>
            </div>
            
            {/* Remove button */}
            <button
              onClick={() => onRemoveFile(uploadFile.id)}
              disabled={uploadFile.status === 'uploading'}
              className="flex-shrink-0 ml-3 p-1 text-gray-400 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Remove file"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FilePreview;