import React, { useState, useCallback, useEffect } from 'react';
import { Camera, Upload as UploadIcon, AlertCircle } from 'lucide-react';
import FileDropzone from './FileDropzone';
import FilePreview from './FilePreview';
import UploadProgress from './UploadProgress';
import CameraCapture from './CameraCapture';
import { UploadFile, UploadOptions } from '../../types/upload';

interface UploadInterfaceProps {
  onUploadComplete: (files: UploadFile[]) => void;
  onUploadProgress?: (progress: number) => void;
  options?: UploadOptions;
  className?: string;
}

const UploadInterface: React.FC<UploadInterfaceProps> = ({
  onUploadComplete,
  onUploadProgress,
  options = {},
  className = '',
}) => {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    maxFiles = 10,
    maxFileSize = 10 * 1024 * 1024, // 10MB
    acceptedFileTypes = ['image/jpeg', 'image/png', 'image/heic'],
    enableCamera = true,
  } = options;

  // Check if device supports camera
  const [hasCameraSupport, setHasCameraSupport] = useState(false);

  useEffect(() => {
    const checkCameraSupport = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const hasCamera = devices.some(device => device.kind === 'videoinput');
        setHasCameraSupport(hasCamera && enableCamera);
      } catch {
        setHasCameraSupport(false);
      }
    };

    if (enableCamera && navigator.mediaDevices) {
      checkCameraSupport();
    }
  }, [enableCamera]);

  const createUploadFile = useCallback((file: File): UploadFile => {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Create preview URL for images
    let preview: string | undefined;
    if (file.type.startsWith('image/')) {
      preview = URL.createObjectURL(file);
    }

    return {
      id,
      file,
      preview,
      status: 'pending',
      progress: 0,
    };
  }, []);

  const handleFilesSelected = useCallback((newFiles: File[]) => {
    setError(null);
    
    // Check if adding these files would exceed the limit
    if (files.length + newFiles.length > maxFiles) {
      setError(`Cannot add ${newFiles.length} files. Maximum ${maxFiles} files allowed.`);
      return;
    }

    const uploadFiles = newFiles.map(createUploadFile);
    setFiles(prev => [...prev, ...uploadFiles]);
  }, [files.length, maxFiles, createUploadFile]);

  const handleCameraCapture = useCallback((file: File) => {
    handleFilesSelected([file]);
  }, [handleFilesSelected]);

  const handleRemoveFile = useCallback((fileId: string) => {
    setFiles(prev => {
      const updatedFiles = prev.filter(f => f.id !== fileId);
      // Clean up preview URLs
      const removedFile = prev.find(f => f.id === fileId);
      if (removedFile?.preview) {
        URL.revokeObjectURL(removedFile.preview);
      }
      return updatedFiles;
    });
  }, []);

  const simulateUpload = useCallback(async (uploadFile: UploadFile): Promise<void> => {
    return new Promise((resolve, reject) => {
      let progress = 0;
      const interval = setInterval(() => {
        progress += Math.random() * 20;
        
        if (progress >= 100) {
          clearInterval(interval);
          setFiles(prev => prev.map(f => 
            f.id === uploadFile.id 
              ? { ...f, status: 'completed', progress: 100 }
              : f
          ));
          resolve();
        } else {
          setFiles(prev => prev.map(f => 
            f.id === uploadFile.id 
              ? { ...f, status: 'uploading', progress: Math.min(progress, 100) }
              : f
          ));
        }
      }, 200 + Math.random() * 300);

      // Simulate occasional failures
      if (Math.random() < 0.1) {
        setTimeout(() => {
          clearInterval(interval);
          setFiles(prev => prev.map(f => 
            f.id === uploadFile.id 
              ? { ...f, status: 'error', error: 'Upload failed. Please try again.' }
              : f
          ));
          reject(new Error('Upload failed'));
        }, 1000 + Math.random() * 2000);
      }
    });
  }, []);

  const handleUpload = useCallback(async () => {
    if (files.length === 0 || isUploading) return;

    setIsUploading(true);
    setError(null);

    try {
      const pendingFiles = files.filter(f => f.status === 'pending');
      
      // Upload files concurrently with a limit
      const concurrencyLimit = 3;
      const uploadPromises: Promise<void>[] = [];
      
      for (let i = 0; i < pendingFiles.length; i += concurrencyLimit) {
        const batch = pendingFiles.slice(i, i + concurrencyLimit);
        const batchPromises = batch.map(file => simulateUpload(file));
        uploadPromises.push(...batchPromises);
        
        // Wait for current batch before starting next
        if (i + concurrencyLimit < pendingFiles.length) {
          await Promise.allSettled(batchPromises);
        }
      }

      await Promise.allSettled(uploadPromises);
      
      // Calculate final results
      const finalFiles = files.map(f => {
        const currentFile = files.find(cf => cf.id === f.id);
        return currentFile || f;
      });
      
      onUploadComplete(finalFiles);
      
    } catch (err) {
      setError('Some files failed to upload. Please try again.');
    } finally {
      setIsUploading(false);
    }
  }, [files, isUploading, simulateUpload, onUploadComplete]);

  // Calculate progress
  const completedFiles = files.filter(f => f.status === 'completed').length;
  const failedFiles = files.filter(f => f.status === 'error').length;
  const overallProgress = files.length > 0 
    ? (files.reduce((sum, f) => sum + f.progress, 0) / files.length)
    : 0;

  // Notify parent of progress changes
  useEffect(() => {
    if (onUploadProgress) {
      onUploadProgress(overallProgress);
    }
  }, [overallProgress, onUploadProgress]);

  // Clean up preview URLs on unmount
  useEffect(() => {
    return () => {
      files.forEach(file => {
        if (file.preview) {
          URL.revokeObjectURL(file.preview);
        }
      });
    };
  }, []);

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Upload dropzone */}
      <FileDropzone
        onFilesSelected={handleFilesSelected}
        maxFiles={maxFiles - files.length}
        maxFileSize={maxFileSize}
        acceptedFileTypes={acceptedFileTypes}
        disabled={isUploading || files.length >= maxFiles}
      />

      {/* Camera button for mobile */}
      {hasCameraSupport && files.length < maxFiles && (
        <div className="flex justify-center sm:hidden">
          <button
            onClick={() => setIsCameraOpen(true)}
            disabled={isUploading}
            className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Camera className="h-5 w-5 mr-2" />
            Take Photo
          </button>
        </div>
      )}

      {/* File preview */}
      {files.length > 0 && (
        <FilePreview
          files={files}
          onRemoveFile={handleRemoveFile}
        />
      )}

      {/* Upload progress */}
      {(isUploading || completedFiles > 0 || failedFiles > 0) && (
        <UploadProgress
          totalFiles={files.length}
          completedFiles={completedFiles}
          failedFiles={failedFiles}
          isUploading={isUploading}
          overallProgress={overallProgress}
        />
      )}

      {/* Error message */}
      {error && (
        <div className="flex items-center p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="h-5 w-5 text-red-500 mr-3" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Upload button */}
      {files.length > 0 && !isUploading && completedFiles < files.length && (
        <div className="flex justify-center">
          <button
            onClick={handleUpload}
            disabled={files.filter(f => f.status === 'pending').length === 0}
            className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <UploadIcon className="h-5 w-5 mr-2" />
            Upload {files.filter(f => f.status === 'pending').length} Files
          </button>
        </div>
      )}

      {/* Camera capture modal */}
      <CameraCapture
        isOpen={isCameraOpen}
        onCapture={handleCameraCapture}
        onClose={() => setIsCameraOpen(false)}
      />
    </div>
  );
};

export default UploadInterface;