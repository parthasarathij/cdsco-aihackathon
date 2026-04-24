import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft, Tag, UploadCloud, ArrowRight,
  AlertTriangle, Copy, Star, FileText, Folder, X, ChevronRight, ChevronDown,
  Maximize2, ArrowLeftCircle, RotateCcw, Plus
} from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import TopBarSimple from '../../../components/TopBarSimple';
import ResponsivePage from '../../../components/layout/ResponsiveShell';
import { CaseListSkeleton, ClassificationResultSkeleton } from '../../../components/Skeleton';
import { classificationClient } from '../api/client';

interface UploadedItem {
  name: string;
  type: 'file' | 'folder';
  size?: number;
  children?: UploadedItem[];
  file?: File; // Add file property
}

interface ClassifiedCase {
  id: string;
  severity: 'Death' | 'Disability' | 'Hospitalisation' | 'Others';
  priorityScore: number;
  drug: string;
  event: string;
  duplicate: boolean;
  outcome: string;
  causality: string;
  timeToOnset: string;
  sourceFile?: string;
  patientAge?: string;
  patientSex?: string;
  reporter?: string;
  reportDate?: string;
  narrative?: string;
}



const SEV: Record<string, { bg: string; border: string; text: string; bar: string; light: string }> = {
  Death:           { bg: '#FAECE7', border: '#993C1D', text: '#712B13', bar: '#993C1D', light: '#FDF5F3' },
  Disability:      { bg: '#FAEEDA', border: '#854F0B', text: '#633806', bar: '#854F0B', light: '#FDF8F0' },
  Hospitalisation: { bg: '#E6F1FB', border: '#185FA5', text: '#0C447C', bar: '#185FA5', light: '#F0F6FD' },
  Others:          { bg: '#F1EFE8', border: '#888',    text: '#444',    bar: '#aaa',    light: '#F8F7F4' },
};

function hashToUnitInterval(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return (hash % 1000) / 1000;
}

function derivePriorityScore(priorityLabel: string, seed: string): number {
  const t = hashToUnitInterval(seed);
  let score = 2.0;
  const normalized = (priorityLabel || '').toLowerCase();
  if (normalized.includes('high')) score = 8.5 + (t * 1.5);
  else if (normalized.includes('medium')) score = 5.5 + (t * 2.5);
  else if (normalized.includes('low')) score = 1.5 + (t * 3.5);
  return Number(score.toFixed(1));
}

function getFieldValue(field: any): string {
  if (field == null) return '';
  if (typeof field === 'string') return field;
  if (typeof field?.value === 'string') return field.value;
  return '';
}

function buildCaseNarrative(classification: any): string {
  const caseNarrative = getFieldValue(classification?.case_narrative);
  if (caseNarrative) return caseNarrative;

  const eventDescription = getFieldValue(classification?.event_description);
  const outcome = getFieldValue(classification?.outcome);
  const causality = getFieldValue(classification?.causality);
  const onset = getFieldValue(classification?.event_onset);
  const patientAge = getFieldValue(classification?.patient_age);
  const patientGender = getFieldValue(classification?.patient_gender);
  const suspectedDrug = getFieldValue(classification?.suspected_drug);

  const composed = [
    eventDescription ? `Event: ${eventDescription}` : '',
    outcome ? `Outcome: ${outcome}` : '',
    causality ? `Causality: ${causality}` : '',
    onset ? `Onset: ${onset}` : '',
    suspectedDrug ? `Suspected drug: ${suspectedDrug}` : '',
    patientAge || patientGender
      ? `Patient: ${[patientAge, patientGender].filter(Boolean).join(', ')}`
      : '',
  ]
    .filter(Boolean)
    .join('. ');
  if (composed) return composed;

  const candidateSources = [
    classification?.event_description?.source,
    classification?.outcome?.source,
    classification?.seriousness?.source,
  ];

  for (const sources of candidateSources) {
    if (!Array.isArray(sources)) continue;
    const snippets = sources
      .map((s: any) => (typeof s?.text_snippet === 'string' ? s.text_snippet.trim() : ''))
      .filter((txt: string) => txt.length > 0 && !txt.toLowerCase().includes('rule-based engine output'));
    if (snippets.length > 0) return snippets.join(' ');
  }

  return 'No narrative available.';
}

function FileTreeItem({ item, depth = 0 }: { item: UploadedItem; depth?: number }) {
  const [open, setOpen] = useState(depth < 1);
  const isFolder = item.type === 'folder';
  return (
    <div>
      <div className="flex items-center gap-1.5 py-1 px-2 rounded text-xs hover:bg-gray-50 cursor-pointer" style={{ paddingLeft: `${8 + depth * 14}px` }} onClick={() => isFolder && setOpen(o => !o)}>
        {isFolder
          ? <><span className="text-gray-400">{open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}</span><Folder size={12} style={{ color: '#854F0B', flexShrink: 0 }} /></>
          : <><span style={{ width: 10 }} /><FileText size={12} style={{ color: '#185FA5', flexShrink: 0 }} /></>}
        <span className="truncate text-gray-700">{item.name}</span>
        {isFolder && item.children && <span className="ml-auto text-gray-400 text-xs whitespace-nowrap">{item.children.length} items</span>}
        {!isFolder && item.size && <span className="ml-auto text-gray-400 text-xs whitespace-nowrap">{(item.size / 1024).toFixed(0)}KB</span>}
      </div>
      {isFolder && open && item.children?.map((child, i) => <FileTreeItem key={i} item={child} depth={depth + 1} />)}
    </div>
  );
}

function UploadZone({ label, sublabel, color, accent, items, onFiles, onClear }: {
  label: string; sublabel: string; color: string; accent: string;
  items: UploadedItem[]; onFiles: (items: UploadedItem[]) => void; onClear: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const parseFiles = (fileList: FileList): UploadedItem[] => {
    const result: UploadedItem[] = [];
    const folders: Record<string, UploadedItem> = {};
    Array.from(fileList).forEach(f => {
      const rel = (f as any).webkitRelativePath;
      if (rel) {
        const parts = rel.split('/'); const fn = parts[0];
        if (!folders[fn]) { folders[fn] = { name: fn, type: 'folder', children: [] }; result.push(folders[fn]); }
        if (parts.length > 1) folders[fn].children!.push({ name: parts.slice(1).join('/'), type: 'file', size: f.size, file: f });
      } else { result.push({ name: f.name, type: 'file', size: f.size, file: f }); }
    });
    return result;
  };

  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) onFiles(parseFiles(e.dataTransfer.files)); };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 mb-3">
        <div className="text-xs font-semibold uppercase tracking-widest" style={{ color }}>{label}</div>
      </div>

      {items.length === 0 ? (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className="flex-1 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-4 transition-all"
          style={{ borderColor: dragging ? color : '#d0cec8', background: dragging ? `${accent}88` : '#FAFAF8', minHeight: 300 }}
        >
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: accent, border: `1px solid ${color}` }}>
            <UploadCloud size={26} style={{ color }} />
          </div>
          <div className="text-center px-6">
            <div className="text-sm font-semibold text-gray-700 mb-1">Drag & drop files here</div>
            <div className="text-xs text-gray-400 mb-4">SAEs, Application Form Datas & Meeting Transcripts</div>
          </div>
          <div className="flex gap-3">
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => e.target.files && onFiles(parseFiles(e.target.files))} />
            <input ref={folderInputRef} type="file" multiple className="hidden" {...{ webkitdirectory: 'true' } as any} onChange={e => e.target.files && onFiles(parseFiles(e.target.files))} />
            <button 
              onClick={() => fileInputRef.current?.click()} 
              className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg font-semibold transition-opacity hover:opacity-80" 
              style={{ background: accent, color, border: `0.5px solid ${color}` }}
            >
              <FileText size={12} /> Upload Files
            </button>
            <button 
              onClick={() => folderInputRef.current?.click()} 
              className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg font-semibold transition-opacity hover:opacity-80" 
              style={{ background: accent, color, border: `0.5px solid ${color}` }}
            >
              <Folder size={12} /> Upload Folder
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 rounded-2xl overflow-hidden flex flex-col" style={{ border: `1.5px solid ${color}`, background: '#FAFAF8', maxHeight: 400, display: 'flex' }}>
          {/* Header bar */}
          <div className="flex items-center justify-between px-3 py-2" style={{ background: accent, borderBottom: `0.5px solid ${color}` }}>
            <div className="flex items-center gap-2">
              <Tag size={13} style={{ color }} />
              <span className="text-xs font-semibold" style={{ color }}>{items.length} item{items.length > 1 ? 's' : ''} ready</span>
            </div>
            <div className="flex items-center gap-2">
              {/* Upload more buttons */}
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => e.target.files && onFiles(parseFiles(e.target.files))} />
              <input ref={folderInputRef} type="file" multiple className="hidden" {...{ webkitdirectory: 'true' } as any} onChange={e => e.target.files && onFiles(parseFiles(e.target.files))} />
              <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1 text-xs px-2 py-1 rounded font-medium opacity-60 hover:opacity-100" style={{ color }}>
                <FileText size={11} /> Add Files
              </button>
              <button onClick={() => folderInputRef.current?.click()} className="flex items-center gap-1 text-xs px-2 py-1 rounded font-medium opacity-60 hover:opacity-100" style={{ color }}>
                <Folder size={11} /> Add Folder
              </button>
              {/* Remove / clear */}
              <button
                onClick={onClear}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded font-medium transition-opacity hover:opacity-80"
                style={{ color, background: `${color}18`, border: `0.5px solid ${color}50` }}
                title="Remove all files"
              >
                <X size={11} /> Remove
              </button>
            </div>
          </div>

          {/* File tree */}
          <div className="flex-1 overflow-y-auto p-2">
            {items.map((item, i) => <FileTreeItem key={i} item={item} />) || (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
                <Plus size={20} />
                <span className="text-xs">Drag more files here</span>
              </div>
            )}
          </div>
        </div>
      )}
      <div className="mt-2 text-xs text-gray-400 text-center">{sublabel}</div>
    </div>
  );
}

function FullViewModal({ selectedCase, onClose }: { selectedCase: ClassifiedCase; onClose: () => void }) {
  const s = SEV[selectedCase.severity];
  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center" 
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div 
        className="relative flex flex-col rounded-2xl shadow-2xl overflow-hidden" 
        style={{ width: 680, maxHeight: '90vh', background: '#FAFAF8', border: `1.5px solid ${s.border}` }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ background: s.bg, borderBottom: `1px solid ${s.border}` }}>
          <div className="flex items-center gap-3">
            <div className="rounded-lg px-3 py-1.5 text-xs font-bold text-white" style={{ background: s.border }}>{selectedCase.severity}</div>
            <span className="text-sm font-bold font-mono text-gray-800">{selectedCase.id}</span>
            {selectedCase.duplicate && (
              <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium" style={{ background: '#FAECE7', color: '#712B13', border: '0.5px solid #993C1D' }}>
                <AlertTriangle size={10} /> Duplicate
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-black/10 transition-colors">
            <X size={16} style={{ color: s.text }} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Priority bar */}
          <div className="rounded-xl p-4" style={{ background: s.light, border: `0.5px solid ${s.border}40` }}>
            <div className="flex justify-between items-end mb-2">
              <span className="text-xs font-semibold text-gray-600">Priority Score</span>
              <span className="font-bold text-lg leading-none" style={{ color: s.text }}>{selectedCase.priorityScore}<span className="text-xs font-normal text-gray-400 ml-1">/ 10</span></span>
            </div>
            <div className="h-2.5 rounded-full" style={{ background: '#e8e6e0' }}>
              <div className="h-full rounded-full" style={{ width: `${selectedCase.priorityScore * 10}%`, background: s.bar }} />
            </div>
          </div>

          {/* Details grid */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Case Details</div>
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { label: 'Case ID',       value: selectedCase.id },
                { label: 'Drug',          value: selectedCase.drug },
                { label: 'Adverse Event', value: selectedCase.event },
                { label: 'Causality',     value: selectedCase.causality },
                { label: 'Time to Onset', value: selectedCase.timeToOnset },
                { label: 'Outcome',       value: selectedCase.outcome },
                { label: 'Patient Age',   value: selectedCase.patientAge ?? '—' },
                { label: 'Patient Sex',   value: selectedCase.patientSex ?? '—' },
                { label: 'Reporter',      value: selectedCase.reporter ?? '—' },
                { label: 'Report Date',   value: selectedCase.reportDate ?? '—' },
              ].map((row, i) => (
                <div key={i} className="rounded-lg px-3 py-2.5" style={{ background: 'white', border: '0.5px solid #e0ddd6' }}>
                  <div className="text-xs text-gray-400 mb-0.5">{row.label}</div>
                  <div className="text-sm font-medium text-gray-800">{row.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Source file */}
          {selectedCase.sourceFile && (
            <div className="rounded-xl px-4 py-3 flex items-center gap-3" style={{ background: '#F1EFE8', border: '0.5px solid #d0cec8' }}>
              <FileText size={14} style={{ color: '#854F0B', flexShrink: 0 }} />
              <div>
                <div className="text-xs text-gray-400 mb-0.5">Source File</div>
                <div className="text-xs font-medium text-gray-700">{selectedCase.sourceFile}</div>
              </div>
            </div>
          )}

          {/* Narrative */}
          {selectedCase.narrative && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Case Narrative</div>
              <div className="rounded-xl p-4 text-sm text-gray-700 leading-relaxed" style={{ background: 'white', border: '0.5px solid #e0ddd6' }}>
                {selectedCase.narrative}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex items-center justify-between" style={{ borderTop: '0.5px solid #e0ddd6', background: 'white' }}>
          <button onClick={onClose} className="flex items-center gap-2 text-xs px-4 py-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors">
            <ArrowLeftCircle size={13} /> Back to Queue
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ClassificationPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const state = (location.state as any) ?? {};
  const convertFileTree = (nodes: any[]): UploadedItem[] =>
    (nodes ?? []).map((n: any) => ({ name: n.name, type: n.type, children: convertFileTree(n.children) }));
  const workspaceFiles: UploadedItem[] = convertFileTree(state.oldFiles);

  // Helper to map backend results to frontend format
  const convertBackendResults = (results: any[]): ClassifiedCase[] => {
    return (results || []).map((res, i) => {
      const seriousness = res.classification?.seriousness?.value || 'Others';
      let severity: 'Death' | 'Disability' | 'Hospitalisation' | 'Others' = 'Others';
      if (seriousness.toLowerCase().includes('death')) severity = 'Death';
      else if (seriousness.toLowerCase().includes('disability')) severity = 'Disability';
      else if (seriousness.toLowerCase().includes('hospital')) severity = 'Hospitalisation';

      const priorityStr = res.classification?.priority?.value || 'Low';
      const caseId = res.classification?.case_id?.value || `SAE-2026-${String(i + 1).padStart(3, '0')}`;
      const sourceFile = res.file_name || '';
      const priorityScore = derivePriorityScore(priorityStr, `${caseId}|${sourceFile}|${i}`);

      return {
        id: caseId,
        severity,
        priorityScore,
        drug: res.classification?.suspected_drug?.value || 'Unknown Drug',
        event: res.classification?.event_description?.value || 'Unknown Event',
        duplicate: res.duplicate_detection?.is_duplicate || false,
        outcome: res.classification?.outcome?.value || 'Not Specified',
        causality: res.classification?.causality?.value || 'Unknown',
        timeToOnset: res.classification?.event_onset?.value || 'Unknown',
        sourceFile: res.file_name,
        patientAge: res.classification?.patient_age?.value || 'Unknown',
        patientSex: res.classification?.patient_gender?.value || 'Unknown',
        reporter: res.classification?.reporter?.value || 'Unknown',
        reportDate: new Date().toISOString().split('T')[0],
        narrative: buildCaseNarrative(res.classification)
      };
    });
  };

  const isResultsStage = location.pathname.includes('/results');
  
  const realResults = state.results ? convertBackendResults(state.results) : [];
  const totalCases = realResults.length;
  const duplicateCount = realResults.filter(c => c.duplicate).length;
  const severityCounts = realResults.reduce((acc, c) => {
    acc[c.severity] = (acc[c.severity] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);


  const autoOpenCaseId: string | null = state.autoOpen ?? null;
  const initialProcessed = !!(autoOpenCaseId && workspaceFiles.length > 0);

  const [items, setItems] = useState<UploadedItem[]>(workspaceFiles);
  const [processed, setProcessed] = useState(initialProcessed || isResultsStage);
  const [loading, setLoading] = useState(false);
  const [isClassifyMoreMode, setIsClassifyMoreMode] = useState(false);
  const [selectedCase, setSelectedCase] = useState<ClassifiedCase>(() => {
    if (autoOpenCaseId) {
      return realResults.find(c => c.id === autoOpenCaseId) || realResults[0];
    }
    return realResults[0];
  });
  const [fullViewCase, setFullViewCase] = useState<ClassifiedCase | null>(null);
  const hasAutoOpenedRef = useRef<string | null>(null);

  useEffect(() => {
    if (state.autoOpen && realResults.length > 0 && hasAutoOpenedRef.current !== state.autoOpen) {
      const target = realResults.find(c => c.id === state.autoOpen);
      if (target) {
        setSelectedCase(target);
        setFullViewCase(target);
        hasAutoOpenedRef.current = state.autoOpen;
      }
    }
  }, [state.autoOpen, realResults]);

  // Remember last-used files so "Classify More" re-populates the zone
  const [lastItems, setLastItems] = useState<UploadedItem[]>(workspaceFiles);
  const [leftPanelWidth, setLeftPanelWidth] = useState(260);
  const [rightPanelWidth, setRightPanelWidth] = useState(320);
  const MIN = 200, MAX = 500;

  // Redirect to /upload if on base /classification route
  useEffect(() => {
    if (location.pathname === '/classification') {
      navigate('/classification/upload', { replace: true });
    }
  }, []);

  const handleRun = async () => {
    if (!items.length) return;
    setLoading(true);
    setLastItems(items);
    
    try {
      // Collect all actual File objects
      const files: File[] = [];
      const traverse = (itemList: UploadedItem[]) => {
        itemList.forEach(item => {
          if (item.type === 'file' && item.file) files.push(item.file);
          if (item.children) traverse(item.children);
        });
      };
      traverse(items);

      if (files.length === 0) {
        // No files to process
        setLoading(false);
        return;
      }

      const response = isClassifyMoreMode 
        ? await classificationClient.classifyOtherFiles(files) 
        : await classificationClient.classify(files);

      if (response.success) {
        setLoading(false);
        setProcessed(true);
        // Handle results (extract results from data if it's the new endpoint)
        const results = isClassifyMoreMode ? (response.data as any).results : response.data;
        
        // Auto-open first result in full view
        const converted = convertBackendResults(results);
        if (converted.length > 0) {
          setSelectedCase(converted[0]);
          setFullViewCase(converted[0]);
        }
        
        navigate('/classification/results', { 
          replace: true,
          state: { results: results, oldFiles: state.oldFiles, autoOpen: converted[0]?.id }
        });
        setIsClassifyMoreMode(false); // Reset mode
      } else {
        alert(response.error || 'Classification failed');
        setLoading(false);
      }
    } catch (err) {
      console.error(err);
      alert('An unexpected error occurred');
      setLoading(false);
    }
  };

  const handleClassifyMore = () => {
    setProcessed(false);
    setItems([]); 
    setIsClassifyMoreMode(true);
    navigate('/classification/upload', { replace: true });
  };

  const sc = SEV[selectedCase.severity];

  // Define all three panels upfront so they can be passed to ResponsivePage
  const leftPanel = (<aside className="flex flex-col bg-white overflow-hidden h-full" style={{ borderRight: '0.5px solid #e0ddd6' }}>
    <div className="px-3 py-2.5" style={{ borderBottom: '0.5px solid #e0ddd6' }}>
      <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Overview</span>
    </div>
    <div className="p-4 space-y-3 overflow-y-auto flex-1">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg p-3 text-center" style={{ background: '#E6F1FB', border: '0.5px solid #185FA5' }}>
          <div className="text-xl font-bold" style={{ color: '#0C447C' }}>{totalCases}</div>
          <div className="text-xs mt-0.5" style={{ color: '#185FA5' }}>Total Cases</div>
        </div>
        <div className="rounded-lg p-3 text-center" style={{ background: '#FAEEDA', border: '0.5px solid #854F0B' }}>
          <div className="text-xl font-bold" style={{ color: '#633806' }}>{duplicateCount}</div>
          <div className="text-xs mt-0.5" style={{ color: '#854F0B' }}>Duplicates</div>
        </div>
      </div>
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">By Severity</div>
        {['Death', 'Disability', 'Hospitalisation', 'Others'].map((sev) => {
          const count = severityCounts[sev] || 0;
          const c = SEV[sev];
          return (
            <div key={sev} className="flex items-center gap-2 mb-2">
              <span className="text-xs w-28 text-gray-600">{sev}</span>
              <div className="flex-1 h-1.5 rounded-full" style={{ background: '#f0ede8' }}>
                <div className="h-full rounded-full" style={{ width: `${(count / (totalCases || 1)) * 100}%`, background: c.bar }} />
              </div>
              <span className="text-xs text-gray-500 w-4 text-right">{count}</span>
            </div>
          );
        })}
      </div>

      {/* Source files used */}
      {lastItems.length > 0 && (
        <div style={{ borderTop: '0.5px solid #e0ddd6', paddingTop: 12 }}>
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Source Files</div>
          {lastItems.map((item, i) => (
            <div key={i} className="flex items-center gap-1.5 py-1 text-xs text-gray-600">
              {item.type === 'folder'
                ? <Folder size={11} style={{ color: '#854F0B', flexShrink: 0 }} />
                : <FileText size={11} style={{ color: '#185FA5', flexShrink: 0 }} />}
              <span className="truncate">{item.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  </aside>);

  const middlePanel = (<main className="flex flex-col bg-white flex-1 overflow-hidden h-full" style={{ minWidth: 0 }}>
    <div className="px-4 py-2.5 flex items-center gap-2" style={{ borderBottom: '0.5px solid #e0ddd6', flexShrink: 0 }}>
      <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Prioritised Case Queue</span>
      <span className="ml-auto text-xs px-2 py-0.5 rounded-full" style={{ background: '#FAEEDA', color: '#633806', border: '0.5px solid #854F0B' }}>
        <Star size={9} style={{ display: 'inline', marginRight: 3 }} />Sorted by priority
      </span>
    </div>
    <div className="flex-1 overflow-y-auto p-3 space-y-2">
      {loading ? (
        <CaseListSkeleton />
      ) : (
        realResults.map((c) => {
          const s = SEV[c.severity];
          const isSelected = selectedCase.id === c.id;
          return (
            <button key={c.id} onClick={() => setSelectedCase(c)}
              className="w-full text-left rounded-xl p-3 transition-all group"
              style={{ background: isSelected ? s.bg : '#FAFAF8', border: `0.5px solid ${isSelected ? s.border : '#e0ddd6'}`, outline: isSelected ? `1.5px solid ${s.border}` : 'none', outlineOffset: '-1px' }}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold font-mono" style={{ color: isSelected ? s.text : '#374151' }}>{c.id}</span>
                <div className="flex items-center gap-1.5">
                  {c.duplicate && <span className="flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full" style={{ background: '#FAECE7', color: '#712B13', border: '0.5px solid #993C1D' }}><Copy size={8} /> Dup</span>}
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: s.bg, color: s.text, border: `0.5px solid ${s.border}` }}>{c.severity}</span>
                  <div
                    onClick={e => { e.stopPropagation(); setFullViewCase(c); }}
                    className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded transition-opacity cursor-pointer hover:bg-gray-200"
                    style={{ background: '#F1EFE8', color: '#666', border: '0.5px solid #d0cec8' }}
                    title="Open Full View"
                  >
                    <Maximize2 size={9} />
                  </div>
                </div>
              </div>
              <div className="text-xs text-gray-600 mb-1">{c.event}</div>
              {c.sourceFile && <div className="text-xs text-gray-400 mb-2 truncate">📁 {c.sourceFile}</div>}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full" style={{ background: '#f0ede8' }}>
                  <div className="h-full rounded-full" style={{ width: `${c.priorityScore * 10}%`, background: s.bar }} />
                </div>
                <span className="text-xs font-semibold" style={{ color: s.text }}>{c.priorityScore}/10</span>
              </div>
            </button>
          );
        })
      )}
    </div>
  </main>);

  const rightPanel = (<aside className="flex flex-col bg-white overflow-hidden h-full" style={{ borderLeft: '0.5px solid #e0ddd6' }}>
    <div className="px-3 py-2.5 flex items-center justify-between" style={{ borderBottom: '0.5px solid #e0ddd6' }}>
      <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Case Detail</span>
      <button
        onClick={() => setFullViewCase(selectedCase)}
        className="flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-gray-100 transition-colors text-gray-500"
      >
        <Maximize2 size={11} /> Full View
      </button>
    </div>
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {loading ? (
        <ClassificationResultSkeleton />
      ) : (
        <>
          <div className="rounded-xl p-4 flex items-center justify-between" style={{ background: sc.bg, border: `0.5px solid ${sc.border}` }}>
            <div>
              <div className="text-xs text-gray-500 mb-1">Severity</div>
              <div className="text-base font-bold" style={{ color: sc.text }}>{selectedCase.severity}</div>
            </div>
            {selectedCase.duplicate && <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium" style={{ background: '#FAECE7', color: '#712B13', border: '0.5px solid #993C1D' }}><AlertTriangle size={10} /> Duplicate</span>}
          </div>
          <div className="rounded-xl p-3" style={{ background: '#F8F7F4', border: '0.5px solid #e0ddd6' }}>
            <div className="flex justify-between text-xs mb-2">
              <span className="text-gray-500">Priority Score</span>
              <span className="font-bold" style={{ color: sc.text }}>{selectedCase.priorityScore} / 10</span>
            </div>
            <div className="h-2 rounded-full" style={{ background: '#e8e6e0' }}>
              <div className="h-full rounded-full" style={{ width: `${selectedCase.priorityScore * 10}%`, background: sc.bar }} />
            </div>
          </div>
          <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid #e0ddd6' }}>
            {[
              { label: 'Case ID',       value: selectedCase.id },
              { label: 'Drug',          value: selectedCase.drug },
              { label: 'Event',         value: selectedCase.event },
              { label: 'Causality',     value: selectedCase.causality },
              { label: 'Time to Onset', value: selectedCase.timeToOnset },
              { label: 'Outcome',       value: selectedCase.outcome },
              { label: 'Patient Age',   value: selectedCase.patientAge ?? '—' },
              { label: 'Patient Sex',   value: selectedCase.patientSex ?? '—' },
              { label: 'Reporter',      value: selectedCase.reporter ?? '—' },
              { label: 'Source File',   value: selectedCase.sourceFile ?? '—' },
            ].map((row, i, arr) => (
              <div key={i} className="flex gap-3 px-3 py-2.5 text-xs" style={{ borderBottom: i < arr.length - 1 ? '0.5px solid #f0ede8' : 'none' }}>
                <span className="text-gray-400 w-24 shrink-0 font-medium">{row.label}</span>
                <span className="text-gray-700">{row.value}</span>
              </div>
            ))}
          </div>

          {/* Narrative preview */}
          {selectedCase.narrative && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Narrative</div>
              <div className="text-xs text-gray-600 leading-relaxed rounded-xl p-3" style={{ background: '#F8F7F4', border: '0.5px solid #e0ddd6', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {selectedCase.narrative}
              </div>
              <button onClick={() => setFullViewCase(selectedCase)} className="mt-1 text-xs hover:underline" style={{ color: '#854F0B' }}>
                Read full narrative →
              </button>
            </div>
          )}
        </>
      )}
    </div>
    <div className="p-3 flex flex-col gap-2" style={{ borderTop: '0.5px solid #e0ddd6' }}>
      <button
        onClick={() => setFullViewCase(selectedCase)}
        className="w-full py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-opacity hover:opacity-80"
        style={{ background: sc.bg, color: sc.text, border: `0.5px solid ${sc.border}` }}
      >
        <Maximize2 size={11} /> Open Full View
      </button>
    </div>
  </aside>);

  return (
    <>
      <div style={{ height: '100dvh', overflow: 'hidden', background: '#F5F3F0', display: 'flex', flexDirection: 'column' }}>

        {!processed ? (
          /* ── Upload Page ── */
          <div className="flex-1 overflow-y-auto px-8 py-8">
            <div className="max-w-4xl mx-auto">
              <button onClick={() => navigate('/workspace')} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 px-2 py-1 rounded hover:bg-gray-100 mb-4"><ArrowLeft size={13} /> Back</button>
              <h2 className="text-lg font-bold text-gray-800 mb-1">Classify SAE Reports</h2>
              <p className="text-sm text-gray-500 mb-8">
                Upload SAE reports folder to classify by severity, detect duplicates, and generate a prioritised review queue.
              </p>
              <UploadZone
                label={isClassifyMoreMode ? "Classify More Reports" : "SAE Reports Folder"}
                sublabel={
                  isClassifyMoreMode
                    ? 'Upload new files to classify and store in application data'
                    : items.length === 0
                    ? 'Upload SAE reports folder'
                    : lastItems.length > 0 && items === lastItems
                    ? 'Previously classified files — remove or add more below'
                    : workspaceFiles.length > 0
                    ? 'Pre-loaded from workspace — remove or add more below'
                    : 'Files ready to classify'
                }
                color="#854F0B"
                accent="#FAEEDA"
                items={items}
                onFiles={newItems => setItems(prev => [...prev, ...newItems])}
                onClear={() => setItems([])}
              />
              <div className="flex justify-center mt-8">
                <button onClick={handleRun} disabled={!items.length || loading}
                  className="flex items-center gap-2 px-8 py-3 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
                  style={{ background: '#854F0B' }}>
                  {loading
                    ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Classifying…</>
                    : <>Classify Files <ArrowRight size={14} /></>}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        
        {processed && (() => {
          return (
            <ResponsivePage
              topBar={<TopBarSimple user={user} onLogout={() => { logout(); navigate('/login'); }} />}
              subHeader={<div className="flex items-center gap-3 px-4 py-2.5 bg-white" style={{ borderBottom: '0.5px solid #e0ddd6', flexShrink: 0, flexWrap: 'wrap' }}>
                <button onClick={() => navigate('/workspace')} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 px-2 py-1 rounded hover:bg-gray-100"><ArrowLeft size={13} /> Back</button>
                <div style={{ width: 1, height: 16, background: '#e0ddd6' }} />
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: '#FAEEDA', border: '0.5px solid #854F0B' }}><Tag size={12} style={{ color: '#854F0B' }} /></div>
                  <span className="text-sm font-semibold text-gray-800">Classification Tool</span>
                </div>
                {processed && <button onClick={handleClassifyMore} className="ml-auto flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md font-medium transition-opacity hover:opacity-80" style={{ background: '#FAEEDA', color: '#633806', border: '0.5px solid #854F0B' }}><RotateCcw size={11} /> Classify More</button>}
              </div>}
              leftPanel={leftPanel}
              middlePanel={middlePanel}
              rightPanel={rightPanel}
              processed={true}
              leftLabel="Overview"
              middleLabel="Case Queue"
              rightLabel="Detail"
              leftPanelWidth={leftPanelWidth}
              rightPanelWidth={rightPanelWidth}
              onLeftDrag={(d) => setLeftPanelWidth(p => Math.max(MIN, Math.min(MAX, p + d)))}
              onRightDrag={(d) => setRightPanelWidth(p => Math.max(MIN, Math.min(MAX, p - d)))}
            />
          );
        })()}
      </div>

      {/* Modal rendered OUTSIDE the main container to prevent z-index/event bubbling issues */}
      {fullViewCase && (
        <FullViewModal 
          selectedCase={fullViewCase} 
          onClose={() => setFullViewCase(null)} 
        />
      )}
    </>
  );
}
