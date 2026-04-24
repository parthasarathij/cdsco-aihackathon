import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { FileNode } from '../../shared/types/app';
import { ExternalLink, Play, X, FileText, Tag, Plus } from 'lucide-react';
import { ClassificationSkeleton } from '../Skeleton';
import { classificationClient } from '../../features/classification/api/client';
import { fetchBlobFile } from '../../api/workspaceClient';

interface ClassificationSource {
  file: string;
  page: number;
  text_snippet: string;
}

interface ClassificationField {
  value: string;
  source: ClassificationSource[];
}

interface DuplicateDetection {
  is_duplicate: boolean;
  duplicate_of: string;
  reason: string;
}

interface RegulatoryInfo {
  alert_flag: string;
  regulatory_action: string;
}

interface ClassificationResult {
  file_name: string;
  classification: {
    seriousness: ClassificationField;
    priority: ClassificationField;
    classification_source: string;
    causality: ClassificationField;
    expectedness: ClassificationField;
  };
  duplicate_detection: DuplicateDetection;
  regulatory: RegulatoryInfo;
}

interface Props {
  selectedFile: FileNode | null;
  workspaceFiles?: { name: string; path: string; type: string; children: any[] }[];
  onClassificationDone?: (done: boolean) => void;
  onClearSelectedFile?: () => void;
}

const SEV_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  Death:           { bg: '#FAECE7', border: '#993C1D', text: '#712B13' },
  Disability:      { bg: '#FAEEDA', border: '#854F0B', text: '#633806' },
  Hospitalisation: { bg: '#E6F1FB', border: '#185FA5', text: '#0C447C' },
  Others:          { bg: '#F1EFE8', border: '#888',    text: '#444'    },
};

export default function ClassificationFeature({ selectedFile, workspaceFiles, onClassificationDone }: Props) {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [classifiedFile, setClassifiedFile] = useState<FileNode | null>(null);
  const [additionalFiles, setAdditionalFiles] = useState<Array<{ file: File; name: string }>>([]);
  const [dragActive, setDragActive] = useState(false);
  const [classificationResults, setClassificationResults] = useState<ClassificationResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleFilesSelected = (files: FileList | null) => {
    if (files) {
      const newFiles = Array.from(files)
        .filter(file => file.type === 'application/pdf' || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.type === 'application/msword')
        .map(file => ({ 
          file, 
          name: file.name || 'Unnamed File' 
        }));
      setAdditionalFiles(prev => [...prev, ...newFiles]);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const items = e.dataTransfer.items;
      if (items && items.length > 0) {
        const entry = items[0].webkitGetAsEntry?.();
        if (entry?.isDirectory) {
          traverseFileTree(entry);
          return;
        }
      }
      // It's files - handle normally (direct file drop from computer)
      handleFilesSelected(e.dataTransfer.files);
      return;
    }
    
    // Handle drag from workspace tree (fileId)
    const fileId = e.dataTransfer.getData('text/x-fileid') || e.dataTransfer.getData('text/plain');
    if (fileId) {
      try {
        const fileStore = (window as any).__fileStore;
        if (fileStore && fileStore.has(fileId)) {
          const { file, name, blobPath } = fileStore.get(fileId);
          
          // If file has content, use it directly
          if (file && file.size > 0) {
            addFileToAdditional(file, name);
            fileStore.delete(fileId);
            return;
          }
          
          // If file is empty but has blobPath, download from Azure
          if (blobPath) {
            setError(`Preparing "${name}"...`);
            try {
              const downloadedFile = await fetchBlobFile(blobPath, name);
              addFileToAdditional(downloadedFile, name);
              setError(null); 
            } catch (downloadErr) {
              console.error('Error downloading file:', downloadErr);
              setError("We couldn't download the file. Please try uploading it directly.");
            }
            fileStore.delete(fileId);
            return;
          }
          
          // No file content and no blobPath
          setError("This file is currently unavailable. Please upload it again.");
          fileStore.delete(fileId);
        }
      } catch (err) {
        console.error('Error retrieving dragged file:', err);
        setError("Something went wrong with the file. Please try uploading it manually.");
      }
    }
  };

  const traverseFileTree = async (entry: any, path = '') => {
    if (entry.isFile) {
      entry.file((file: File) => {
        addFileToAdditional(file, file.name);
      });
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      reader.readEntries((entries: any[]) => {
        entries.forEach(e => traverseFileTree(e, path + entry.name + '/'));
      });
    }
  };

  const addFileToAdditional = (file: File | null, displayName: string) => {
    // If file is null or empty, we can't use it
    if (!file || file.size === 0) {
      console.warn(`File "${displayName}" is empty or null. Skipping.`);
      return;
    }
    
    const isPDF = file.type === 'application/pdf';
    const isDoc = file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
                  file.type === 'application/msword' ||
                  displayName.endsWith('.pdf') || displayName.endsWith('.docx') || displayName.endsWith('.doc');
    
    if (isPDF || isDoc) {
      setAdditionalFiles(prev => {
        const exists = prev.some(f => f.name === displayName && f.file.size === file.size);
        if (exists) return prev;
        return [...prev, { file, name: displayName }];
      });
    }
  };

  const removeFile = (index: number) => {
    setAdditionalFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Determine what we're classifying: selected file takes priority over additional files
  const hasTarget = !!(selectedFile || additionalFiles.length > 0);

  const handleRun = async () => {
    if (!hasTarget) return;
    setLoading(true);
    setError(null);
    setClassifiedFile(selectedFile);
    
    try {
      // Collect all files to classify
      const filesToClassify: File[] = [];
      
      // Add selected file if it exists
      if (selectedFile) {
        // Try to get file object directly from the node
        if ((selectedFile as any).file) {
          const file = (selectedFile as any).file;
          if (file) filesToClassify.push(file);
        }
        // If no file object, download it from backend using blobPath
        else if (selectedFile.blobPath) {
          try {
              const file = await fetchBlobFile(selectedFile.blobPath, selectedFile.name);
              filesToClassify.push(file);
            } catch (downloadErr) {
              console.error('Error downloading file:', downloadErr);
              throw new Error("Unable to access the selected file. Please try uploading it directly.");
            }
          }
          else {
            setError("We couldn't access the file. Please upload it again.");
            setLoading(false);
            return;
          }
        }
        
        // Add additional uploaded files
        additionalFiles.forEach(f => {
          if (f.file && f.file.size > 0) {
            filesToClassify.push(f.file);
          }
        });
        
        // Run Classification pipeline
         const response = await classificationClient.classify(filesToClassify);
         
         if (response.success && response.data) {
           setClassificationResults(response.data as ClassificationResult[]);
           setDone(true);
           if (onClassificationDone) onClassificationDone(true);
         } else {
           setError("Classification failed. Please try again.");
         }
       } catch (err) {
         console.error('Classification error:', err);
         setError("An error occurred during classification. Please check your connection and try again.");
       } finally {
         setLoading(false);
       }
  };

  // Reset results if a different file gets selected after classification
  const activeFile = done ? classifiedFile : selectedFile;

  const handleOpenFullView = () => {
    navigate('/classification/results', {
      state: { oldFiles: workspaceFiles ?? [], autoOpen: classificationResults[0]?.file_name, results: classificationResults },
    });
  };

  const getSeverityColor = (severity: string) => {
    const sev = severity.toLowerCase();
    if (sev.includes('death')) return SEV_COLORS['Death'];
    if (sev.includes('disability')) return SEV_COLORS['Disability'];
    if (sev.includes('hospital')) return SEV_COLORS['Hospitalisation'];
    return SEV_COLORS['Others'];
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-3 space-y-3">

        {/* ── Target: selected file (preferred) or manual folder ── */}
        <div>
          <div className="text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">
            {selectedFile ? 'Selected File' : 'Target Folder'}
          </div>

          {selectedFile ? (
            /* File is selected in workspace — show it as the target */
            <div className="rounded-lg px-3 py-2.5 flex items-center gap-2"
              style={{ background: '#FAEEDA', border: '0.5px solid #854F0B' }}>
              <FileText size={12} style={{ color: '#854F0B', flexShrink: 0 }} />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold truncate" style={{ color: '#633806' }}>
                  {selectedFile.name}
                </div>
                <div className="text-xs truncate mt-0.5" style={{ color: '#a06020' }}>
                  {selectedFile.path}
                </div>
              </div>
              <Tag size={10} style={{ color: '#854F0B', flexShrink: 0 }} />
            </div>
          ) : (
            /* No file selected — message to select from left panel */
            <div className="rounded-lg px-3 py-4 text-center"
              style={{ background: '#F8F7F4', border: '0.5px solid #e0ddd6' }}>
              <p className="text-xs text-gray-400 leading-relaxed">
                Select a file from the left panel to begin
              </p>
            </div>
          )}
        </div>

        {/* ── Additional Files: PDF / Docs Upload ── */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Additional Documents</div>
          
          {/* Drag Drop Area */}
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className="rounded-lg p-3 border-2 border-dashed transition-all"
            style={{
              borderColor: dragActive ? '#854F0B' : '#e0ddd6',
              background: dragActive ? '#FAEEDA' : '#F8F7F4'
            }}
          >
            <div className="flex flex-col items-center justify-center gap-2 py-2">
              <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: '#E6F1FB', border: '0.5px solid #854F0B' }}>
                <Plus size={12} style={{ color: '#633806' }} />
              </div>
              <div className="text-xs text-center" style={{ color: dragActive ? '#633806' : '#999' }}>
                <div className="font-medium">Drag & drop files here</div>
                <div className="text-gray-400 text-xs">PDF, DOCX only</div>
              </div>
            </div>
          </div>

          {/* Selected Files List */}
          {additionalFiles.length > 0 && (
            <div className="space-y-1.5 px-1">
              {additionalFiles.map((fileItem, idx) => (
                <div key={idx} className="flex items-center justify-between px-2 py-1.5 rounded-lg" style={{ background: '#F8F7F4', border: '0.5px solid #e0ddd6' }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText size={11} className="text-gray-400 shrink-0" />
                    <span className="text-xs text-gray-600 truncate" title={fileItem.name}>{fileItem.name}</span>
                  </div>
                  <button
                    onClick={() => removeFile(idx)}
                    className="text-gray-400 hover:text-red-500 transition-colors shrink-0"
                    title="Remove"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Results (shown after classification runs) ── */}
        {loading && <ClassificationSkeleton />}
        {!loading && done && (
          <>
            {/* Error message */}
            {error && (
              <div className="rounded-lg p-3 text-sm" style={{ background: '#FAECE7', border: '0.5px solid #993C1D', color: '#712B13' }}>
                {error}
              </div>
            )}

            {/* Classified files list */}
            {(activeFile || additionalFiles.length > 0) && (
              <div className="rounded-lg px-3 py-2 space-y-1.5" style={{ background: '#F8F7F4', border: '0.5px solid #e0ddd6' }}>
                <div className="text-xs font-semibold text-gray-500">Files Analysed</div>
                <div className="space-y-1 max-h-32 overflow-y-auto scrollbar-thin">
                  {activeFile && (
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <FileText size={11} style={{ color: '#854F0B' }} />
                      <span className="truncate" title={activeFile.name}>{activeFile.name}</span>
                    </div>
                  )}
                  {additionalFiles.map((f, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs text-gray-600">
                      <FileText size={11} style={{ color: '#854F0B' }} />
                      <span className="truncate" title={f.name}>{f.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Classification Results */}
            {classificationResults.length > 0 && (
              <>
                {/* Summary Stats */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg p-2.5 text-center" style={{ background: '#E6F1FB', border: '0.5px solid #185FA5' }}>
                    <div className="text-lg font-bold" style={{ color: '#0C447C' }}>{classificationResults.length}</div>
                    <div className="text-xs text-gray-400 mt-0.5">Total Cases</div>
                  </div>
                  <div className="rounded-lg p-2.5 text-center" style={{ background: '#FAEEDA', border: '0.5px solid #854F0B' }}>
                    <div className="text-lg font-bold" style={{ color: '#633806' }}>
                      {classificationResults.filter(r => r.duplicate_detection.is_duplicate).length}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">Duplicates</div>
                  </div>
                </div>

                {/* Individual Results */}
                <div className="space-y-2">
                  {classificationResults.map((result, idx) => {
                    const severityColor = getSeverityColor(result.classification.seriousness.value);
                    return (
                      <div key={idx} className="rounded-lg p-3 space-y-2" style={{ background: '#F8F7F4', border: '0.5px solid #e0ddd6' }}>
                        {/* File Name */}
                        <div className="flex items-center gap-2">
                          <FileText size={12} style={{ color: '#854F0B' }} />
                          <span className="text-xs font-semibold text-gray-700 truncate" title={result.file_name}>
                            {result.file_name}
                          </span>
                        </div>

                        {/* Seriousness */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 w-24">Seriousness:</span>
                          <span className="text-xs px-2 py-0.5 rounded" style={{ background: severityColor.bg, color: severityColor.text, border: `0.5px solid ${severityColor.border}` }}>
                            {result.classification.seriousness.value}
                          </span>
                        </div>

                        {/* Priority */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 w-24">Priority:</span>
                          <span className="text-xs font-medium text-gray-700">{result.classification.priority.value}</span>
                        </div>

                        {/* Causality */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 w-24">Causality:</span>
                          <span className="text-xs font-medium text-gray-700">{result.classification.causality.value}</span>
                        </div>

                        {/* Expectedness */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 w-24">Expectedness:</span>
                          <span className="text-xs font-medium text-gray-700">{result.classification.expectedness.value}</span>
                        </div>

                        {/* Duplicate Status */}
                        {result.duplicate_detection.is_duplicate && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 w-24">Duplicate:</span>
                            <span className="text-xs px-2 py-0.5 rounded" style={{ background: '#FAECE7', color: '#712B13', border: '0.5px solid #993C1D' }}>
                              Yes - {result.duplicate_detection.duplicate_of}
                            </span>
                          </div>
                        )}

                        {/* Regulatory Alert */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 w-24">Alert:</span>
                          <span className="text-xs px-2 py-0.5 rounded" style={{ background: result.regulatory.alert_flag === 'Yes' ? '#FAECE7' : '#E1F5EE', color: result.regulatory.alert_flag === 'Yes' ? '#712B13' : '#0F6E56', border: `0.5px solid ${result.regulatory.alert_flag === 'Yes' ? '#993C1D' : '#0F6E56'}` }}>
                            {result.regulatory.alert_flag}
                          </span>
                          <span className="text-xs text-gray-600">- {result.regulatory.regulatory_action}</span>
                        </div>

                        {/* Source Snippets (First one only) */}
                        {result.classification.seriousness.source.length > 0 && (
                          <div className="pt-2 mt-2" style={{ borderTop: '0.5px solid #e0ddd6' }}>
                            <div className="text-xs text-gray-500 mb-1">Source:</div>
                            <div className="text-xs text-gray-600 italic line-clamp-2">
                              "{result.classification.seriousness.source[0].text_snippet}"
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            <button onClick={handleOpenFullView}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold"
              style={{ background: '#FAEEDA', color: '#633806', border: '0.5px solid #854F0B' }}>
              <ExternalLink size={11} /> Open Full View
            </button>
          </>
        )}
      </div>

      <div className="p-3" style={{ borderTop: '0.5px solid #e0ddd6' }}>
        <button
          onClick={handleRun}
          disabled={!hasTarget || loading}
          className="w-full py-2 rounded-lg text-xs font-semibold text-white flex items-center justify-center gap-1.5 disabled:opacity-40"
          style={{ background: '#854F0B' }}>
          {loading
            ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Classifying…</>
            : <><Play size={11} /> Run Classification</>}
        </button>
      </div>
    </div>
  );
}
