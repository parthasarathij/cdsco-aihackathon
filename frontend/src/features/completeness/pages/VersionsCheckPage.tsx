import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, CheckSquare, ChevronDown, ChevronRight, Folder, File as FileIcon } from 'lucide-react';
import type { FileNode } from '../../../types';
import { useAuth } from '../../../contexts/AuthContext';
import TopBarSimple from '../../../components/TopBarSimple';
import DraggableDivider from '../../../components/layout/DraggableDivider';
import type { VersionCheckerItem, VersionCheckerResponse } from '../api/client';

export default function VersionsCheckPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [leftPanelWidth, setLeftPanelWidth] = useState(280);

  const state = location.state as {
    selectedFile?: FileNode;
    newFileName?: string;
    selectedFolder?: FileNode;
    allFolders?: FileNode[];
    isAllFoldersSelected?: boolean;
    versionResult?: VersionCheckerResponse;
    newVersionTree?: FileNode[];
  } | null;
  const newFileName = state?.newFileName;
  const selectedFolder = state?.selectedFolder;
  const allFolders = state?.allFolders || [];
  const isAllFoldersSelected = Boolean(state?.isAllFoldersSelected);
  const versionResult = state?.versionResult;
  const newVersionTree = state?.newVersionTree || [];
  const [showTrees, setShowTrees] = useState(false);
  const [expandedCurrentTree, setExpandedCurrentTree] = useState<Record<string, boolean>>({});
  const [expandedNewTree, setExpandedNewTree] = useState<Record<string, boolean>>({});

  const currentVersionTree = useMemo(() => {
    if (isAllFoldersSelected) return allFolders;
    return selectedFolder ? [selectedFolder] : [];
  }, [allFolders, isAllFoldersSelected, selectedFolder]);

  const toggleTreeNode = (
    path: string,
    setExpanded: Dispatch<SetStateAction<Record<string, boolean>>>
  ) => {
    setExpanded((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  const renderTreeNodes = (
    nodes: FileNode[],
    depth: number,
    expandedMap: Record<string, boolean>,
    setExpanded: Dispatch<SetStateAction<Record<string, boolean>>>
  ) => (
    nodes.map((node) => {
      if (node.type === 'folder') {
        const isExpanded = expandedMap[node.path] ?? true;
        return (
          <div key={node.path}>
            <button
              onClick={() => toggleTreeNode(node.path, setExpanded)}
              className="flex items-center gap-1.5 w-full text-left px-2 py-1 rounded hover:bg-gray-50 text-gray-700 font-medium"
              style={{ paddingLeft: `${8 + depth * 12}px` }}
            >
              {isExpanded ? <ChevronDown size={12} className="text-gray-400 shrink-0" /> : <ChevronRight size={12} className="text-gray-400 shrink-0" />}
              <Folder size={13} className="text-amber-500 shrink-0" />
              <span className="truncate text-xs">{node.name}</span>
            </button>
            {isExpanded && node.children?.length > 0 ? renderTreeNodes(node.children, depth + 1, expandedMap, setExpanded) : null}
          </div>
        );
      }
      return (
        <div
          key={node.path}
          className="flex items-center gap-1.5 w-full text-left px-2 py-1.5 rounded text-gray-700"
          style={{ paddingLeft: `${8 + depth * 12}px` }}
        >
          <FileIcon size={13} className="text-gray-400 shrink-0" />
          <span className="truncate text-xs">{node.name}</span>
        </div>
      );
    })
  );

  const renderRows = (rows: VersionCheckerItem[], emptyText: string) => {
    if (!rows.length) {
      return (
        <div className="text-xs text-gray-500 rounded-lg px-3 py-2" style={{ background: '#F8F7F4', border: '0.5px solid #e0ddd6' }}>
          {emptyText}
        </div>
      );
    }
    return (
      <div style={{ border: '0.5px solid #e0ddd6', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#F8F7F4' }}>
            <tr>
              <th style={{ textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6B7280', padding: '8px 10px' }}>Document Added</th>
              <th style={{ textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6B7280', padding: '8px 10px' }}>Path in ZIP</th>
              <th style={{ textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6B7280', padding: '8px 10px' }}>Description</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={`${row.path_in_zip}-${idx}`} style={{ borderTop: '0.5px solid #f0ede6' }}>
                <td style={{ fontSize: 12, color: '#111827', padding: '8px 10px', whiteSpace: 'nowrap' }}>{row.document_added}</td>
                <td style={{ fontSize: 12, color: '#374151', padding: '8px 10px' }}>{row.path_in_zip}</td>
                <td style={{ fontSize: 12, color: '#374151', padding: '8px 10px' }}>{row.Description || 'N/A'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-screen bg-white overflow-hidden">
      {/* Header */}
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
            <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: '#E1F5EE', border: '0.5px solid #0F6E56' }}>
              <CheckSquare size={12} style={{ color: '#0F6E56' }} />
            </div>
            <span className="text-sm font-semibold text-gray-800">Versions Check</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel - File Selection */}
        <aside className="flex flex-col bg-white" style={{ width: leftPanelWidth, borderRight: '0.5px solid #e0ddd6' }}>
          <div className="p-3 space-y-4 overflow-y-auto">
            {allFolders.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">Current Version</div>
              {isAllFoldersSelected && (
                <div className="rounded-lg px-3 py-2 text-xs mb-1.5" style={{ background: '#E6F1FB', border: '0.5px solid #185FA5', color: '#0C447C', fontWeight: 600 }}>
                  All Folders
                </div>
              )}
              <div className="space-y-1">
                {allFolders.map(folder => (
                  <div
                    key={folder.path}
                    className="rounded-lg px-3 py-2 text-xs"
                    style={{
                      background: selectedFolder?.path === folder.path ? '#E6F1FB' : '#F8F7F4',
                      border: `0.5px solid ${selectedFolder?.path === folder.path ? '#185FA5' : '#e0ddd6'}`,
                      color: selectedFolder?.path === folder.path ? '#0C447C' : '#666',
                    }}
                  >
                    {folder.name}
                  </div>
                ))}
              </div>
            </div>
          )}

            {/* New Version Section */}
            <div>
              <div className="text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">New Version</div>
              <div className="rounded-lg px-3 py-2 text-xs" style={{ background: '#E1F5EE', border: '0.5px solid #0F6E56', color: '#085041', fontWeight: 500 }}>
                {newFileName || 'Uploaded ZIP'}
              </div>
            </div>
          </div>
        </aside>

        {/* Divider */}
        <DraggableDivider
          onDrag={(delta) => {
            const newWidth = leftPanelWidth + delta;
            if (newWidth >= 250 && newWidth <= 600) {
              setLeftPanelWidth(newWidth);
            }
          }}
        />

        {/* Right Panel - Analysis Results */}
        <div className="flex-1 flex flex-col bg-white overflow-hidden">
          <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: '0.5px solid #e0ddd6', flexShrink: 0 }}>
            <span className="text-xs font-medium uppercase tracking-wider text-gray-400">Comparison Results</span>
            <button
              onClick={() => setShowTrees((prev) => !prev)}
              className="text-xs px-2.5 py-1.5 rounded-lg font-semibold"
              style={{ border: '0.5px solid #e0ddd6', background: showTrees ? '#E6F1FB' : '#fafaf9', color: showTrees ? '#0C447C' : '#4B5563' }}
            >
              {showTrees ? 'Hide Trees' : 'View Trees'}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {showTrees ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Current Version Tree</h3>
                  <div className="rounded-lg p-2" style={{ border: '0.5px solid #e0ddd6', background: '#FAFAF8', maxHeight: '70vh', overflowY: 'auto' }}>
                    {currentVersionTree.length > 0
                      ? renderTreeNodes(currentVersionTree, 0, expandedCurrentTree, setExpandedCurrentTree)
                      : <div className="text-xs text-gray-500 px-2 py-1">Unable to display the file structure for the current version.</div>}
                  </div>
                </div>
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">New Version Tree</h3>
                  <div className="rounded-lg p-2" style={{ border: '0.5px solid #e0ddd6', background: '#FAFAF8', maxHeight: '70vh', overflowY: 'auto' }}>
                    {newVersionTree.length > 0
                      ? renderTreeNodes(newVersionTree, 0, expandedNewTree, setExpandedNewTree)
                      : <div className="text-xs text-gray-500 px-2 py-1">Unable to display the file structure for the new version.</div>}
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Only in Current Version (ZIP A)</h3>
                  {versionResult
                    ? renderRows(versionResult.only_in_zip_a || [], 'We didn\'t find any documents that are only in the current version.')
                    : <div className="text-xs text-gray-500 rounded-lg px-3 py-2" style={{ background: '#F8F7F4', border: '0.5px solid #e0ddd6' }}>We couldn\'t find any results. Please try running the version check again from the workspace.</div>}
                </div>

                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Only in New Version (ZIP B)</h3>
                  {versionResult
                    ? renderRows(versionResult.only_in_zip_b || [], 'No new documents were found in the uploaded ZIP file.')
                    : null}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
