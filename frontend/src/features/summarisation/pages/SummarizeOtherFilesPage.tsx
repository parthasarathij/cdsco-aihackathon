import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Upload, X } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import TopBarSimple from '../../../components/TopBarSimple';
import { runOtherFilesSummarization, type SummarizationResponse } from '../api/client';

type SummarizedFileRef = { name: string; blobPath?: string; extension?: string };

function buildCombinedSummary(
  raw: SummarizationResponse | SummarizationResponse[],
  fileNames: string[],
  mode: 'application' | 'sae' | 'meeting',
): SummarizationResponse {
  if (!Array.isArray(raw)) return raw;

  const perFileEntries = raw.reduce<Record<string, SummarizationResponse>>((acc, item, idx) => {
    const label = fileNames[idx] || `File ${idx + 1}`;
    acc[label] = item;
    return acc;
  }, {});

  return {
    combined_overview: {
      value: `Combined ${mode} summary generated from ${raw.length} file(s).`,
      confidence: 'high',
      source: [],
    },
    combined_files: {
      value: fileNames.join(', '),
      confidence: 'high',
      source: [],
    },
    per_file_summaries: perFileEntries,
  } as SummarizationResponse;
}

export default function SummarizeOtherFilesPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [selectedMode, setSelectedMode] = useState<'application' | 'sae' | 'meeting'>('application');
  const [otherFiles, setOtherFiles] = useState<File[]>([]);
  const [runningOtherSummary, setRunningOtherSummary] = useState(false);
  const [otherSummaryError, setOtherSummaryError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SummarizationResponse | SummarizationResponse[] | null>(null);
  const [files, setFiles] = useState<SummarizedFileRef[]>([]);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const processed = !!summary && files.length > 0;
  const allowedExtensions = useMemo(() => {
    if (selectedMode === 'meeting') return new Set(['mp3']);
    return new Set(['pdf', 'doc', 'docx']);
  }, [selectedMode]);
  const acceptedMime = selectedMode === 'meeting' ? '.mp3' : '.pdf,.doc,.docx';
  const allowedLabel = selectedMode === 'meeting' ? 'MP3' : 'PDF, DOC, DOCX';

  const handleRunSummary = async () => {
    if (!otherFiles.length) {
      setOtherSummaryError('Please upload at least one file.');
      return;
    }
    setOtherSummaryError(null);
    setRunningOtherSummary(true);
    try {
      const result = await runOtherFilesSummarization(otherFiles, selectedMode);
      const normalized = buildCombinedSummary(
        result.summary as SummarizationResponse | SummarizationResponse[],
        result.fileNames,
        selectedMode,
      );
      
      // Create file references with blob paths
      const refs: SummarizedFileRef[] = result.fileNames.map((name, idx) => ({
        name,
        blobPath: result.blobPaths[idx],
        extension: name.split('.').pop()?.toLowerCase(),
      }));
      
      setSummary(normalized);
      setFiles(refs);

      // Directly go to full view on success
      navigate('/summarisation/results', {
        state: { summaryResult: normalized, summarizedFiles: refs },
      });
    } catch (e) {
      setOtherSummaryError(e instanceof Error ? e.message : 'Failed to run summarization.');
    } finally {
      setRunningOtherSummary(false);
    }
  };

  const handleOpenFullView = () => {
    navigate('/summarisation/results', {
      state: { summaryResult: summary, summarizedFiles: files },
    });
  };

  const modeLabels = {
    application: 'Application Data',
    sae: 'SAE Case Narration',
    meeting: 'Meeting Transcripts',
  };

  const modeColors = {
    application: { bg: '#E6F1FB', border: '#185FA5', text: '#0C447C' },
    sae: { bg: '#E1F5EE', border: '#0F6E56', text: '#0F6E56' },
    meeting: { bg: '#FAEEDA', border: '#854F0B', text: '#854F0B' },
  };


  if (processed) {
    return (
      <div style={{ height: '100dvh', overflow: 'hidden', background: '#F5F3F0', display: 'flex', flexDirection: 'column' }}>
        <TopBarSimple user={user} onLogout={() => { logout(); navigate('/login'); }} />
        
        <div className="flex-1 flex flex-col items-center justify-center p-8 gap-6">
          <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: modeColors[selectedMode].bg, border: `2px solid ${modeColors[selectedMode].border}` }}>
            <FileText size={32} style={{ color: modeColors[selectedMode].text }} />
          </div>
          
          <h2 className="text-2xl font-bold text-gray-800">Summarization Complete</h2>
          <p className="text-sm text-gray-600 text-center max-w-md">
            Your {modeLabels[selectedMode].toLowerCase()} has been successfully summarized. 
            {files.length} file{files.length > 1 ? 's' : ''} processed.
          </p>

          <div className="flex gap-3 mt-4">
            <button
              type="button"
              onClick={() => {
                setSummary(null);
                setFiles([]);
                setOtherFiles([]);
              }}
              className="px-6 py-2.5 rounded-lg text-sm font-semibold"
              style={{ background: '#F8F7F4', color: '#1F2937', border: '0.5px solid #e0ddd6' }}
            >
              Summarize Another File
            </button>
            <button
              type="button"
              onClick={handleOpenFullView}
              className="px-6 py-2.5 rounded-lg text-sm font-semibold text-white flex items-center gap-2"
              style={{ background: modeColors[selectedMode].border }}
            >
              <FileText size={14} />
              Open Full View
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100dvh', overflow: 'hidden', background: '#F5F3F0', display: 'flex', flexDirection: 'column' }}>
      <TopBarSimple user={user} onLogout={() => { logout(); navigate('/login'); }} />
      
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 bg-white" style={{ borderBottom: '0.5px solid #e0ddd6' }}>
        <button
          onClick={() => navigate('/workspace')}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors px-3 py-1.5 rounded hover:bg-gray-100"
        >
          <ArrowLeft size={13} /> Back to Workspace
        </button>
        <div style={{ width: 1, height: 16, background: '#e0ddd6' }} />
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded flex items-center justify-center" style={{ background: '#E6F1FB', border: '0.5px solid #185FA5' }}>
            <FileText size={14} style={{ color: '#0C447C' }} />
          </div>
          <span className="text-base font-semibold text-gray-800">Summarize Other Files</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto px-8 py-8">
        <div className="max-w-3xl mx-auto">
          {/* Title Section */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Document Summarization</h2>
            <p className="text-sm text-gray-600">
              Upload documents for AI-powered summarization. Supported formats: PDF, Word (.doc/.docx), and Audio (.mp3)
            </p>
          </div>

          {/* Summary Type Selection */}
          <div className="rounded-xl p-6 mb-6" style={{ background: '#FFFFFF', border: '0.5px solid #e0ddd6' }}>
            <label className="text-sm font-semibold text-gray-700 mb-3 block">
              Select Summary Type
            </label>
            <div className="grid grid-cols-3 gap-3">
              {(['application', 'sae', 'meeting'] as const).map((mode) => {
                const colors = modeColors[mode];
                const isSelected = selectedMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setSelectedMode(mode);
                      setOtherSummaryError(null);
                      setOtherFiles((prev) => {
                        const allowed = mode === 'meeting' ? new Set(['mp3']) : new Set(['pdf', 'doc', 'docx']);
                        return prev.filter((f) => {
                          const ext = f.name.split('.').pop()?.toLowerCase() || '';
                          return allowed.has(ext);
                        });
                      });
                    }}
                    className="rounded-lg p-4 text-center transition-all"
                    style={{
                      background: isSelected ? colors.bg : '#F8F7F4',
                      border: `1.5px solid ${isSelected ? colors.border : '#e0ddd6'}`,
                      color: isSelected ? colors.text : '#6B7280',
                    }}
                  >
                    <FileText size={20} className="mx-auto mb-2" style={{ color: isSelected ? colors.text : '#9CA3AF' }} />
                    <div className="text-xs font-semibold">{modeLabels[mode]}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* File Upload Section */}
          <div className="rounded-xl p-6 mb-6" style={{ background: '#FFFFFF', border: '0.5px solid #e0ddd6' }}>
            <label className="text-sm font-semibold text-gray-700 mb-3 block">
              Upload Files
            </label>
            
            <input
              ref={uploadInputRef}
              type="file"
              multiple
              accept={acceptedMime}
              className="hidden"
              onChange={(e) => {
                const picked = Array.from(e.target.files || []);
                if (!picked.length) return;
                const valid = picked.filter((f) => {
                  const ext = f.name.split('.').pop()?.toLowerCase() || '';
                  return allowedExtensions.has(ext);
                });
                const rejectedCount = picked.length - valid.length;
                if (rejectedCount > 0) {
                  setOtherSummaryError(
                    selectedMode === 'meeting'
                      ? 'Unsupported file type selected. Allowed: MP3 only.'
                      : 'Unsupported file type selected. Allowed: PDF, DOC, DOCX.',
                  );
                } else {
                  setOtherSummaryError(null);
                }
                setOtherFiles(valid);
                e.target.value = '';
              }}
            />
            
            <button
              type="button"
              onClick={() => uploadInputRef.current?.click()}
              className="w-full rounded-lg p-8 border-2 border-dashed flex flex-col items-center justify-center gap-3 transition-colors hover:opacity-80"
              style={{ borderColor: modeColors[selectedMode].border, background: modeColors[selectedMode].bg }}
            >
              <Upload size={32} style={{ color: modeColors[selectedMode].text }} />
              <div className="text-sm font-semibold" style={{ color: modeColors[selectedMode].text }}>
                Click to upload files
              </div>
              <div className="text-xs text-gray-600">
                {allowedLabel} 
              </div>

            </button>

            {/* Uploaded Files List */}
            {otherFiles.length > 0 && (
              <div className="mt-4 rounded-lg p-4" style={{ background: '#F8F7F4', border: '0.5px solid #e0ddd6' }}>
                <div className="text-xs font-semibold text-gray-600 mb-2">
                  {otherFiles.length} file{otherFiles.length > 1 ? 's' : ''} selected
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {otherFiles.map((f, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded px-3 py-2 text-xs"
                      style={{ background: '#FFFFFF', border: '0.5px solid #e0ddd6' }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText size={12} style={{ color: modeColors[selectedMode].text }} />
                        <span className="truncate">{f.name}</span>
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        <span className="text-gray-500">
                          {(f.size / 1024).toFixed(1)} KB
                        </span>
                        <button
                          type="button"
                          onClick={() => setOtherFiles((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-gray-400 hover:text-red-500 transition-colors"
                          title="Remove file"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Error Message */}
            {otherSummaryError && (
              <div className="mt-4 rounded-lg px-4 py-3 text-sm text-red-800" style={{ background: '#FEE2E2', border: '0.5px solid #DC2626' }}>
                {otherSummaryError}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => navigate('/workspace')}
              className="flex-1 py-3 rounded-lg text-sm font-semibold"
              style={{ background: '#F8F7F4', color: '#1F2937', border: '0.5px solid #e0ddd6' }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleRunSummary}
              disabled={!otherFiles.length || runningOtherSummary}
              className="flex-1 py-3 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: modeColors[selectedMode].border }}
            >
              {runningOtherSummary ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <FileText size={14} />
                  Run Summarization
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
