import { useState } from 'react';
import { UploadInterface } from '../components';
import { UploadFile } from '../types/upload';

const UploadPage = () => {
  const [uploadedFiles, setUploadedFiles] = useState<UploadFile[]>([]);
  const [, setUploadProgress] = useState(0);

  const handleUploadComplete = (files: UploadFile[]) => {
    setUploadedFiles(files);
    console.log('Upload completed:', files);
    
    // Here you would typically send the files to your backend
    // For now, we'll just log the completion
    const successfulUploads = files.filter(f => f.status === 'completed');
    if (successfulUploads.length > 0) {
      // TODO: Send to backend API in future tasks
      console.log(`${successfulUploads.length} files ready for processing`);
    }
  };

  const handleUploadProgress = (progress: number) => {
    setUploadProgress(progress);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Upload Images</h1>
          <p className="text-gray-600">
            Upload photos of your handwritten notes, sticky notes, or whiteboards to get started.
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-6">
          <UploadInterface
            onUploadComplete={handleUploadComplete}
            onUploadProgress={handleUploadProgress}
            options={{
              maxFiles: 10,
              maxFileSize: 10 * 1024 * 1024, // 10MB
              acceptedFileTypes: ['image/jpeg', 'image/png', 'image/heic'],
              enableCamera: true,
            }}
          />
        </div>

        {/* Results section */}
        {uploadedFiles.length > 0 && (
          <div className="mt-8 bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Upload Results</h2>
            <div className="space-y-2">
              {uploadedFiles.map((file) => (
                <div
                  key={file.id}
                  className={`flex items-center justify-between p-3 rounded border ${
                    file.status === 'completed' 
                      ? 'bg-green-50 border-green-200' 
                      : file.status === 'error'
                      ? 'bg-red-50 border-red-200'
                      : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <span className="font-medium">{file.file.name}</span>
                  <span className={`text-sm ${
                    file.status === 'completed' 
                      ? 'text-green-600' 
                      : file.status === 'error'
                      ? 'text-red-600'
                      : 'text-gray-600'
                  }`}>
                    {file.status === 'completed' ? 'Ready for processing' : 
                     file.status === 'error' ? 'Upload failed' : 
                     'Pending'}
                  </span>
                </div>
              ))}
            </div>
            
            {uploadedFiles.some(f => f.status === 'completed') && (
              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded">
                <p className="text-blue-800 text-sm">
                  <strong>Next steps:</strong> Your images are ready for processing. 
                  OCR text extraction and analysis will be implemented in upcoming tasks.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default UploadPage;