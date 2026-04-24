import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, CheckSquare, Folder, FileText, ChevronDown, ChevronRight, Table, AlignLeft, Music, File as FileIcon, Play } from 'lucide-react';
import type { FileNode } from '../../../types';
import { useAuth } from '../../../contexts/AuthContext';
import TopBarSimple from '../../../components/TopBarSimple';
import DraggableDivider from '../../../components/layout/DraggableDivider';
import { createZipFromBlob, runCompletenessCheck, type CompletenessItemRow } from '../api/client';

interface CompletenessPageState {
  selectedFolder?: FileNode | null;
  parentFolder?: FileNode | null;
  allFiles?: FileNode[];
}

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
    default: return <FileIcon size={13} className="text-gray-400 shrink-0" />;
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
  const [expanded, setExpanded] = useState(true); // Start expanded by default

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

export default function CompletenessCheckPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const state = (location.state as CompletenessPageState | null) ?? {};
  // Support both old format (parentFolder) and new format (selectedFolder)
  const initialFolder: FileNode | null = state.selectedFolder || state.parentFolder || null;
  const allFiles: FileNode[] = useMemo(() => state.allFiles ?? [], [state.allFiles]);
  const [leftPanelWidth, setLeftPanelWidth] = useState(280);
  const [selectedFolder, setSelectedFolder] = useState<FileNode | null>(initialFolder);
  const [isAllModulesSelected, setIsAllModulesSelected] = useState(false);
  const [showFolderDropdown, setShowFolderDropdown] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<CompletenessItemRow[]>([]);
  const MIN = 200, MAX = 500;

  const folderName = isAllModulesSelected ? 'All Modules' : (selectedFolder?.name || 'Folder');

  const findFolderByPath = (nodes: FileNode[], path: string): FileNode | null => {
    for (const node of nodes) {
      if (node.path === path) return node;
      if (node.type === 'folder' && node.children) {
        const found = findFolderByPath(node.children, path);
        if (found) return found;
      }
    }
    return null;
  };

  // Get all parent folders (root level only from allFiles)
  const parentFolders = useMemo(() => allFiles.filter(node => node.type === 'folder'), [allFiles]);

  const allFolders = useMemo(() => {
    const collected: FileNode[] = [];
    const walk = (nodes: FileNode[]) => {
      for (const node of nodes) {
        if (node.type !== 'folder') continue;
        collected.push(node);
        if (node.children?.length) walk(node.children);
      }
    };
    walk(allFiles);
    return collected;
  }, [allFiles]);

  const moduleFolders = useMemo(
    () => allFolders.filter((folder) => /^m[1-5]$|^module[\s_-]*[1-5]$/i.test(folder.name.trim())),
    [allFolders]
  );

  useEffect(() => {
    if (!selectedFolder && parentFolders.length > 0) {
      setSelectedFolder(parentFolders[0]);
    }
  }, [parentFolders, selectedFolder]);

  // If selectedFolder is provided, use it directly; otherwise reconstruct from parentFolder
  const completeFolder = useMemo(() => {
    if (!selectedFolder) return null;
    
    // If folder already has children, use it as is
    if (selectedFolder.children && selectedFolder.children.length > 0) {
      return selectedFolder;
    }
    
    const found = findFolderByPath(allFiles, selectedFolder.path);
    if (found && found.children && found.children.length > 0) {
      return found;
    }
    
    // If still no children, ensure it's at least a valid folder with empty children array
    return selectedFolder.children ? selectedFolder : { ...selectedFolder, children: [] };
  }, [selectedFolder, allFiles]);

  const collectFileNodes = (node: FileNode): Array<{ node: FileNode; zipPath: string }> => {
    const output: Array<{ node: FileNode; zipPath: string }> = [];
    const walk = (current: FileNode, relBase: string) => {
      if (current.type === 'file') {
        output.push({ node: current, zipPath: relBase });
        return;
      }
      for (const child of current.children || []) {
        const next = relBase ? `${relBase}/${child.name}` : child.name;
        walk(child, next);
      }
    };
    walk(node, '');
    return output;
  };

  const normalizeModuleKey = (value: string | null | undefined) => value?.trim().toLowerCase() || '';

  const deriveFolderModuleAliases = (folder: string) => {
    const normalized = normalizeModuleKey(folder);
    const aliases = new Set<string>([normalized]);
    const compact = normalized.replace(/[\s_-]+/g, '');
    aliases.add(compact);
    const numberMatch = normalized.match(/\bmodule\s*([1-5])\b|^m\s*([1-5])\b|^([1-5])\b/i);
    const moduleNum = numberMatch?.[1] || numberMatch?.[2] || numberMatch?.[3];
    if (moduleNum) {
      aliases.add(`m${moduleNum}`);
      aliases.add(`module${moduleNum}`);
      aliases.add(`module ${moduleNum}`);
    }
    return aliases;
  };

  const folderModuleAliases = useMemo(
    () => deriveFolderModuleAliases(selectedFolder?.name || ''),
    [selectedFolder]
  );

  const folderOnlyRows = useMemo(() => {
    if (!folderModuleAliases.size) return rows;
    return rows.filter((row) => {
      const key = normalizeModuleKey(row.module);
      const compactKey = key.replace(/[\s_-]+/g, '');
      return folderModuleAliases.has(key) || folderModuleAliases.has(compactKey);
    });
  }, [rows, folderModuleAliases]);

  const moduleFoldersResolved = useMemo(
    () => moduleFolders.map((folder) => findFolderByPath(allFiles, folder.path) || folder),
    [moduleFolders, allFiles]
  );

  const leftTreeRoots = useMemo(() => {
    if (isAllModulesSelected) return moduleFoldersResolved;
    return completeFolder ? [completeFolder] : [];
  }, [isAllModulesSelected, moduleFoldersResolved, completeFolder]);

  const displayedRows = isAllModulesSelected ? rows : folderOnlyRows;


  const handleRunCompleteness = async () => {
    const targets = isAllModulesSelected ? moduleFoldersResolved : (completeFolder ? [completeFolder] : []);
    if (!targets.length) return;
    try {
      setIsRunning(true);
      setError(null);
      setRows([]);

      const blobPaths = targets.flatMap((folder) =>
        collectFileNodes(folder).map((entry) => entry.node.blobPath).filter(Boolean)
      );
      if (!blobPaths.length) {
        throw new Error("The selected folder doesn't contain any files for completeness check.");
      }

      const zipFilename = isAllModulesSelected ? 'all-modules.zip' : `${targets[0].name || 'module'}.zip`;
      const zipFile = await createZipFromBlob(blobPaths, zipFilename);
      const reportRows = await runCompletenessCheck(zipFile);
      setRows(reportRows);
    } catch (err) {
      setError("The completeness check encountered an issue. Please try again.");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div style={{ height: '100dvh', overflow: 'hidden', background: '#F5F3F0', display: 'flex', flexDirection: 'column' }}>
      {/* Top Bar */}
      <div className="bg-white" style={{ borderBottom: '0.5px solid #e0ddd6', flexShrink: 0 }}>
        <TopBarSimple user={user} onLogout={() => { logout(); navigate('/login'); }} />
        <div className="flex items-center gap-3 px-4 py-2.5" style={{ borderBottom: '0.5px solid #e0ddd6' }}>
          <button
            onClick={() => navigate('/workspace')}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 px-2 py-1 rounded hover:bg-gray-100"
          >
            <ArrowLeft size={13} /> Back
          </button>
          <div style={{ width: 1, height: 16, background: '#e0ddd6' }} />
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: '#E6F1FB', border: '0.5px solid #185FA5' }}>
              <CheckSquare size={12} style={{ color: '#185FA5' }} />
            </div>
            <span className="text-sm font-semibold text-gray-800">Completeness Check</span>
          </div>
          <span className="text-xs text-gray-500 ml-auto">{folderName}</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel - File Tree */}
        <aside className="flex flex-col bg-white" style={{ width: leftPanelWidth, borderRight: '0.5px solid #e0ddd6' }}>
          <div className="px-3 py-2.5" style={{ borderBottom: '0.5px solid #e0ddd6', borderColor: '#e0ddd6', flexShrink: 0 }}>
            <span className="text-xs font-medium uppercase tracking-wider text-gray-400">Folder Contents</span>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin py-2 px-1">
            {leftTreeRoots.length > 0 ? (
              <div>
                {leftTreeRoots.map((root) => (
                  <div key={root.path} className="mb-3">
                    <div className="flex items-center gap-2 px-2 py-1.5 mb-2 text-xs font-medium text-white rounded" style={{ background: '#185FA5' }}>
                      <Folder size={13} />
                      <span className="truncate">{root.name}</span>
                    </div>
                    {root.children && root.children.length > 0 ? (
                      <div className="py-2 px-1">
                        {root.children.map(child => (
                          <FileTreeItem key={child.path} node={child} depth={0} />
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-gray-400 px-2 py-2">
                        {root.children === undefined
                          ? 'Folder structure is loading...'
                          : 'This folder appears to be empty'}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500 text-xs text-center px-4">
                <div>
                  <p className="font-medium mb-1">No folder data available</p>
                  <p className="text-gray-400 text-10px">Please select a file and try again</p>
                </div>
              </div>
            )}
          </div>
        </aside>

        <DraggableDivider onDrag={(d) => setLeftPanelWidth(p => Math.max(MIN, Math.min(MAX, p + d)))} />

        {/* Right Panel - Results */}
        <main className="flex flex-col bg-white flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4">
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-800">Completeness Analysis</h3>
                
                {/* Folder Selector Dropdown */}
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => setShowFolderDropdown(!showFolderDropdown)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                    style={{ border: '0.5px solid #e0ddd6', background: '#fafaf9' }}
                  >
                    <Folder size={12} className="text-amber-500" />
                    <span className="truncate max-w-xs">{selectedFolder?.name || 'Select folder'}</span>
                    <ChevronDown size={12} className={`text-gray-400 shrink-0 transition-transform ${showFolderDropdown ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Dropdown Menu */}
                  {showFolderDropdown && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '100%',
                        right: 0,
                        marginTop: '4px',
                        background: 'white',
                        border: '0.5px solid #e0ddd6',
                        borderRadius: '6px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                        zIndex: 50,
                        minWidth: '220px',
                        maxHeight: '280px',
                        overflowY: 'auto',
                      }}
                    >
                      <button
                        onClick={() => {
                          setIsAllModulesSelected(true);
                          setShowFolderDropdown(false);
                        }}
                        className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
                        style={{
                          background: isAllModulesSelected ? '#E6F1FB' : 'white',
                          borderBottom: '0.5px solid #f0ede6',
                          fontWeight: 600,
                        }}
                      >
                        <Folder size={12} className="text-amber-500 shrink-0" />
                        <span className="truncate">All Modules</span>
                      </button>
                      {moduleFoldersResolved.length > 0 ? (
                        <div>
                          {moduleFoldersResolved.map(folder => (
                            <button
                              key={folder.path}
                              onClick={() => {
                                setSelectedFolder(folder);
                                setIsAllModulesSelected(false);
                                setShowFolderDropdown(false);
                              }}
                              className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
                              style={{
                                background: !isAllModulesSelected && selectedFolder?.path === folder.path ? '#E6F1FB' : 'white',
                                borderBottom: '0.5px solid #f0ede6',
                              }}
                            >
                              <Folder size={12} className="text-amber-500 shrink-0" />
                              <span className="truncate">{folder.name}</span>
                              {!isAllModulesSelected && selectedFolder?.path === folder.path && (
                                <span style={{ color: '#185FA5', marginLeft: 'auto', fontSize: '12px' }}>✓</span>
                              )}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="px-3 py-2 text-xs text-gray-500">No module folders found (m1-m5)</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRunCompleteness}
                  disabled={!completeFolder || isRunning}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50 flex items-center gap-1.5"
                  style={{ background: '#185FA5' }}
                >
                  <Play size={11} />
                  {isRunning ? 'Running…' : 'Run Completeness'}
                </button>
                {error && <span className="text-xs" style={{ color: '#993C1D' }}>{error}</span>}
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Checklist Results</h4>
              {displayedRows.length === 0 ? (
                <div className="text-xs text-gray-500 rounded-lg px-3 py-2" style={{ background: '#F8F7F4', border: '0.5px solid #e0ddd6' }}>
                  {isRunning
                    ? 'Processing selected module...'
                    : rows.length === 0
                      ? 'Run completeness check to see results.'
                      : 'No rows available for the selected folder.'}
                </div>
              ) : (
                <div style={{ border: '0.5px solid #e0ddd6', borderRadius: 8, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ background: '#F8F7F4' }}>
                      <tr>
                        <th style={{ textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6B7280', padding: '8px 10px' }}>Module</th>
                        <th style={{ textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6B7280', padding: '8px 10px' }}>Checklist Title</th>
                        <th style={{ textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6B7280', padding: '8px 10px' }}>Applicability</th>
                        <th style={{ textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6B7280', padding: '8px 10px' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedRows.map((row, idx) => (
                        <tr key={`${row.module}-${row.checklist_title}-${idx}`} style={{ borderTop: '0.5px solid #f0ede6' }}>
                          <td style={{ fontSize: 12, color: '#374151', padding: '8px 10px', whiteSpace: 'nowrap' }}>{row.module}</td>
                          <td style={{ fontSize: 12, color: '#111827', padding: '8px 10px' }}>{row.checklist_title}</td>
                          <td style={{ fontSize: 12, color: '#374151', padding: '8px 10px', whiteSpace: 'nowrap' }}>{row.applicability}</td>
                          <td style={{ fontSize: 12, color: '#374151', padding: '8px 10px', whiteSpace: 'nowrap' }}>
                            <span
                              className="px-2 py-0.5 rounded-full text-10px font-semibold capitalize"
                              style={
                                row.status === 'matched'
                                  ? { background: '#EAF7F2', color: '#0F5132' }
                                  : row.status === 'needs_user_confirmation'
                                    ? { background: '#FFF5E8', color: '#7A4D00' }
                                    : { background: '#FDEEEE', color: '#7D2A1C' }
                              }
                            >
                              {row.status === 'needs_user_confirmation' ? 'needs confirmation' : row.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

             
            </div>
          </div>

          <div className="p-4" style={{ borderTop: '0.5px solid #e0ddd6', flexShrink: 0 }} />
        </main>
      </div>
    </div>
  );
}
