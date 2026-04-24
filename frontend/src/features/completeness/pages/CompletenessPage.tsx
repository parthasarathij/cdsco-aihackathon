import { useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft, CheckSquare, UploadCloud, FolderOpen, ArrowRight,
  FileText, Folder, X, ChevronRight, ChevronDown, AlertCircle
} from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import TopBarSimple from '../../../components/TopBarSimple';
import ResponsivePage from '../../../components/layout/ResponsiveShell';

interface UploadedItem {
  name: string;
  type: 'file' | 'folder';
  size?: number;
  children?: UploadedItem[];
}

interface Change {
  section: string;
  type: 'added' | 'removed' | 'modified' | 'inconsistent';
  oldValue: string;
  newValue: string;
}

interface MissingField {
  field: string;
  severity: 'critical' | 'major' | 'minor';
  source?: string;
}

interface FolderScore {
  name: string;
  score: number;
  fileCount: number;
  missing: number;
}


// ─── Helpers ──────────────────────────────────────────────────────────────────
function ScoreRing({ score, label, color }: { score: number; label: string; color: string }) {
  const r = 22; const circ = 2 * Math.PI * r; const dash = (score / 100) * circ;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="56" height="56" viewBox="0 0 56 56">
        <circle cx="28" cy="28" r={r} fill="none" stroke="#e8e6e0" strokeWidth="5" />
        <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="5" strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" transform="rotate(-90 28 28)" />
        <text x="28" y="33" textAnchor="middle" fontSize="11" fontWeight="600" fill={color}>{score}%</text>
      </svg>
      <span className="text-xs text-gray-500">{label}</span>
    </div>
  );
}

const CHANGE_STYLE: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  added:        { bg: '#E1F5EE', border: '#0F6E56', text: '#085041', badge: 'Added' },
  removed:      { bg: '#FAECE7', border: '#993C1D', text: '#712B13', badge: 'Removed' },
  modified:     { bg: '#E6F1FB', border: '#185FA5', text: '#0C447C', badge: 'Modified' },
  inconsistent: { bg: '#FAEEDA', border: '#854F0B', text: '#633806', badge: 'Inconsistent' },
};
const MISS_STYLE: Record<string, { bg: string; border: string; text: string }> = {
  critical: { bg: '#FAECE7', border: '#993C1D', text: '#712B13' },
  major:    { bg: '#FAEEDA', border: '#854F0B', text: '#633806' },
  minor:    { bg: '#F1EFE8', border: '#888',    text: '#555' },
};

// ─── File Tree (for uploaded items display) ───────────────────────────────────
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

// ─── Upload Zone ──────────────────────────────────────────────────────────────
function UploadZone({
  label, sublabel, color, accent,
  items, onFiles, onClear,
  fromWorkspace = false,
}: {
  label: string; sublabel: string; color: string; accent: string;
  items: UploadedItem[]; onFiles: (items: UploadedItem[]) => void; onClear: () => void;
  fromWorkspace?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const parseFiles = (fileList: FileList): UploadedItem[] => {
    const result: UploadedItem[] = [];
    const folders: Record<string, UploadedItem> = {};
    Array.from(fileList).forEach(f => {
      const rel = (f as any).webkitRelativePath;
      if (rel) {
        const parts = rel.split('/'); const folderName = parts[0];
        if (!folders[folderName]) { folders[folderName] = { name: folderName, type: 'folder', children: [] }; result.push(folders[folderName]); }
        if (parts.length > 1) folders[folderName].children!.push({ name: parts.slice(1).join('/'), type: 'file', size: f.size });
      } else {
        result.push({ name: f.name, type: 'file', size: f.size });
      }
    });
    return result;
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    if (e.dataTransfer.files.length) onFiles(parseFiles(e.dataTransfer.files));
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 mb-3">
        <div className="text-xs font-semibold uppercase tracking-widest" style={{ color }}>{label}</div>
        {fromWorkspace && items.length > 0 && (
          <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: accent, color, border: `0.5px solid ${color}`, fontSize: 9 }}>
            From Workspace
          </span>
        )}
      </div>

      {items.length === 0 ? (
        /* Empty drop zone */
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
            <div className="text-xs text-gray-400">Modules</div>
          </div>
          <div className="flex gap-2">
            <input ref={fileRef} type="file" multiple className="hidden" onChange={e => e.target.files && onFiles(parseFiles(e.target.files))} />
            <input ref={folderRef} type="file" multiple className="hidden" {...{ webkitdirectory: 'true' } as any} onChange={e => e.target.files && onFiles(parseFiles(e.target.files))} />
            <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg font-semibold transition-opacity hover:opacity-80" style={{ background: accent, color, border: `0.5px solid ${color}` }}>
              <FileText size={12} /> Upload File
            </button>
            <button onClick={() => folderRef.current?.click()} className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg font-semibold transition-opacity hover:opacity-80" style={{ background: accent, color, border: `0.5px solid ${color}` }}>
              <FolderOpen size={12} /> Upload Folder
            </button>
          </div>
        </div>
      ) : (
        /* Files loaded */
        <div className="flex-1 rounded-2xl overflow-hidden flex flex-col" style={{ border: `1.5px solid ${color}`, background: '#FAFAF8', maxHeight: 400, display: 'flex' }}>
          <div className="flex items-center justify-between px-3 py-2" style={{ background: accent, borderBottom: `0.5px solid ${color}` }}>
            <div className="flex items-center gap-2">
              <CheckSquare size={13} style={{ color }} />
              <span className="text-xs font-semibold" style={{ color }}>{items.length} item{items.length > 1 ? 's' : ''} ready</span>
            </div>
            <button onClick={onClear} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={13} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {items.map((item, i) => <FileTreeItem key={i} item={item} />)}
          </div>
          {/* Allow replacing even pre-loaded workspace files */}
          <div className="px-3 py-2 flex gap-2" style={{ borderTop: `0.5px solid ${color}20` }}>
            <input ref={fileRef} type="file" multiple className="hidden" onChange={e => e.target.files && onFiles(parseFiles(e.target.files))} />
            <input ref={folderRef} type="file" multiple className="hidden" {...{ webkitdirectory: 'true' } as any} onChange={e => e.target.files && onFiles(parseFiles(e.target.files))} />
            <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1 text-xs px-2 py-1 rounded font-medium opacity-60 hover:opacity-100" style={{ color }}>
              <FileText size={10} /> Replace File
            </button>
            <button onClick={() => folderRef.current?.click()} className="flex items-center gap-1 text-xs px-2 py-1 rounded font-medium opacity-60 hover:opacity-100" style={{ color }}>
              <FolderOpen size={10} /> Replace Folder
            </button>
          </div>
        </div>
      )}
      <div className="mt-2 text-xs text-gray-400 text-center">{sublabel}</div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CompletenessPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  // Read pre-loaded files from workspace navigation state
  const state = (location.state as any) ?? {};

  // Recursively convert file tree structure
  const convertFileTree = (nodes: any[]): UploadedItem[] => {
    return (nodes ?? []).map((n: any) => ({
      name: n.name,
      type: n.type,
      children: convertFileTree(n.children),
    }));
  };

  const workspaceFiles: UploadedItem[] = convertFileTree(state.oldFiles);
  const fromWorkspace = workspaceFiles.length > 0;

  const [oldItems, setOldItems] = useState<UploadedItem[]>(workspaceFiles);
  const [newItems, setNewItems] = useState<UploadedItem[]>([]);
  const [oldFromWorkspace, setOldFromWorkspace] = useState(fromWorkspace);
  const [processed, setProcessed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [leftPanelWidth, setLeftPanelWidth] = useState(300);
  const [rightPanelWidth, setRightPanelWidth] = useState(340);
  const MIN = 200, MAX = 500;



  const handleRun = () => {
    if (!oldItems.length || !newItems.length) return;
    setLoading(true);
    setTimeout(() => { setLoading(false); setProcessed(true); }, 2200);
    /* API: POST /api/completeness  Body: FormData { oldFiles, newFiles } */
  };

  const filteredMissing: MissingField[] = activeFolder
    ? ([] as MissingField[]).filter(f => f.source === activeFolder)
    : [];

  return (
    <div style={{ height: '100dvh', overflow: 'hidden', background: '#F5F3F0', display: 'flex', flexDirection: 'column' }}>

      {!processed ? (
        /* ── Upload Page ── */
        <div className="flex-1 overflow-y-auto px-8 py-8">
          <div className="max-w-4xl mx-auto">
            <button onClick={() => navigate('/workspace')} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 px-2 py-1 rounded hover:bg-gray-100 mb-4"><ArrowLeft size={13} /> Back</button>
            <h2 className="text-lg font-bold text-gray-800 mb-1">Compare Document Versions</h2>
            <p className="text-sm text-gray-500 mb-8">
              Upload old and new versions of your filing — individual files or entire folder structures — to check completeness across all modules, flag missing fields, and highlight substantive changes.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, alignItems: 'start' }}>
              <UploadZone
                label="Old Version"
                sublabel={oldFromWorkspace ? 'Pre-loaded from your workspace' : 'Upload old document or folder structure'}
                color="#993C1D"
                accent="#FAECE7"
                items={oldItems}
                onFiles={(items) => { setOldItems(items); setOldFromWorkspace(false); }}
                onClear={() => { setOldItems([]); setOldFromWorkspace(false); }}
                fromWorkspace={oldFromWorkspace}
              />
              <UploadZone
                label="New Version"
                sublabel="Upload new document or folder structure"
                color="#0F6E56"
                accent="#E1F5EE"
                items={newItems}
                onFiles={setNewItems}
                onClear={() => setNewItems([])}
              />
            </div>

            <div className="flex justify-center mt-8">
              <button
                onClick={handleRun}
                disabled={!oldItems.length || !newItems.length || loading}
                className="flex items-center gap-2 px-8 py-3 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-40"
                style={{ background: '#185FA5' }}
              >
                {loading
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Analysing across modules…</>
                  : <>Run Completeness Check <ArrowRight size={14} /></>}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {processed && (() => {
        const leftPanel = (<aside className="flex flex-col bg-white overflow-hidden h-full" style={{ borderRight: '0.5px solid #e0ddd6' }}>
            <div className="px-3 py-2.5" style={{ borderBottom: '0.5px solid #e0ddd6' }}>
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Completeness Scores</span>
            </div>
            <div className="p-4 flex justify-around" style={{ borderBottom: '0.5px solid #e0ddd6' }}>
              <ScoreRing score={0} label="Old Version" color="#993C1D" />
              <div className="flex items-center text-gray-300 text-2xl">→</div>
              <ScoreRing score={0} label="New Version" color="#185FA5" />
            </div>

            <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-400" style={{ borderBottom: '0.5px solid #e0ddd6' }}>Module Breakdown</div>
            <div className="px-3 py-2 space-y-1.5" style={{ borderBottom: '0.5px solid #e0ddd6' }}>
              {([] as FolderScore[]).map((fs, i) => {
                const isActive = activeFolder === fs.name;
                const barColor = fs.score >= 85 ? '#0F6E56' : fs.score >= 65 ? '#185FA5' : '#993C1D';
                return (
                  <button key={i} onClick={() => setActiveFolder(isActive ? null : fs.name)}
                    className="w-full text-left rounded-lg p-2 transition-all"
                    style={{ background: isActive ? '#E6F1FB' : 'transparent', border: `0.5px solid ${isActive ? '#185FA5' : 'transparent'}` }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-600 truncate">{fs.name}</span>
                      <span className="text-xs font-semibold ml-2 shrink-0" style={{ color: barColor }}>{fs.score}%</span>
                    </div>
                    <div className="h-1.5 rounded-full" style={{ background: '#f0ede8' }}>
                      <div className="h-full rounded-full" style={{ width: `${fs.score}%`, background: barColor }} />
                    </div>
                    {fs.missing > 0 && (
                      <div className="flex items-center gap-1 mt-1">
                        <AlertCircle size={9} style={{ color: '#993C1D' }} />
                        <span className="text-xs" style={{ color: '#993C1D' }}>{fs.missing} missing</span>
                      </div>
                    )}
                  </button>
                );
              })}
              {activeFolder && <button onClick={() => setActiveFolder(null)} className="w-full text-xs text-gray-400 hover:text-gray-600 py-1 text-center">✕ Clear filter</button>}
            </div>

            <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-2" style={{ borderBottom: '0.5px solid #e0ddd6' }}>
              <span>Missing Fields</span>
              {activeFolder && <span className="text-blue-400 font-normal normal-case truncate" style={{ fontSize: 10 }}>{activeFolder}</span>}
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {filteredMissing.map((f, i) => {
                const s = MISS_STYLE[f.severity];
                return (
                  <div key={i} className="flex items-start gap-2 rounded-lg px-2.5 py-2 text-xs" style={{ background: s.bg, border: `0.5px solid ${s.border}`, color: s.text }}>
                    <span>✗</span>
                    <div>
                      <div className="font-semibold capitalize mb-0.5">{f.severity}</div>
                      <div>{f.field}</div>
                      {f.source && <div className="opacity-70 mt-0.5" style={{ fontSize: 10 }}>{f.source}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>);
        const middlePanel = (<main className="flex flex-col bg-white flex-1 overflow-hidden h-full" style={{ minWidth: 0 }}>
            <div className="px-4 py-2.5" style={{ borderBottom: '0.5px solid #e0ddd6', flexShrink: 0 }}>
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Document Changes</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {([] as Change[]).map((c, i) => {
                const s = CHANGE_STYLE[c.type];
                return (
                  <div key={i} className="rounded-xl overflow-hidden" style={{ border: `0.5px solid ${s.border}` }}>
                    <div className="flex items-center justify-between px-3 py-2" style={{ background: s.bg }}>
                      <span className="text-xs font-semibold" style={{ color: s.text }}>{c.section}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: s.border, color: '#fff' }}>{s.badge}</span>
                    </div>
                    <div className="grid grid-cols-2 divide-x text-xs" style={{ borderTop: `0.5px solid ${s.border}` }}>
                      <div className="p-3"><div className="font-medium text-gray-400 mb-1 uppercase tracking-wide" style={{ fontSize: 10 }}>Old</div><div className="text-gray-600">{c.oldValue}</div></div>
                      <div className="p-3"><div className="font-medium text-gray-400 mb-1 uppercase tracking-wide" style={{ fontSize: 10 }}>New</div><div style={{ color: s.text, fontWeight: 500 }}>{c.newValue}</div></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </main>);
        const rightPanel = (<aside className="flex flex-col bg-white overflow-hidden h-full" style={{ borderLeft: '0.5px solid #e0ddd6' }}>
            <div className="px-3 py-2.5" style={{ borderBottom: '0.5px solid #e0ddd6' }}>
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Inconsistencies</span>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {([] as { field: string; values: string[]; severity: 'amber' | 'gray' }[]).map((inc, i) => (
                <div key={i} className="rounded-xl p-3 text-xs"
                  style={inc.severity === 'amber' ? { background: '#FAEEDA', border: '0.5px solid #854F0B' } : { background: '#F1EFE8', border: '0.5px solid #888' }}>
                  <div className="font-semibold mb-2" style={{ color: inc.severity === 'amber' ? '#633806' : '#444' }}>{inc.field}</div>
                  <div className="flex flex-col gap-1">
                    {inc.values.map((v, vi) => (
                      <span key={vi} className="px-2 py-1 rounded" style={{ background: 'rgba(0,0,0,0.06)', color: inc.severity === 'amber' ? '#633806' : '#444', fontSize: 11 }}>
                        {vi === 0 ? '📄 Old: ' : '📄 New: '}{v}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="p-3" style={{ borderTop: '0.5px solid #e0ddd6' }}>
              <button className="w-full py-2 rounded-lg text-xs font-semibold text-white" style={{ background: '#185FA5' }}>
                ↓ Export Comparison Report
              </button>
            </div>
          </aside>);
        return (
          <ResponsivePage
            topBar={<TopBarSimple user={user} onLogout={() => { logout(); navigate('/login'); }} />}
            subHeader={<div className="flex items-center gap-3 px-4 py-2.5 bg-white" style={{ borderBottom: '0.5px solid #e0ddd6', flexShrink: 0, flexWrap: 'wrap' }}>
              <button onClick={() => navigate('/workspace')} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 px-2 py-1 rounded hover:bg-gray-100"><ArrowLeft size={13} /> Back</button>
              <div style={{ width: 1, height: 16, background: '#e0ddd6' }} />
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: '#E6F1FB', border: '0.5px solid #185FA5' }}><CheckSquare size={12} style={{ color: '#185FA5' }} /></div>
                <span className="text-sm font-semibold text-gray-800">Completeness Check</span>
              </div>
              {processed && <button onClick={() => { setProcessed(false); setNewItems([]); setActiveFolder(null); }} className="ml-auto text-xs px-3 py-1.5 rounded-md" style={{ background: '#F1EFE8', color: '#666', border: '0.5px solid #d0cec8' }}>Compare other Files</button>}
            </div>}
            leftPanel={leftPanel}
            middlePanel={middlePanel}
            rightPanel={rightPanel}
            processed={true}
            leftLabel="Scores"
            middleLabel="Changes"
            rightLabel="Issues"
            leftPanelWidth={leftPanelWidth}
            rightPanelWidth={rightPanelWidth}
            onLeftDrag={(d) => setLeftPanelWidth(p => Math.max(MIN, Math.min(MAX, p + d)))}
            onRightDrag={(d) => setRightPanelWidth(p => Math.max(MIN, Math.min(MAX, p - d)))}
          />
        );
      })()}
    </div>
  );
}
