import { useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, AlertCircle, Folder, ChevronDown, ChevronRight, FileText, Table, AlignLeft, Music, File } from 'lucide-react';
import type { FileNode } from '../../../types';
import { useAuth } from '../../../contexts/AuthContext';
import TopBarSimple from '../../../components/TopBarSimple';
import DraggableDivider from '../../../components/layout/DraggableDivider';


function getFileIcon(ext: string) {
  switch (ext) {
    case 'pdf': return <FileText size={13} className="text-red-500 shrink-0" />;
    case 'docx':
    case 'doc': return <FileText size={13} className="text-blue-500 shrink-0" />;
    case 'xlsx':
    case 'xls':
    case 'csv': return <Table size={13} className="text-green-600 shrink-0" />;
    case 'txt': return <AlignLeft size={13} className="text-gray-500 shrink-0" />;
    case 'mp3':
    case 'wav':
    case 'm4a': return <Music size={13} className="text-purple-500 shrink-0" />;
    default: return <File size={13} className="text-gray-400 shrink-0" />;
  }
}

function getBadge(ext: string) {
  const badges: Record<string, { bg: string; text: string }> = {
    pdf: { bg: '#FAECE7', text: '#712B13' },
    docx: { bg: '#E6F1FB', text: '#0C447C' },
    doc: { bg: '#E6F1FB', text: '#0C447C' },
    xlsx: { bg: '#E1F5EE', text: '#085041' },
    xls: { bg: '#E1F5EE', text: '#085041' },
    txt: { bg: '#F1EFE8', text: '#444441' },
    mp3: { bg: '#EEEDFE', text: '#3C3489' },
    wav: { bg: '#EEEDFE', text: '#3C3489' },
  };
  const style = badges[ext] ?? { bg: '#F1EFE8', text: '#444441' };
  return (
    <span className="text-xs px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wide" style={{ background: style.bg, color: style.text, fontSize: '10px' }}>
      {ext || 'FILE'}
    </span>
  );
}

function FileTreeItem({ node, depth = 0 }: { node: FileNode; depth?: number }) {
  const [expanded, setExpanded] = useState(true);

  if (node.type === 'folder') {
    const hasChildren = node.children && node.children.length > 0;
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 w-full text-left px-2 py-1 rounded hover:bg-gray-50 text-gray-700 font-medium"
          style={{ paddingLeft: `${8 + depth * 12}px` }}
        >
          {expanded ? <ChevronDown size={12} className="text-gray-400 shrink-0" /> : <ChevronRight size={12} className="text-gray-400 shrink-0" />}
          <Folder size={13} className="text-amber-500 shrink-0" />
          <span className="truncate text-xs">{node.name}</span>
        </button>
        {expanded && hasChildren && node.children.map(child => (
          <FileTreeItem key={child.path} node={child} depth={depth + 1} />
        ))}
      </div>
    );
  }

  return (
    <button
      onClick={() => {}}
      className="flex items-center gap-1.5 w-full text-left px-2 py-1.5 rounded text-gray-700 transition-colors hover:bg-gray-50"
      style={{
        paddingLeft: `${8 + depth * 12}px`,
      }}
    >
      {getFileIcon(node.extension)}
      <span className="truncate text-xs flex-1 min-w-0">{node.name}</span>
      {getBadge(node.extension)}
    </button>
  );
}

function ConsistencyCheckPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const location = useLocation();
  const [leftWidth, setLeftWidth] = useState(280);
  const [selectedFolder, setSelectedFolder] = useState<FileNode | null>(null);

  const state = (location.state as any) ?? {};
  const allFolders: FileNode[] = state.allFolders || [];

  // Use allFolders directly as the parent folders
  const parentFolders = useMemo(() => {
    return allFolders;
  }, [allFolders]);

  // Set first folder as selected by default
  useMemo(() => {
    if (parentFolders.length > 0 && !selectedFolder) {
      setSelectedFolder(parentFolders[0]);
    }
  }, [parentFolders, selectedFolder]);

  return (
    <div className="flex flex-col h-screen bg-white overflow-hidden">
      {/* Header */}
      <div className="bg-white" style={{ borderBottom: '0.5px solid #e0ddd6', flexShrink: 0 }}>
        <TopBarSimple user={user} onLogout={() => { logout(); navigate('/login'); }} />
        <div className="flex items-center gap-3 px-4 py-2.5" style={{ borderBottom: '0.5px solid #e0ddd6' }}>
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 px-2 py-1 rounded hover:bg-gray-100"
          >
            <ArrowLeft size={13} /> Back
          </button>
          <div style={{ width: 1, height: 16, background: '#e0ddd6' }} />
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: '#FAEEDA', border: '0.5px solid #854F0B' }}>
              <AlertCircle size={12} style={{ color: '#854F0B' }} />
            </div>
            <span className="text-sm font-semibold text-gray-800">Consistency Check</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel - Folder Selection */}
        <aside className="flex flex-col bg-white" style={{ width: leftWidth, borderRight: '0.5px solid #e0ddd6' }}>
          <div className="p-3 space-y-3 overflow-y-auto">
            {/* Select Folder Section */}
            <div>
              <div className="text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">Select Folder</div>
              
              {parentFolders.length === 0 ? (
                <div className="rounded-lg px-3 py-2 text-xs text-gray-400 text-center" style={{ background: '#F8F7F4', border: '0.5px solid #e0ddd6' }}>
                  No folders uploaded
                </div>
              ) : (
                <div className="space-y-1.5 max-h-96 overflow-y-auto scrollbar-thin">
                  {parentFolders.map(folder => (
                    <button
                      key={folder.path}
                      onClick={() => setSelectedFolder(folder)}
                      className="w-full rounded-lg px-3 py-2.5 text-xs flex items-center gap-2 transition-colors text-left"
                      style={{
                        background: selectedFolder?.path === folder.path ? '#E1F5EE' : '#F8F7F4',
                        border: `0.5px solid ${selectedFolder?.path === folder.path ? '#0F6E56' : '#e0ddd6'}`,
                        color: selectedFolder?.path === folder.path ? '#085041' : '#666',
                      }}
                    >
                      <Folder size={12} style={{ flexShrink: 0 }} />
                      <span className="font-medium truncate">{folder.name}</span>
                      {selectedFolder?.path === folder.path && <ChevronRight size={12} style={{ marginLeft: 'auto', flexShrink: 0 }} />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Folder Contents */}
            {selectedFolder && (
              <div>
                <div className="text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">Contents</div>
                <div className="flex items-center gap-2 px-2 py-1.5 mb-2 text-xs font-medium text-white rounded" style={{ background: '#854F0B' }}>
                  <Folder size={12} />
                  <span className="truncate">{selectedFolder.name}</span>
                </div>
                {selectedFolder.children && selectedFolder.children.length > 0 ? (
                  <div className="py-2 px-1">
                    {selectedFolder.children.map(child => (
                      <FileTreeItem key={child.path} node={child} depth={0} />
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-gray-400 px-2 py-2">
                    {selectedFolder.children === undefined
                      ? 'Folder structure is loading...'
                      : 'This folder appears to be empty'}
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>

        <DraggableDivider onDrag={delta => setLeftWidth(Math.max(200, Math.min(500, leftWidth + delta)))} />

        {/* Right Panel - Analysis Results */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl">
            {/* Header */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-1">Consistency Analysis</h2>
              <p className="text-xs text-gray-500">Analyzing consistency across {parentFolders.length} folder{parentFolders.length !== 1 ? 's' : ''}</p>
            </div>

            {/* Score Card */}
            <div className="rounded-lg p-6 mb-6" style={{ background: '#FAEEDA', border: '0.5px solid #854F0B' }}>
              <div className="text-center">
                <div className="text-sm text-gray-600 mb-4">Overall Consistency Score</div>
                <div className="text-5xl font-bold mb-4" style={{ color: '#633806' }}>0%</div>
                <div className="text-xs text-gray-600">Folders: {parentFolders.map(f => f.name).join(', ')}</div>
              </div>
            </div>

            {/* Issues Preview */}
            <div>
              <h3 className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">Issues Overview</h3>
              <div className="space-y-2">
                {([] as { field: string; status: 'consistent' | 'inconsistent' | 'warning'; details: string; affectedFolders?: string[] }[]).slice(0, 3).map((issue, idx) => {
                  const statusColors = {
                    consistent: { bg: '#E1F5EE', border: '#0F6E56', text: '#085041', icon: '✓' },
                    inconsistent: { bg: '#FAECE7', border: '#993C1D', text: '#712B13', icon: '✗' },
                    warning: { bg: '#FAEEDA', border: '#854F0B', text: '#633806', icon: '⚠' },
                  };
                  const s = statusColors[issue.status];
                  return (
                    <div key={idx} className="rounded p-2 text-xs" style={{ background: s.bg, border: `0.5px solid ${s.border}`, color: s.text }}>
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{s.icon}</span>
                        <span className="font-semibold">{issue.field}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {0 > 3 && (
                <p className="text-xs text-gray-500 mt-2">+{0 - 3} more issues</p>
              )}
            </div>

            {/* Run Button */}
            <button
              onClick={() => navigate('/consistency-check-results', { state: { allFolders: parentFolders } })}
              disabled={parentFolders.length === 0}
              className="w-full mt-6 py-2.5 rounded-lg font-semibold transition-all text-xs text-white flex items-center justify-center gap-1.5"
              style={{
                background: parentFolders.length === 0 ? '#ccc' : '#854F0B',
                cursor: parentFolders.length === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              View Full Consistency Report
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}

export default ConsistencyCheckPage;
