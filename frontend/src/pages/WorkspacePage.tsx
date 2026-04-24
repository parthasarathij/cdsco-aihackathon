import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { UploadCloud, FolderOpen, LogOut, Shield, FileText, CheckSquare, Tag, ChevronRight, X, Layers, PanelLeft, Cpu, ArrowLeft, RefreshCw } from 'lucide-react';
import type { FileNode, FeatureId } from '../types';
import FileTreeNode from '../components/filetree/FileTreeNode';
import DraggableDivider from '../components/layout/DraggableDivider';
import MiddlePanel from '../components/layout/MiddlePanel';
import { useAuth } from '../contexts/AuthContext';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { Drawer } from '../components/layout/ResponsiveShell';
import AnonymisationFeature from '../components/features/AnonymisationFeature';
import SummarisationFeature from '../components/features/SummarisationFeature';
import CompletenessFeature from '../components/features/CompletenessFeature';
import ClassificationFeature from '../components/features/ClassificationFeature';
import CompletenessVersionsMenu from '../components/features/CompletenessVersionsMenu';
import { fetchWorkspaceTree, uploadFolderToBackend, uploadZipToBackend, clearWorkspace } from '../api/workspaceClient';

const FEATURES = [
  { id: 'anonymisation' as FeatureId, label: 'Anonymisation', abbr: 'AN', icon: Shield, bg: '#FAECE7', border: '#993C1D', color: '#712B13', description: 'Detect & pseudonymise PII entities.' },
  { id: 'summarisation' as FeatureId, label: 'Summarisation', abbr: 'SU', icon: FileText, bg: '#E1F5EE', border: '#0F6E56', color: '#085041', description: 'Extract structured case summary.' },
  { id: 'completeness' as FeatureId, label: 'Completeness Check, Consistency Check and Version Check', abbr: 'CK', icon: CheckSquare, bg: '#E6F1FB', border: '#185FA5', color: '#0C447C', description: 'Verify fields & compare versions.' },
  { id: 'classification' as FeatureId, label: 'Classification', abbr: 'CL', icon: Tag, bg: '#FAEEDA', border: '#854F0B', color: '#633806', description: 'Classify severity & detect duplicates.' },
];

function extractFolderName(path?: string): string {
  if (!path) return '';
  const parts = path.split('/').map((segment) => segment.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

function countFiles(nodes: FileNode[]): number { return nodes.reduce((acc, n) => acc + (n.type === 'file' ? 1 : countFiles(n.children)), 0); }
function findFileByPath(files: FileNode[], path: string): FileNode | null {
  for (const file of files) { if (file.path === path) return file; if (file.type === 'folder' && file.children) { const found = findFileByPath(file.children, path); if (found) return found; } } return null;
}
function normalizeSourceFileName(value: string): string {
  return value
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    ?.replace(/\s*\(page\s*\d+\)\s*$/i, '')
    .trim()
    .toLowerCase() || '';
}
function toCanonicalName(value: string): string {
  return normalizeSourceFileName(value).replace(/[^a-z0-9]/g, '');
}
function getStem(value: string): string {
  return normalizeSourceFileName(value).replace(/\.[a-z0-9]+$/i, '');
}
function matchScore(nodeName: string, sourceName: string): number {
  const nodeNorm = normalizeSourceFileName(nodeName);
  const sourceNorm = normalizeSourceFileName(sourceName);
  if (!nodeNorm || !sourceNorm) return -1;
  if (nodeNorm === sourceNorm) return 100;

  const nodeStem = getStem(nodeNorm);
  const sourceStem = getStem(sourceNorm);
  if (nodeStem === sourceStem) return 95;

  const nodeCanon = toCanonicalName(nodeNorm);
  const sourceCanon = toCanonicalName(sourceNorm);
  if (nodeCanon === sourceCanon) return 90;
  if (nodeCanon.includes(sourceCanon) || sourceCanon.includes(nodeCanon)) return 80;

  const nodeTokens = new Set(nodeStem.split(/[^a-z0-9]+/).filter(Boolean));
  const sourceTokens = sourceStem.split(/[^a-z0-9]+/).filter(Boolean);
  if (!nodeTokens.size || !sourceTokens.length) return -1;
  const overlap = sourceTokens.filter((t) => nodeTokens.has(t)).length;
  return overlap > 0 ? overlap : -1;
}
function findFileByName(files: FileNode[], targetName: string): FileNode | null {
  if (!targetName?.trim()) return null;
  const queue: FileNode[] = [...files];
  let best: { node: FileNode; score: number } | null = null;
  while (queue.length) {
    const node = queue.shift()!;
    if (node.type === 'file') {
      const score = matchScore(node.name, targetName);
      if (score > 0 && (!best || score > best.score)) {
        best = { node, score };
      }
    }
    if (node.children?.length) queue.push(...node.children);
  }
  return best?.node || null;
}
function serializeFileTree(nodes: FileNode[]): Array<{ name: string; path: string; type: string; children: any }> { return nodes.map(n => ({ name: n.name, path: n.path, type: n.type, children: serializeFileTree(n.children) })); }

function markBlobPaths(nodes: FileNode[]): FileNode[] {
  return nodes.map((node) =>
    node.type === 'folder'
      ? { ...node, blobPath: '', children: markBlobPaths(node.children), file: null }
      : { ...node, blobPath: node.blobPath || node.path, children: [], file: null },
  );
}

function ActiveFeaturePanel({ featureId, selectedFile, workspaceFiles, onClearSelectedFile, completenessSubFeature, onSelectCompletenessSubFeature, onSelectConsistencyCheck, files, onFocusSummarySource }: { featureId: FeatureId; selectedFile: FileNode | null; workspaceFiles?: ReturnType<typeof serializeFileTree>; onClearSelectedFile?: () => void; completenessSubFeature?: 'menu' | 'completeness-check' | 'consistency-check' | 'versions-check'; onSelectCompletenessSubFeature?: (type: 'completeness-check' | 'versions-check') => void; onSelectConsistencyCheck?: () => void; files?: FileNode[]; onFocusSummarySource?: (source: { file: string; page?: number }) => void; }) {
  switch (featureId) {
    case 'anonymisation': return <AnonymisationFeature selectedFile={selectedFile} onClearSelectedFile={onClearSelectedFile} />;
    case 'summarisation': return <SummarisationFeature selectedFile={selectedFile} onClearSelectedFile={onClearSelectedFile} onFocusSource={onFocusSummarySource} />;
    case 'completeness':
      if (completenessSubFeature === 'menu') {
        return <CompletenessVersionsMenu onSelectCompletenessCheck={() => onSelectCompletenessSubFeature?.('completeness-check')} onSelectConsistencyCheck={onSelectConsistencyCheck ?? (() => {})} onSelectVersionsCheck={() => onSelectCompletenessSubFeature?.('versions-check')} />;
      }
      return <CompletenessFeature selectedFile={selectedFile} onClearSelectedFile={onClearSelectedFile} completenessSubFeature={completenessSubFeature} allFiles={files || []} />;
    case 'classification': return <ClassificationFeature selectedFile={selectedFile} workspaceFiles={workspaceFiles} onClearSelectedFile={onClearSelectedFile} />;
    default: return null;
  }
}

function FeatureMenu({ selectedFile, onSelect }: { selectedFile: FileNode | null; onSelect: (id: FeatureId) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {FEATURES.map(f => { const Icon = f.icon; return (
          <button key={f.id} onClick={() => onSelect(f.id)} style={{ width: '100%', textAlign: 'left', borderRadius: 12, padding: 12, marginBottom: 6, background: '#FAFAF8', border: '0.5px solid #e0ddd6', cursor: 'pointer', display: 'block' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: f.bg, border: `0.5px solid ${f.border}` }}><Icon size={15} style={{ color: f.color }} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#1F2937', marginBottom: 2 }}>{f.label}</div>
                <div style={{ fontSize: 11, color: '#9CA3AF', lineHeight: 1.5 }}>{f.description}</div>
              </div>
              <ChevronRight size={13} style={{ color: '#D1D5DB', flexShrink: 0, marginTop: 2 }} />
            </div>
          </button>
        ); })}
      </div>
      {!selectedFile && <div style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, color: '#9CA3AF', borderTop: '0.5px solid #e0ddd6' }}>Select a file to begin</div>}
    </div>
  );
}

function FileTreeContent({ files, selectedFile, expandedFolders, onFilesLoaded, onToggleFolder, onSelectFile, onClear, uploading, syncing, onRefresh }: { files: FileNode[]; selectedFile: FileNode | null; expandedFolders: Record<string, boolean>; onFilesLoaded: (e: React.ChangeEvent<HTMLInputElement>) => void; onToggleFolder: (path: string) => void; onSelectFile: (node: FileNode) => void; onClear: () => void; uploading: 'folder' | 'zip' | null; syncing: boolean; onRefresh: () => void; }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const count = countFiles(files);
  
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.setAttribute('webkitdirectory', '');
      inputRef.current.setAttribute('mozdirectory', '');
    }
  }, []);
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderBottom: '0.5px solid #e0ddd6', flexShrink: 0, gap: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Files</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button disabled={syncing || uploading !== null} onClick={onRefresh} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#374151', background: '#F3F4F6', border: '0.5px solid #D1D5DB', borderRadius: 6, padding: '4px 8px', cursor: syncing || uploading ? 'not-allowed' : 'pointer', opacity: syncing || uploading ? 0.6 : 1 }} title="Refresh from Azure Blob"><RefreshCw size={11} className={syncing ? 'animate-spin' : ''} /> Sync</button>
          <button disabled={uploading !== null} onClick={() => inputRef.current?.click()} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#0C447C', background: '#E6F1FB', border: '0.5px solid #185FA5', borderRadius: 6, padding: '4px 8px', cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.6 : 1 }} title="Upload folder"><UploadCloud size={11} /> {uploading === 'folder' ? 'Uploading…' : 'Folder'}</button>
          <button disabled={uploading !== null} onClick={() => zipInputRef.current?.click()} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#633806', background: '#FAEEDA', border: '0.5px solid #854F0B', borderRadius: 6, padding: '4px 8px', cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.6 : 1 }} title="Upload zip file"><UploadCloud size={11} /> {uploading === 'zip' ? 'Uploading…' : 'Zip'}</button>
        </div>
      </div>
      <input ref={inputRef} type="file" multiple style={{ display: 'none' }} onChange={onFilesLoaded} />
      <input ref={zipInputRef} type="file" accept=".zip" style={{ display: 'none' }} onChange={onFilesLoaded} />
      {files.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', borderBottom: '0.5px solid #f0ede8', background: '#FAFAF8', flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: '#9CA3AF' }}>{count} file{count !== 1 ? 's' : ''}</span>
          <button onClick={() => void onClear()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', display: 'flex', opacity: 0.6, transition: 'opacity 0.2s' }} onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')} onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}><X size={11} /></button>
        </div>
      )}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 4px' }}>
        {uploading && (
          <div style={{ margin: '4px 8px 8px', padding: '8px 10px', borderRadius: 8, background: '#EFF6FF', border: '0.5px solid #93C5FD', color: '#1E40AF', fontSize: 11 }}>
            {uploading === 'zip' ? 'Uploading ZIP and extracting in Azure…' : 'Uploading folder …'}
          </div>
        )}
        {syncing && !uploading && (
          <div style={{ margin: '4px 8px 8px', padding: '8px 10px', borderRadius: 8, background: '#F9FAFB', border: '0.5px solid #E5E7EB', color: '#4B5563', fontSize: 11 }}>
            Syncing latest changes...
          </div>
        )}
        {files.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 12 }}>
            <button disabled={uploading !== null} onClick={() => inputRef.current?.click()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, width: '100%', minHeight: 160, borderRadius: 8, border: '2px dashed #E5E7EB', color: '#9CA3AF', background: 'none', cursor: uploading ? 'not-allowed' : 'pointer', padding: 12, opacity: uploading ? 0.6 : 1 }}>
              <FolderOpen size={24} strokeWidth={1.5} />
              <span style={{ fontSize: 11, textAlign: 'center', lineHeight: 1.6 }}>{uploading === 'folder' ? 'Uploading…' : 'Upload'}<br />folder</span>
            </button>
            <button disabled={uploading !== null} onClick={() => zipInputRef.current?.click()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, width: '100%', minHeight: 160, borderRadius: 8, border: '2px dashed #FAEEDA', color: '#854F0B', background: 'none', cursor: uploading ? 'not-allowed' : 'pointer', padding: 12, opacity: uploading ? 0.6 : 1 }}>
              <FolderOpen size={24} strokeWidth={1.5} />
              <span style={{ fontSize: 11, textAlign: 'center', lineHeight: 1.6 }}>{uploading === 'zip' ? 'Uploading…' : 'Upload'}<br />ZIP file</span>
            </button>
          </div>
        ) : files.map(node => <FileTreeNode key={node.path} node={node} depth={0} selectedFile={selectedFile} expandedFolders={expandedFolders} onToggleFolder={onToggleFolder} onSelectFile={onSelectFile} />)}
      </div>
    </div>
  );
}

function MobileBottomNav({ active, onTab }: { active: 'files' | 'doc' | 'features'; onTab: (t: 'files' | 'doc' | 'features') => void }) {
  const tabs = [{ id: 'files' as const, label: 'Files', Icon: PanelLeft }, { id: 'doc' as const, label: 'Document', Icon: Layers }, { id: 'features' as const, label: 'Features', Icon: Cpu }];
  return (
    <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 30, display: 'flex', background: '#fff', borderTop: '0.5px solid #e0ddd6', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {tabs.map(({ id, label, Icon }) => (
        <button key={id} onClick={() => onTab(id)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '8px 0', color: active === id ? '#185FA5' : '#9CA3AF', background: 'none', border: 'none', cursor: 'pointer', borderTop: active === id ? '2px solid #185FA5' : '2px solid transparent' }}>
          <Icon size={18} /><span style={{ fontSize: 10, fontWeight: active === id ? 600 : 400 }}>{label}</span>
        </button>
      ))}
    </nav>
  );
}

export default function WorkspacePage() {
  const { user, logout } = useAuth(); const navigate = useNavigate(); const bp = useBreakpoint();
  const [files, setFiles] = useState<FileNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const [previewTargetPage, setPreviewTargetPage] = useState<number | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [selectedFeature, setSelectedFeature] = useState<FeatureId | null>(null);
  const [uploading, setUploading] = useState<'folder' | 'zip' | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [completenessSubFeature, setCompletenessSubFeature] = useState<'menu' | 'completeness-check' | 'consistency-check' | 'versions-check'>('menu');
  const [featurePanelOpen, setFeaturePanelOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<'files' | 'doc' | 'features'>('doc');
  const [filesDrawerOpen, setFilesDrawerOpen] = useState(false);
  const [featuresDrawerOpen, setFeaturesDrawerOpen] = useState(false);
  const [leftWidth, setLeftWidth] = useState(240); const [rightWidth, setRightWidth] = useState(380); const MIN = 160, MAX = 520;
  const [rootFolder, setRootFolder] = useState<string | null>(null);

  useEffect(() => {
    const exRaw = localStorage.getItem('cdsco_expandedFolders');
    if (exRaw) {
      try {
        setExpandedFolders(JSON.parse(exRaw));
      } catch {
        /* ignore */
      }
    }
    const rootFolderRaw = localStorage.getItem('cdsco_rootFolder');
    if (rootFolderRaw) {
      setRootFolder(rootFolderRaw);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('cdsco_files', JSON.stringify(markBlobPaths(files)));
  }, [files]);

  useEffect(() => {
    if (selectedFile?.path) localStorage.setItem('cdsco_selectedFilePath', selectedFile.path);
    else localStorage.removeItem('cdsco_selectedFilePath');
  }, [selectedFile]);
  useEffect(() => {
    localStorage.setItem('cdsco_expandedFolders', JSON.stringify(expandedFolders));
  }, [expandedFolders]);

  useEffect(() => {
    if (rootFolder) {
      localStorage.setItem('cdsco_rootFolder', rootFolder);
    } else {
      localStorage.removeItem('cdsco_rootFolder');
    }
  }, [rootFolder]);

  const syncFromBlob = useCallback(async (overrideRootFolder?: string) => {
    try {
      setSyncing(true);
      const effectiveRootFolder = overrideRootFolder !== undefined ? overrideRootFolder : rootFolder;
      const payload = await fetchWorkspaceTree(undefined, effectiveRootFolder || undefined);
      const tree = markBlobPaths(payload.tree || []);
      setFiles(tree);
      setExpandedFolders((prev) => {
        const next = { ...prev };
        const expandAll = (nodes: FileNode[]) => {
          nodes.forEach((n) => {
            if (n.type === 'folder') {
              if (prev[n.path] !== false) next[n.path] = true;
              expandAll(n.children);
            }
          });
        };
        expandAll(tree);
        return next;
      });
      setSelectedFile((prev) => {

        const stored = localStorage.getItem('cdsco_selectedFilePath');
        const desiredPath = prev?.path || stored;
        if (!desiredPath) return null;
        const byPath = findFileByPath(tree, desiredPath);
        if (byPath) return byPath;
        return findFileByName(tree, desiredPath);
      });
    } catch {
    } finally {
      setSyncing(false);
    }
  }, [rootFolder]);

  useEffect(() => {
    void syncFromBlob();
    const timer = window.setInterval(() => {
      void syncFromBlob();
    }, 12000);
    return () => window.clearInterval(timer);
  }, [syncFromBlob]);

  const handleFilesLoaded = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fl = e.target.files; if (!fl || fl.length === 0) return;
    const isZipUpload = fl.length === 1 && fl[0].name.endsWith('.zip');

    if (isZipUpload) {
      try {
        setUploading('zip');
        const response = await uploadZipToBackend(fl[0]);
        let folderName = '';
        if (response.rootPath) {
          folderName = extractFolderName(response.rootPath);
          if (folderName) setRootFolder(folderName);
        }
        await syncFromBlob(folderName);
      } catch (err) {
        alert("Something went wrong while uploading your ZIP file. Please try again.");
      } finally {
        setUploading(null);
        e.target.value = '';
      }
      return;
    }

    try {
      setUploading('folder');
      // Pass a no-op progress callback or implement progress UI here if needed
      const response = await uploadFolderToBackend(fl);
      let folderName = '';
      if (response.rootPath) {
        folderName = extractFolderName(response.rootPath);
        if (folderName) setRootFolder(folderName);
      }
      await syncFromBlob(folderName);
    } catch (err) {
      alert("We couldn't upload your folder. Please check your files and try again.");
    } finally {
      setUploading(null);
      e.target.value = '';
    }
  }, [syncFromBlob]);

  const handleToggleFolder = useCallback((path: string) => { setExpandedFolders(prev => ({ ...prev, [path]: !prev[path] })); }, []);
  const handleSelectFile = useCallback((node: FileNode) => { setSelectedFile(node); setPreviewTargetPage(null); setFilesDrawerOpen(false); if (bp === 'mobile') setMobileTab('doc'); }, [bp]);
  const handleClearSelectedFile = () => { setSelectedFile(null); };
  const handleClearFiles = async () => {
    try {
      await clearWorkspace();
    } catch (err) {
      console.error('Error clearing workspace from blob:', err);
      alert("We encountered an issue while clearing the workspace. Please try again.");
    } finally {
      setFiles([]);
      setSelectedFile(null);
      setRootFolder(null);
      localStorage.removeItem('cdsco_files');
      localStorage.removeItem('cdsco_expandedFolders');
      localStorage.removeItem('cdsco_selectedFilePath');
      localStorage.removeItem('cdsco_rootFolder');
    }
  };
  const handleSelectFeature = (id: FeatureId) => {
    setSelectedFeature(id);
    if (id === 'completeness') {
      setCompletenessSubFeature('menu');
    }
    setFeaturePanelOpen(true);
    if (bp === 'mobile') { setMobileTab('features'); setFeaturesDrawerOpen(false); }
    if (bp === 'tablet') setFeaturesDrawerOpen(false);
  };
  const handleSelectCompletenessSubFeature = (type: 'completeness-check' | 'versions-check') => {
    setCompletenessSubFeature(type);
  };

  const handleSelectConsistencyCheck = () => {
    setCompletenessSubFeature('consistency-check');
  };

  const handleCloseFeature = () => { setFeaturePanelOpen(false); setSelectedFeature(null); setCompletenessSubFeature('menu'); };
  const handleFocusSummarySource = useCallback((source: { file: string; page?: number }) => {
    const matched = findFileByName(files, source.file);
    if (!matched) return;
    setSelectedFile(matched);
    setPreviewTargetPage(source.page ?? null);
    if (bp === 'mobile') setMobileTab('doc');
  }, [files, bp]);
  const getInitial = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase();
  const activeFeature = FEATURES.find(f => f.id === selectedFeature);

  const getCompletenessSubFeatureData = (type: 'completeness-check' | 'consistency-check' | 'versions-check' | 'menu') => {
    switch (type) {
      case 'completeness-check': return { title: 'Completeness Check', description: 'Verify missing fields in documents' };
      case 'consistency-check': return { title: 'Consistency Check', description: 'Verify consistency across documents' };
      case 'versions-check': return { title: 'Versions Check', description: 'Compare and analyze document versions' };
      default: return { title: activeFeature?.label || 'AI Features', description: activeFeature?.description || '' };
    }
  };

  const completenessSubFeatureData = selectedFeature === 'completeness' ? getCompletenessSubFeatureData(completenessSubFeature) : { title: activeFeature?.label || 'AI Features', description: activeFeature?.description || '' };
  const activeFeatureLabel = selectedFeature === 'completeness' && completenessSubFeature !== 'menu' ? completenessSubFeatureData.title : activeFeature?.label;
  const activeFeatureDescription = selectedFeature === 'completeness' && completenessSubFeature !== 'menu' ? completenessSubFeatureData.description : activeFeature?.description;

  const ftProps = { files, selectedFile, expandedFolders, onFilesLoaded: handleFilesLoaded, onToggleFolder: handleToggleFolder, onSelectFile: handleSelectFile, onClear: handleClearFiles, uploading, syncing, onRefresh: () => void syncFromBlob() };

  const rightContent = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', borderBottom: '0.5px solid #e0ddd6', flexShrink: 0 }}>
        {featurePanelOpen && activeFeature ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
            <button onClick={handleCloseFeature} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer' }}><ArrowLeft size={12} /> Back</button>
            <div style={{ width: 1, height: 12, background: '#E5E7EB' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 20, height: 20, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, background: activeFeature.border, fontSize: 9 }}>{activeFeature.abbr}</div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{activeFeatureLabel}</div>
                {activeFeatureDescription && <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>{activeFeatureDescription}</div>}
              </div>
            </div>
          </div>
        ) : <span style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em' }}>AI Features</span>}
      </div>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {featurePanelOpen && selectedFeature
          ? <ActiveFeaturePanel featureId={selectedFeature} selectedFile={selectedFile} workspaceFiles={serializeFileTree(files)} onClearSelectedFile={handleClearSelectedFile} completenessSubFeature={completenessSubFeature} onSelectCompletenessSubFeature={handleSelectCompletenessSubFeature} onSelectConsistencyCheck={handleSelectConsistencyCheck} files={files} onFocusSummarySource={handleFocusSummarySource} />
          : <FeatureMenu selectedFile={selectedFile} onSelect={handleSelectFeature} />}
      </div>
    </div>
  );

  if (bp === 'mobile') return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: '#F5F3F0', overflow: 'hidden' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: '#fff', borderBottom: '0.5px solid #e0ddd6', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 22, height: 22, borderRadius: 5, background: '#185FA5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 700 }}>C</div>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#1F2937' }}>CDSCO Review</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => navigate('/')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', display: 'flex' }}
            title="Exit to landing"
          >
            <LogOut size={16} style={{ transform: 'scaleX(-1)' }} />
          </button>
          <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#E6F1FB', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0C447C', fontSize: 11, fontWeight: 700 }}>{user ? getInitial(user.name) : 'G'}</div>
          {user && <button onClick={() => { logout(); navigate('/login'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', display: 'flex' }}><LogOut size={14} /></button>}
        </div>
      </header>
      <div style={{ flex: 1, overflow: 'hidden', paddingBottom: 56 }}>
        {mobileTab === 'doc' && <MiddlePanel selectedFile={selectedFile} targetPage={previewTargetPage} />}
        {mobileTab === 'features' && <div style={{ height: '100%', overflow: 'hidden', background: '#fff', display: 'flex', flexDirection: 'column' }}>{rightContent}</div>}
        {mobileTab === 'files' && <div style={{ height: '100%', overflow: 'hidden', background: '#fff', display: 'flex', flexDirection: 'column' }}><FileTreeContent {...ftProps} /></div>}
      </div>
      <Drawer open={filesDrawerOpen} onClose={() => setFilesDrawerOpen(false)} title="Files" side="left"><FileTreeContent {...ftProps} /></Drawer>
      <MobileBottomNav active={mobileTab} onTab={setMobileTab} />
    </div>
  );

  if (bp === 'tablet') return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: '#F5F3F0', overflow: 'hidden' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: '#fff', borderBottom: '0.5px solid #e0ddd6', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 24, height: 24, borderRadius: 6, background: '#185FA5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700 }}>C</div>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#1F2937' }}>CDSCO Regulatory Review</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setFeaturesDrawerOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#0C447C', background: '#E6F1FB', border: '0.5px solid #185FA5', borderRadius: 8, padding: '5px 12px', cursor: 'pointer' }}><Cpu size={13} /> AI Features</button>
          <button
            onClick={() => navigate('/')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', display: 'flex' }}
            title="Exit to landing"
          >
            <LogOut size={16} style={{ transform: 'scaleX(-1)' }} />
          </button>
          <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#E6F1FB', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0C447C', fontSize: 11, fontWeight: 700 }}>{user ? getInitial(user.name) : 'G'}</div>
          {user && <button onClick={() => { logout(); navigate('/login'); }} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#9CA3AF', background: 'none', border: 'none', cursor: 'pointer' }}><LogOut size={14} /> Logout</button>}
        </div>
      </header>
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <aside style={{ width: 220, flexShrink: 0, background: '#fff', borderRight: '0.5px solid #e0ddd6', display: 'flex', flexDirection: 'column' }}><FileTreeContent {...ftProps} /></aside>
        <MiddlePanel selectedFile={selectedFile} targetPage={previewTargetPage} />
      </div>
      <Drawer open={featuresDrawerOpen} onClose={() => setFeaturesDrawerOpen(false)} title={featurePanelOpen && activeFeature ? activeFeature.label : 'AI Features'} side="right">{rightContent}</Drawer>
    </div>
  );

  return (
    <div className="flex flex-col" style={{ height: '100vh', overflow: 'hidden', background: '#F5F3F0' }}>
      <header className="flex items-center justify-between px-4 py-2.5 bg-white" style={{ borderBottom: '0.5px solid #e0ddd6', flexShrink: 0 }}>
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded flex items-center justify-center text-white text-xs font-bold" style={{ background: '#185FA5' }}>C</div>
          <span className="font-semibold text-sm text-gray-800 tracking-tight">CDSCO Regulatory Review Platform</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="flex items-center text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100 p-1"
            title="Exit to landing"
          >
            <LogOut size={16} style={{ transform: 'scaleX(-1)' }} />
          </button>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 text-xs font-bold">{user ? getInitial(user.name) : 'G'}</div>
            <span>Reviewer: {user?.name ?? 'Dr. Ganesh'}</span>
          </div>
          {user && <button onClick={() => { logout(); navigate('/login'); }} className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 rounded hover:bg-gray-100"><LogOut size={13} /> Logout</button>}
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <aside className="flex flex-col bg-white" style={{ width: leftWidth, flexShrink: 0, borderRight: '0.5px solid #e0ddd6' }}><FileTreeContent {...ftProps} /></aside>
        <DraggableDivider onDrag={(d) => setLeftWidth(p => Math.max(MIN, Math.min(MAX, p + d)))} />
        <MiddlePanel selectedFile={selectedFile} targetPage={previewTargetPage} />
        <DraggableDivider onDrag={(d) => setRightWidth(p => Math.max(MIN, Math.min(MAX, p - d)))} />
        <aside className="flex flex-col bg-white" style={{ width: rightWidth, flexShrink: 0, borderLeft: '0.5px solid #e0ddd6' }}>{rightContent}</aside>
      </div>
    </div>
  );
}
