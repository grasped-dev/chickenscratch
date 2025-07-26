import React from 'react';
import { CheckCircle, AlertCircle, Loader, Upload } from 'lucide-react';

interface UploadProgressProps {
  totalFiles: number;
  completedFiles: number;
  failedFiles: number;
  isUploading: boolean;
  overallProgress: number;
  className?: string;
}

const UploadProgress: React.FC<UploadProgressProps> = ({
  totalFiles,
  completedFiles,
  failedFiles,
  isUploading,
  overallProgress,
  className = '',
}) => {
  const pendingFiles = totalFiles - completedFiles - failedFiles;
  
  if (totalFiles === 0) {
    return null;
  }

  const getStatusMessage = () => {
    if (isUploading) {
      return `Uploading ${completedFiles + 1} of ${totalFiles} files...`;
    } else if (failedFiles > 0) {
      return `${completedFiles} uploaded, ${failedFiles} failed`;
    } else if (completedFiles === totalFiles) {
      return `All ${totalFiles} files uploaded successfully`;
    } else {
      return `${completedFiles} of ${totalFiles} files uploaded`;
    }
  };

  const getStatusIcon = () => {
    if (isUploading) {
      return <Loader className="h-5 w-5 text-blue-500 animate-spin" />;
    } else if (failedFiles > 0) {
      return <AlertCircle className="h-5 w-5 text-red-500" />;
    } else if (completedFiles === totalFiles) {
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    } else {
      return <Upload className="h-5 w-5 text-gray-500" />;
    }
  };

  const getProgressBarColor = () => {
    if (failedFiles > 0) {
      return 'bg-red-500';
    } else if (completedFiles === totalFiles) {
      return 'bg-green-500';
    } else {
      return 'bg-blue-500';
    }
  };

  return (
    <div className={`bg-white border rounded-lg p-4 ${className}`}>
      <div className="flex items-center space-x-3">
        {getStatusIcon()}
        <div className="flex-1">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-900">
              {getStatusMessage()}
            </p>
            <span className="text-sm text-gray-500">
              {Math.round(overallProgress)}%
            </span>
          </div>
          
          {/* Progress bar */}
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-300 ${getProgressBarColor()}`}
              style={{ width: `${overallProgress}%` }}
            />
          </div>
          
          {/* File status breakdown */}
          <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
            {completedFiles > 0 && (
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-green-500 rounded-full" />
                <span>{completedFiles} completed</span>
              </div>
            )}
            
            {pendingFiles > 0 && (
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full" />
                <span>{pendingFiles} pending</span>
              </div>
            )}
            
            {failedFiles > 0 && (
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-red-500 rounded-full" />
                <span>{failedFiles} failed</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UploadProgress;