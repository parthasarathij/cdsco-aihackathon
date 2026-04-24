import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { UploadCloud, FileArchive, CheckCircle2, ArrowRight } from 'lucide-react';
import { uploadFolderToBackend, uploadZipToBackend } from '../api/workspaceClient';

function extractFolderName(path?: string): string {
  if (!path) return '';
  const parts = path.split('/').map((segment) => segment.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

export default function LandingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [showUploadInterface, setShowUploadInterface] = useState(false);
  const [uploadType, setUploadType] = useState<'folder' | 'zip' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setShowUploadInterface(location.pathname === '/eCTD-module');
  }, [location.pathname]);

  const handleFolderClick = () => {
    fileInputRef.current?.click();
  };

  const handleZipClick = () => {
    zipInputRef.current?.click();
  };

  const handleFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      setUploadedFiles(files);
      setUploadType('folder');
      setError(null);
    }
  };

  const handleZipChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      setUploadedFiles(files);
      setUploadType('zip');
      setError(null);
    }
  };

  const startProcessing = async () => {
    if (uploadedFiles.length === 0 || !uploadType) return;
    
    setIsProcessing(true);
    setProcessingProgress(0);
    setIsSuccess(false);
    setError(null);

    try {
      let response;
      if (uploadType === 'folder') {
        const fileList = fileInputRef.current?.files;
        const actualFiles = fileList && fileList.length > 0 ? Array.from(fileList) : uploadedFiles;
        
        response = await uploadFolderToBackend(actualFiles, (p) => {
          const percent = Math.round((p.uploaded / p.total) * 100);
          setProcessingProgress(percent);
        });
      } else {
        // Progress simulation for ZIP as it's a single file upload
        const progressInterval = setInterval(() => {
          setProcessingProgress(prev => {
            if (prev >= 95) return 95;
            return prev + 5;
          });
        }, 500);

        response = await uploadZipToBackend(uploadedFiles[0]);
        clearInterval(progressInterval);
      }

      setProcessingProgress(100);

      if (response && response.rootPath) {
        const folderName = extractFolderName(response.rootPath);
        if (folderName) {
          localStorage.setItem('cdsco_rootFolder', folderName);
        }
      }

      setIsSuccess(true);
      setIsProcessing(false);
      
      // Navigate to workspace after showing success state
      setTimeout(() => {
        navigate('/workspace');
      }, 1500);

    } catch (err) {
      setIsProcessing(false);
      const message = err instanceof Error ? err.message : String(err);
      console.error('Upload error details:', err);
      
      if (message.includes('ALPN') || message === 'Failed to fetch' || message.includes('Failed to connect')) {
        setError(
          window.location.protocol === 'https:'
            ? "Cannot reach the backend: your page is served over HTTPS but the backend must also use HTTPS. Set VITE_API_BASE_URL to the correct backend URL."
            : "Cannot reach the backend on port 8000. Make sure it is running, or set VITE_API_BASE_URL to the correct backend address."
        );
      } else {
        setError("There was an issue processing your request. Please try again.");
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      setUploadedFiles(files);
      // Determine type: if only 1 file and it ends with .zip, it's a zip
      if (files.length === 1 && files[0].name.toLowerCase().endsWith('.zip')) {
        setUploadType('zip');
      } else {
        setUploadType('folder');
      }
      setError(null);
    }
  };

  const handleSugamPortal = () => {
    navigate('/sugam');
  };

  const handleEctdModule = () => {
    navigate('/eCTD-module');
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 py-8">
      {location.pathname === '/eCTD-module' ? (
        <button
          onClick={() => {
            setUploadedFiles([]);
            setUploadType(null);
            setError(null);
            navigate('/');
          }}
          className="fixed left-4 top-3 z-50 rounded-md border border-blue-200/40 bg-blue-900/95 px-2.5 py-1.5 text-xs font-semibold text-blue-50 shadow-sm transition-colors hover:bg-blue-800"
        >
          ← Back to Portal Selection
        </button>
      ) : null}

      {/* Main Container */}
      <div className="w-full max-w-2xl relative z-10">
        {/* Title Section */}
        <div className="text-center mb-12">
          <h1 className="text-3xl md:text-4xl font-bold text-blue-600 mb-3 leading-tight">
            CDSCO AI Workflow Engine
          </h1>
          <p className="text-lg text-gray-700 max-w-2xl mx-auto">
            Enterprise-grade document processing, OCR, and intelligent analysis powered by artificial intelligence
          </p>
        </div>

        {/* Initial Portal Selection */}
        {!showUploadInterface && !isProcessing && !isSuccess ? (
          <div className="space-y-8 mb-16">
            <div className="bg-white rounded-2xl shadow-lg p-8 text-center border border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">Choose Your Portal</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={handleSugamPortal}
                  className="group relative py-4 px-6 rounded-xl font-bold flex items-center justify-center gap-2 bg-purple-600 text-white hover:shadow-2xl hover:shadow-purple-500/30 transition-all duration-300 hover:scale-105"
                >
                  <span className="relative z-10">Sugam Portal</span>
                  <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                </button>

                <button
                  onClick={handleEctdModule}
                  className="group relative py-4 px-6 rounded-xl font-bold flex items-center justify-center gap-2 bg-green-600 text-white hover:shadow-2xl hover:shadow-green-500/30 transition-all duration-300 hover:scale-105"
                >
                  <span className="relative z-10">eCTD Module</span>
                  <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Upload Section */}
        {showUploadInterface && !isProcessing && !isSuccess ? (
          <div className="space-y-8 mb-16">
            {/* Drag and Drop Area */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`relative rounded-2xl border-2 border-dashed transition-all duration-300 p-12 text-center backdrop-blur-sm ${
                isDragging
                  ? 'border-blue-500 bg-blue-100/50 shadow-lg shadow-blue-500/20'
                  : 'border-blue-200 bg-white hover:border-blue-400 hover:bg-blue-50/50'
              }`}
            >
              <UploadCloud className={`mx-auto mb-4 transition-all duration-300 ${isDragging ? 'text-blue-600 scale-110' : 'text-blue-600'}`} size={56} />
              <p className="text-gray-900 font-bold text-lg mb-2">
                Drop your files here to get started
              </p>
              <p className="text-sm text-gray-600">
              </p>
            </div>

            {/* Upload Buttons */}
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={handleFolderClick}
                className="group relative flex flex-col items-center justify-center gap-3 p-6 rounded-xl border border-blue-200 bg-white hover:bg-blue-50 transition-all duration-300 hover:border-blue-400/60 shadow-sm hover:shadow-md"
              >
                <UploadCloud className="text-blue-600 relative z-10 group-hover:scale-110 transition-transform" size={36} />
                <div className="relative z-10 text-center">
                  <span className="text-sm font-bold text-gray-900 block">Upload Folder</span>
                  <span className="text-xs text-gray-600">Multiple files</span>
                </div>
              </button>

              <button
                onClick={handleZipClick}
                className="group relative flex flex-col items-center justify-center gap-3 p-6 rounded-xl border border-indigo-200 bg-white hover:bg-indigo-50 transition-all duration-300 hover:border-indigo-400/60 shadow-sm hover:shadow-md"
              >
                <FileArchive className="text-indigo-600 relative z-10 group-hover:scale-110 transition-transform" size={36} />
                <div className="relative z-10 text-center">
                  <span className="text-sm font-bold text-gray-900 block">Upload ZIP</span>
                  <span className="text-xs text-gray-600">Compressed files</span>
                </div>
              </button>
            </div>

            {/* Perform OCR Button */}
            <button
              onClick={startProcessing}
              disabled={uploadedFiles.length === 0}
              className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all duration-300 text-base ${
                uploadedFiles.length === 0
                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:shadow-2xl hover:shadow-blue-500/30 hover:scale-105'
              }`}
            >
              Perform OCR & Analysis
            </button>

            {/* Selected Files Info */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
                <p className="text-sm font-semibold text-red-700">{error}</p>
              </div>
            )}
            {uploadedFiles.length > 0 && !error && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 backdrop-blur-sm">
                <p className="text-sm font-semibold text-blue-900 mb-3">
                  ✓ {uploadedFiles.length} file{uploadedFiles.length > 1 ? 's' : ''} ready for processing
                </p>
                <div className="max-h-32 overflow-y-auto">
                  <ul className="space-y-2">
                    {uploadedFiles.map((file, idx) => (
                      <li key={idx} className="text-xs text-blue-800 truncate flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                        {file.name}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {/* Processing State */}
        {isProcessing && (
          <div className="space-y-8 mb-16">
            <div className="bg-white rounded-2xl shadow-lg p-12 text-center border border-gray-200 backdrop-blur-sm">
              <div className="mb-8">
                <div className="inline-block">
                  <div className="relative w-24 h-24">
                    <div className="absolute inset-0 rounded-full border-4 border-blue-100"></div>
                    <div
                      className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-600 border-r-cyan-500 animate-spin"
                      style={{
                        borderTopColor: '#2563eb',
                        borderRightColor: '#06b6d4',
                      }}
                    ></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-lg font-bold text-blue-600">
                        {processingProgress}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <h3 className="text-2xl font-bold text-gray-900 mb-3">
                Processing Your Documents
              </h3>
              <p className="text-gray-700 mb-8">
                Performing advanced OCR, content extraction, and AI analysis...
              </p>

              {/* Progress Bar */}
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden border border-gray-300">
                <div
                  className="bg-blue-600 h-full transition-all duration-500 shadow-lg shadow-blue-500/30"
                  style={{ width: `${processingProgress}%` }}
                ></div>
              </div>

            </div>
          </div>
        )}

        {/* Success State */}
        {isSuccess && (
          <div className="space-y-8 mb-16">
            <div className="bg-white rounded-2xl shadow-lg p-12 text-center border border-gray-200 backdrop-blur-sm">
              <div className="mb-8 flex justify-center">
                <div className="relative">
                  <CheckCircle2 className="relative text-green-600 drop-shadow-lg" size={72} />
                </div>
              </div>

              <h3 className="text-3xl font-bold text-green-600 mb-3">
                Processing Complete!
              </h3>
              <p className="text-gray-700 mb-8 max-w-lg mx-auto">
                Your documents have been successfully processed with advanced OCR and AI analysis. Redirecting to eCTD Module...
              </p>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-gray-600 mt-12 py-8 border-t border-blue-100">
          <p>Enterprise Document Intelligence Platform • Version 1.0</p>
        </div>
      </div>

      {/* Hidden File Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={handleFolderChange}
        accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
        {...{ webkitdirectory: '' } as any}
      />
      <input
        ref={zipInputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={handleZipChange}
        accept=".zip"
      />
    </div>
  );
}