import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, AlertCircle, Folder } from 'lucide-react';
import type { FileNode } from '../../../types';
import { useAuth } from '../../../contexts/AuthContext';
import TopBarSimple from '../../../components/TopBarSimple';
import type { ConsistencyCheckResponse } from '../api/client';

function ConsistencyCheckResultsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const location = useLocation();

  const state = (location.state as any) ?? {};
  const allFolders = (state.allFolders || []) as FileNode[];
  const consistencyResult = (state.consistencyResult || null) as ConsistencyCheckResponse | null;
  const [selectedFolder, setSelectedFolder] = useState<FileNode | null>(allFolders[0] || null);

  useEffect(() => {
    if (!selectedFolder && allFolders.length > 0) {
      setSelectedFolder(allFolders[0]);
    }
  }, [allFolders, selectedFolder]);

  const comparisonRows = consistencyResult || [];

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <div className="bg-white" style={{ borderBottom: '0.5px solid #e0ddd6', flexShrink: 0 }}>
        <TopBarSimple user={user} onLogout={() => navigate('/login')} />
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
            <span className="text-sm font-semibold text-gray-800">Consistency Check Results</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <div className="flex h-full">
          <aside className="w-80 border-r border-gray-200 overflow-y-auto bg-gray-50">
            <div className="p-4 border-b border-gray-200">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Folders</div>
              <div className="text-sm font-medium text-gray-900 mt-1">{allFolders.length} selected</div>
            </div>
            <div className="p-3 space-y-2">
              {allFolders.length === 0 ? (
                <div className="rounded-lg p-4 text-xs text-gray-500 bg-white border border-gray-200">No folder data available</div>
              ) : allFolders.map(folder => (
                <button
                  key={folder.path}
                  onClick={() => setSelectedFolder(folder)}
                  className="w-full text-left rounded-xl px-3 py-3 flex items-center gap-3"
                  style={{
                    background: selectedFolder?.path === folder.path ? '#E6F1FB' : '#fff',
                    border: `1px solid ${selectedFolder?.path === folder.path ? '#185FA5' : '#E5E7EB'}`,
                    color: selectedFolder?.path === folder.path ? '#0C447C' : '#374151',
                  }}
                >
                  <Folder size={16} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{folder.name}</div>
                    <div className="text-xs text-gray-500 truncate">{folder.path}</div>
                  </div>
                </button>
              ))}
            </div>
          </aside>

          <main className="flex-1 overflow-y-auto">
            <div className="max-w-6xl mx-auto p-6 space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-800 mb-2">Consistency Check Results</h1>
                <p className="text-sm text-gray-500">Analysis across {allFolders.length} folders</p>
              </div>

              <div>
                <h2 className="text-lg font-semibold text-gray-800 mb-4">Field Consistency</h2>
                {comparisonRows.length === 0 ? (
                  <div className="rounded-lg p-4 text-sm text-gray-500" style={{ border: '0.5px solid #e0ddd6', background: '#F8F7F4' }}>
                    No consistency results found. Please run Consistency Check again.
                  </div>
                ) : (
                  <div style={{ border: '0.5px solid #e0ddd6', borderRadius: 8, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead style={{ background: '#F8F7F4' }}>
                        <tr>
                          <th style={{ textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6B7280', padding: '8px 10px' }}>Field Name</th>
                          <th style={{ textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6B7280', padding: '8px 10px' }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {comparisonRows.map((row, idx) => {
                          // Extract field name (the key that's not "consistency")
                          const fieldName = Object.keys(row).find(key => key !== 'consistency') || 'Unknown Field';
                          const fieldValue = row[fieldName];
                          const consistency = row.consistency;

                          return (
                            <tr key={`${fieldName}-${idx}`} style={{ borderTop: '0.5px solid #f0ede6' }}>
                              <td style={{ fontSize: 12, color: '#111827', padding: '8px 10px' }}>
                                <div className="font-medium">{fieldName}</div>
                                {fieldValue && fieldValue !== consistency && (
                                  <div className="text-xs text-gray-500 mt-1 max-w-md truncate" title={fieldValue}>
                                    {fieldValue}
                                  </div>
                                )}
                              </td>
                              <td style={{ fontSize: 12, color: '#374151', padding: '8px 10px' }}>
                                <span
                                  className={`px-2 py-1 rounded-full text-xs font-medium ${
                                    consistency === 'Consistent'
                                      ? 'bg-green-100 text-green-800'
                                      : consistency === 'Inconsistent'
                                      ? 'bg-red-100 text-red-800'
                                      : 'bg-yellow-100 text-yellow-800'
                                  }`}
                                >
                                  {consistency}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

export default ConsistencyCheckResultsPage;
