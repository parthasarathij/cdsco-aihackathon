import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { FileNode } from '../../shared/types/app';
import { Play, Plus, Upload, X } from 'lucide-react';
import { SummarisationSkeleton } from '../Skeleton';
import { fetchBlobFile, runSummarization, type SummarizationFieldSource, type SummarizationResponse } from '../../api/workspaceClient';

type UploadCandidate = { file: File; name: string; blobPath?: string };
type SummarizedFileRef = { name: string; blobPath?: string; extension?: string };
const HIDDEN_KEYS = new Set(['confidence', 'chunk_id']);
const SECTION_ORDER = [
  'application_details',
  'quality_summary',
  'bioequivalence_summary',
  'regulatory_summary',
  'final_status',
  'overall_summary',
];
const FIELD_ORDER_BY_SECTION: Record<string, string[]> = {
  application_details: ['drug_name', 'applicant', 'dosage_form', 'strength', 'indication', 'application_type'],
  quality_summary: ['api_compliance', 'manufacturing_process', 'stability', 'key_quality_findings'],
  bioequivalence_summary: ['study_conducted', 'study_design', 'result', 'conclusion'],
  regulatory_summary: ['key_observations', 'deficiencies', 'risk_flags', 'compliance_status'],
  final_status: ['completeness', 'recommendation', 'review_confidence'],
};
const MAX_SOURCES_RENDER = 4;
const SOURCE_TEXT_PREVIEW_CHARS = 180;

interface SummarisationFeatureProps {
  selectedFile: FileNode | null;
  onClearSelectedFile?: () => void;
  onFocusSource?: (source: { file: string; page?: number }) => void;
}

const ALLOWED_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'mp3']);

function prettifyLabel(raw: string): string {
  return raw.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeKeyForCompare(raw: string): string {
  return raw.replace(/[_\-\s]+/g, '').toLowerCase();
}

function sanitizeDisplayText(value: unknown): string {
  return String(value)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isNonEmptyPrimitive(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

function isFieldObject(value: unknown): value is { value?: unknown; confidence?: unknown; source?: unknown } {
  return typeof value === 'object' && value !== null && ('value' in value || 'confidence' in value || 'source' in value);
}

function sortEntriesByOrder(entries: [string, unknown][], order: string[]): [string, unknown][] {
  const orderIndex = new Map(order.map((key, idx) => [key, idx]));
  return [...entries].sort(([a], [b]) => {
    const ai = orderIndex.get(a);
    const bi = orderIndex.get(b);
    if (ai !== undefined && bi !== undefined) return ai - bi;
    if (ai !== undefined) return -1;
    if (bi !== undefined) return 1;
    return a.localeCompare(b);
  });
}

function compactText(value: string, maxLen = SOURCE_TEXT_PREVIEW_CHARS): string {
  if (value.length <= maxLen) return value;
  return `${value.slice(0, maxLen).trimEnd()}...`;
}

export default function SummarisationFeature({ selectedFile, onClearSelectedFile, onFocusSource }: SummarisationFeatureProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SummarizationResponse | null>(null);
  const [summarizedFiles, setSummarizedFiles] = useState<SummarizedFileRef[]>([]);
  const [additionalFiles, setAdditionalFiles] = useState<UploadCandidate[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const dragTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const selectedFileEligible = !!selectedFile && selectedFile.type === 'file' && ALLOWED_EXTENSIONS.has((selectedFile.extension || '').toLowerCase());
  const additionalFilesEligible = additionalFiles.some((f) => ALLOWED_EXTENSIONS.has(f.name.split('.').pop()?.toLowerCase() || ''));

  const canRun = selectedFileEligible || additionalFilesEligible;

  useEffect(() => {
    setLoading(false);
    setDone(false);
    setError(null);
    setSummary(null);
    setSummarizedFiles([]);
    setAdditionalFiles([]);
  }, [selectedFile?.path]);

  const handleRun = async () => {
    if (!canRun) return;
    setLoading(true);
    setDone(false);
    setError(null);
    try {
      const uploadFiles: File[] = [];
      const fileRefs: SummarizedFileRef[] = [];
      if (selectedFileEligible && selectedFile?.blobPath) {
        const fromBlob = await fetchBlobFile(selectedFile.blobPath, selectedFile.name);
        uploadFiles.push(fromBlob);
        fileRefs.push({ name: selectedFile.name, blobPath: selectedFile.blobPath, extension: selectedFile.extension });
      }
      for (const candidate of additionalFiles) {
        const ext = candidate.name.split('.').pop()?.toLowerCase() || '';
        if (!ALLOWED_EXTENSIONS.has(ext)) continue;
        if (candidate.file.size === 0 && candidate.blobPath) {
          const fromBlob = await fetchBlobFile(candidate.blobPath, candidate.name);
          uploadFiles.push(fromBlob);
          fileRefs.push({ name: candidate.name, blobPath: candidate.blobPath, extension: ext });
          continue;
        }
        if (candidate.file.size > 0) {
          uploadFiles.push(candidate.file);
          fileRefs.push({ name: candidate.name, blobPath: candidate.blobPath, extension: ext });
        }
      }
      if (!uploadFiles.length) {
        throw new Error('Please choose at least one .pdf, .doc, .docx or .mp3 file.');
      }
      const payload = await runSummarization(uploadFiles, 'application_document_summarization');
      setSummary(payload);
      setSummarizedFiles(
        fileRefs.filter(
          (ref, idx, all) => all.findIndex((x) => x.name === ref.name && (x.blobPath || '') === (ref.blobPath || '')) === idx,
        ),
      );
      setDone(true);
    } catch (e) {
      setError("Something went wrong while generating the summary. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleFilesSelected = (files: FileList | null) => {
    if (files) {
      const filtered = Array.from(files)
        .filter((file) => ALLOWED_EXTENSIONS.has(file.name.split('.').pop()?.toLowerCase() || ''))
        .map((file) => ({ file, name: file.name || 'Unnamed File' }));
      setAdditionalFiles((prev) => [...prev, ...filtered]);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
      if (dragTimeoutRef.current) clearTimeout(dragTimeoutRef.current);
    } else if (e.type === 'dragleave') {
      dragTimeoutRef.current = setTimeout(() => {
        setDragActive(false);
      }, 10);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragTimeoutRef.current) clearTimeout(dragTimeoutRef.current);
    setDragActive(false);
    
    // Handle files from system drag & drop
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesSelected(e.dataTransfer.files);
      return;
    }
    
    // Handle dragged FileNodes from the file tree
    const fileId = e.dataTransfer.getData('text/x-fileid') || e.dataTransfer.getData('text/plain');
    if (fileId) {
      try {
        const fileStore = (window as any).__fileStore;
        if (fileStore && fileStore.has(fileId)) {
          const stored = fileStore.get(fileId);
          const { file, name, blobPath } = stored;
          addFileToAdditional(file, name, blobPath);
          // Clean up the stored file
          fileStore.delete(fileId);
        }
      } catch (err) {
        console.error('Error retrieving dragged file:', err);
      }
    }
  };

  const addFileToAdditional = (file: File | null, displayName: string, blobPath?: string) => {
    const ext = displayName.split('.').pop()?.toLowerCase() || '';
    if (!ALLOWED_EXTENSIONS.has(ext)) return;
    const fileToAdd = file || new File([], displayName, { type: 'application/octet-stream' });
    setAdditionalFiles(prev => {
      const exists = prev.some(f => f.name === displayName && f.file.size === fileToAdd.size);
      if (exists) return prev;
      return [...prev, { file: fileToAdd, name: displayName, blobPath }];
    });
  };

  const removeFile = (index: number) => {
    setAdditionalFiles(prev => prev.filter((_, i) => i !== index));
  };

  const displaySections = useMemo(() => {
    if (!summary || typeof summary !== 'object') return [];
    const entries = Object.entries(summary).filter(([, value]) => value !== null && value !== undefined);
    return sortEntriesByOrder(entries, SECTION_ORDER);
  }, [summary]);

  const renderSources = (sources: unknown) => {
    const list = Array.isArray(sources) ? (sources as SummarizationFieldSource[]) : [];
    if (!list.length) return null;
    const rendered = list.slice(0, MAX_SOURCES_RENDER);
    const hiddenCount = Math.max(0, list.length - rendered.length);
    return (
      <div className="mt-2 space-y-1">
        {rendered.map((source, idx) => {
          const label = source.file
            ? `${source.file}${source.page ? ` (Page ${source.page})` : ''}`
            : source.section || `Source ${idx + 1}`;
          return (
            <div key={`${label}-${idx}`} className="rounded px-2 py-1 text-[11px]" style={{ background: '#F8F7F4', border: '0.5px solid #e0ddd6' }}>
              {source.file ? (
                <button
                  type="button"
                  className="text-left w-full"
                  style={{ color: '#0C447C' }}
                  onClick={() => onFocusSource?.({ file: source.file!, page: source.page })}
                  title={source.text_snippet || source.reason || label}
                >
                  {label}
                </button>
              ) : (
                <div className="text-black">{label}</div>
              )}
              {source.text_snippet && <div className="text-black mt-1">{compactText(sanitizeDisplayText(source.text_snippet))}</div>}
              {source.reason && <div className="text-black mt-1">{compactText(sanitizeDisplayText(source.reason))}</div>}
            </div>
          );
        })}
        {hiddenCount > 0 && (
          <div className="text-[10px] text-gray-500 px-1">+{hiddenCount} more source{hiddenCount > 1 ? 's' : ''}</div>
        )}
      </div>
    );
  };

  const renderField = (label: string, fieldValue: unknown, depth = 0, path = label): React.ReactNode => {
    if (HIDDEN_KEYS.has(label.trim().toLowerCase())) return null;

    if (isFieldObject(fieldValue)) {
      const extraEntries = Object.entries(fieldValue as Record<string, unknown>).filter(
        ([k]) => !['value', 'source'].includes(k) && !HIDDEN_KEYS.has(k.trim().toLowerCase()),
      );
      const orderedExtras = sortEntriesByOrder(extraEntries, FIELD_ORDER_BY_SECTION[label] || []);
      const extras = orderedExtras.map(([k, v]) => renderField(k, v, depth + 1, `${path}.${k}`)).filter(Boolean);
      const isOverallSummary = label.trim().toLowerCase() === 'overall_summary';
      const sourceBlock = isOverallSummary ? null : renderSources((fieldValue as { source?: unknown }).source);
      const hasDisplayValue = isNonEmptyPrimitive(fieldValue.value);

      if (!hasDisplayValue && !extras.length && !sourceBlock) return null;

      return (
        <div key={path} className="rounded-lg px-3 py-2.5" style={{ background: '#FFFFFF', border: '0.5px solid #e0ddd6' }}>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-black">{prettifyLabel(label)}</div>
          {hasDisplayValue && <div className="text-xs text-black mt-1">{sanitizeDisplayText(fieldValue.value)}</div>}
          {extras.length > 0 && <div className="mt-2 space-y-2">{extras}</div>}
          {sourceBlock}
        </div>
      );
    }

    if (Array.isArray(fieldValue)) {
      const includeIndexSuffix = fieldValue.length > 1;
      if (!includeIndexSuffix) {
        const sole = fieldValue[0];
        if (sole && typeof sole === 'object' && !Array.isArray(sole) && !isFieldObject(sole)) {
          const entries = Object.entries(sole as Record<string, unknown>);
          let renderEntries = entries;
          if (entries.length === 1) {
            const [onlyKey, onlyValue] = entries[0];
            if (normalizeKeyForCompare(onlyKey) === normalizeKeyForCompare(label)) {
              if (onlyValue && typeof onlyValue === 'object' && !Array.isArray(onlyValue)) {
                renderEntries = Object.entries(onlyValue as Record<string, unknown>);
              } else {
                renderEntries = [[onlyKey, onlyValue]];
              }
            }
          }
          const nested = renderEntries
            .map(([k, v]) => renderField(k, v, depth + 1, `${path}[0].${k}`))
            .filter(Boolean);
          if (nested.length) {
            return (
              <div key={path} className="rounded-lg p-2 space-y-2" style={{ background: '#F8F7F4', border: '0.5px solid #e0ddd6' }}>
                <div className="text-xs font-semibold text-black px-1">{prettifyLabel(label)}</div>
                {nested}
              </div>
            );
          }
        }
      }
      const items = fieldValue
        .map((item, idx) => {
          const childLabel = includeIndexSuffix ? `${label}_${idx + 1}` : label;
          return renderField(childLabel, item, depth + 1, `${path}[${idx}]`);
        })
        .filter(Boolean);
      if (!items.length) return null;
      return (
        <div key={path} className="rounded-lg p-2 space-y-2" style={{ background: '#F8F7F4', border: '0.5px solid #e0ddd6' }}>
          <div className="text-xs font-semibold text-black px-1">{prettifyLabel(label)}</div>
          {items}
        </div>
      );
    }

    if (fieldValue && typeof fieldValue === 'object') {
      const entries = Object.entries(fieldValue as Record<string, unknown>);
      const orderedEntries = sortEntriesByOrder(entries, FIELD_ORDER_BY_SECTION[label] || []);
      const items = orderedEntries
        .map(([k, v]) => renderField(k, v, depth + 1, `${path}.${k}`))
        .filter(Boolean);
      if (!items.length) return null;
      return (
        <div key={path} className="rounded-lg p-2 space-y-2" style={{ background: '#F8F7F4', border: '0.5px solid #e0ddd6' }}>
          <div className="text-xs font-semibold text-black px-1">{prettifyLabel(label)}</div>
          {items}
        </div>
      );
    }

    if (!isNonEmptyPrimitive(fieldValue)) return null;
    return (
      <div key={path} className="rounded-lg px-3 py-2.5" style={{ background: '#FFFFFF', border: '0.5px solid #e0ddd6' }}>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-black">{prettifyLabel(label)}</div>
        <div className="text-xs text-black mt-1">{sanitizeDisplayText(fieldValue)}</div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div className="rounded-lg px-3 py-2 text-xs flex items-center justify-between" style={{ background: '#F8F7F4', border: '0.5px solid #e0ddd6' }}>
          <div>
            {selectedFile ? <span className="text-gray-600 font-medium">{selectedFile.name}</span>
              : <span className="text-gray-400">No file selected — pick one from the file tree</span>}
          </div>
          {selectedFile && onClearSelectedFile && (
            <button
              onClick={onClearSelectedFile}
              className="text-gray-400 hover:text-red-500 transition-colors ml-2 shrink-0"
              title="Clear file"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Additional Files Section */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-gray-500 px-1">Additional Files</div>
          
          {/* Drag Drop Area */}
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className="rounded-lg p-3 border-2 border-dashed transition-all"
            style={{
              borderColor: dragActive ? '#185FA5' : '#e0ddd6',
              background: dragActive ? '#E6F1FB' : '#F8F7F4'
            }}
          >
            <div className="flex flex-col items-center justify-center gap-2 py-2">
              <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: '#E6F1FB', border: '0.5px solid #185FA5' }}>
                <Plus size={12} style={{ color: '#0C447C' }} />
              </div>
              <div className="text-xs text-center" style={{ color: dragActive ? '#0C447C' : '#999' }}>
                <div className="font-medium">Drag & drop files here</div>
                <div className="text-gray-400 text-xs">PDF, DOC, DOCX</div>
              </div>
            </div>
          </div>

          {/* Selected Files List */}
          {additionalFiles.length > 0 && (
            <div className="space-y-1.5 px-1">
              {additionalFiles.map((fileItem, idx) => (
                <div key={idx} className="flex items-center justify-between px-2 py-1.5 rounded-lg" style={{ background: '#F8F7F4', border: '0.5px solid #e0ddd6' }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <Upload size={11} className="text-gray-400 shrink-0" />
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

        {!selectedFileEligible && selectedFile && (
          <div className="rounded-lg px-3 py-2 text-xs text-amber-800" style={{ background: '#FFFBEB', border: '0.5px solid #D97706' }}>
            Selected preview file is not supported for summarization. Use PDF, DOC, DOCX or MP3.
          </div>
        )}

        {error && (
          <div className="rounded-lg px-3 py-2 text-xs text-red-800" style={{ background: '#FEE2E2', border: '0.5px solid #DC2626' }}>
            {error}
          </div>
        )}

        {loading && <SummarisationSkeleton />}
        {!loading && done && (
          <>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 px-1">
              Summarization result
            </div>
            {displaySections.map(([sectionKey, sectionValue]) => {
              return renderField(sectionKey, sectionValue);
            })}
            {summary && summarizedFiles.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  navigate('/summarisation/results', {
                    state: { summaryResult: summary, summarizedFiles },
                  })
                }
                className="w-full mt-2 py-2 rounded-lg text-xs font-semibold"
                style={{ background: '#E6F1FB', color: '#0C447C', border: '0.5px solid #185FA5' }}
              >
                Open Full View
              </button>
            )}
          </>
        )}
      </div>

      <div className="p-3" style={{ borderTop: '0.5px solid #e0ddd6' }}>
        <button
          type="button"
          onClick={() => navigate('/summarize-other-files')}
          className="w-full mb-2 py-2 rounded-lg text-xs font-semibold"
          style={{ background: '#E6F1FB', color: '#0C447C', border: '0.5px solid #185FA5', cursor: 'pointer' }}
        >
          Summarize Other Files
        </button>
        <button onClick={handleRun} disabled={!canRun || loading}
          className="w-full py-2 rounded-lg text-xs font-semibold text-white flex items-center justify-center gap-1.5 disabled:opacity-40"
          style={{ background: '#0F6E56' }}>
          {loading ? 'Processing…' : <><Play size={11} /> Run Summarisation</>}
        </button>
      </div>
    </div>
  );
}
