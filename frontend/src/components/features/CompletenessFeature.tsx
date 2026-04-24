import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { FileNode } from '../../types';
import { UploadCloud, Play, FolderOpen, ChevronRight, X, CheckCircle2, Loader2, Plus } from 'lucide-react';
import { CompletenessSkeleton } from '../Skeleton';
import JSZip from 'jszip';
import { runConsistencyCheckFromBlob, createZipFromBlob, runVersionChecker, type ConsistencyCheckResponse, type VersionCheckerResponse } from '../../api/workspaceClient';



interface CompletenessFeatureProps {
  selectedFile: FileNode | null;
  onClearSelectedFile?: () => void;
  completenessSubFeature?: 'completeness-check' | 'consistency-check' | 'versions-check';
  allFiles?: FileNode[];
}

/** Reusable progress view showing folder name + file names with staggered success reveal */
function FileProgressView({ folder }: { folder: FileNode }) {
  const [revealedCount, setRevealedCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Collect all file names from this folder tree
  const allFiles = useCallback(() => {
    const files: string[] = [];
    const walk = (nodes: FileNode[]) => {
      for (const n of nodes) {
        if (n.type === 'file') files.push(n.name);
        else if (n.children) walk(n.children);
      }
    };
    walk(folder.children || []);
    return files;
  }, [folder]);

  useEffect(() => {
    const files = allFiles();
    const total = files.length;
    if (total === 0) return;

    const baseInterval = total > 100 ? 30 : total > 50 ? 50 : 80;
    let current = 0;

    const tick = () => {
      current += 1;
      if (current <= total) {
        setRevealedCount(current);
        const nextInterval = Math.max(10, baseInterval - current * 0.2);
        timerRef.current = setTimeout(tick, nextInterval);
      }
    };

    timerRef.current = setTimeout(tick, baseInterval);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [allFiles]);

  const files = allFiles();

  return (
    <div className="space-y-2 mt-2">
      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
        Processing Files ({Math.min(revealedCount, files.length)} / {files.length})
      </div>
      <div className="rounded-lg overflow-hidden" style={{ border: '0.5px solid #e0ddd6' }}>
        <div className="px-3 py-2 flex items-center gap-2" style={{ background: '#F8F7F4' }}>
          <FolderOpen size={12} style={{ flexShrink: 0, color: '#185FA5' }} />
          <span className="text-xs font-semibold" style={{ color: '#0C447C' }}>{folder.name}</span>
          <span className="text-xs text-gray-400 ml-auto">{Math.min(revealedCount, files.length)} / {files.length}</span>
        </div>
        <div className="px-3 py-1">
          {files.map((fileName, idx) => {
            const isRevealed = idx < revealedCount;
            const isCurrent = idx === revealedCount - 1;

            if (!isRevealed) return null;

            return (
              <div
                key={`${fileName}-${idx}`}
                className="flex items-center gap-2 py-1.5"
                style={{
                  borderBottom: '0.5px solid #f0ede6',
                  animation: isCurrent ? 'fadeIn 0.3s ease-out' : undefined,
                }}
              >
                {isCurrent ? (
                  <Loader2 size={11} className="shrink-0 animate-spin" style={{ color: '#854F0B' }} />
                ) : (
                  <CheckCircle2 size={11} className="shrink-0" style={{ color: '#0F6E56' }} />
                )}
                <span className="text-xs truncate" style={{ color: isCurrent ? '#854F0B' : '#444441' }}>
                  {fileName}
                </span>
                <span className="text-xs ml-auto shrink-0" style={{
                  color: isCurrent ? '#854F0B' : '#0F6E56',
                  fontWeight: 500,
                }}>
                  {isCurrent ? 'processing…' : 'success'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

export default function CompletenessFeature({ selectedFile, onClearSelectedFile: _onClearSelectedFile, completenessSubFeature, allFiles = [] }: CompletenessFeatureProps) {
  const navigate = useNavigate();
  const [newFile, setNewFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<FileNode | null>(null);

  const getSelectableFolders = (nodes: FileNode[]): FileNode[] => {
    const rootFolders = nodes.filter(node => node.type === 'folder');
    // If workspace uploads are nested under a single top-level folder, show its child folders instead.
    if (rootFolders.length === 1 && rootFolders[0].children?.some(child => child.type === 'folder')) {
      return rootFolders[0].children!.filter(child => child.type === 'folder');
    }
    return rootFolders;
  };

  const selectableFolders = getSelectableFolders(allFiles);

  // Only show versions-check UI for versions-check
  if (completenessSubFeature === 'versions-check') {
    return (
      <VersionsCheckUI 
        folders={selectableFolders}
        selectedFile={selectedFile} 
        loading={loading} 
        done={done}
        newFile={newFile}
        onFileChange={(name, _file) => setNewFile(name || null)}
        onRun={async () => {
          setLoading(true);
          await new Promise((resolve) => setTimeout(resolve, 600));
          setLoading(false);
          setDone(true);
        }}
        navigate={navigate}
      />
    );
  }

  // Only show consistency-check UI for consistency-check
  if (completenessSubFeature === 'consistency-check') {
    return (
      <ConsistencyCheckUI 
        folders={selectableFolders}
        navigate={navigate}
      />
    );
  }

  // For completeness-check: show folder selection
  const handleRunCompletenessCheck = () => {
    if (!selectedFolder) return;
    
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      navigate('/completeness-check', {
        state: {
          selectedFolder: selectedFolder,
          allFiles: allFiles,
        },
      });
    }, 1800);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div>
          <div className="text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">Select Folder</div>
          
          {selectableFolders.length === 0 ? (
            <div className="rounded-lg px-3 py-2 text-xs text-gray-400 text-center" style={{ background: '#F8F7F4', border: '0.5px solid #e0ddd6' }}>
              No folders uploaded
            </div>
          ) : (
            <div className="space-y-1.5 max-h-96 overflow-y-auto scrollbar-thin">
              {selectableFolders.map(folder => (
                  <button
                    key={folder.path}
                    onClick={() => setSelectedFolder(folder)}
                    className="w-full rounded-lg px-3 py-2.5 text-xs flex items-center gap-2 transition-colors text-left"
                    style={{
                      background: selectedFolder?.path === folder.path ? '#E6F1FB' : '#F8F7F4',
                      border: `0.5px solid ${selectedFolder?.path === folder.path ? '#185FA5' : '#e0ddd6'}`,
                      color: selectedFolder?.path === folder.path ? '#0C447C' : '#666',
                    }}
                  >
                    <FolderOpen size={12} style={{ flexShrink: 0 }} />
                    <span className="font-medium truncate">{folder.name}</span>
                    {selectedFolder?.path === folder.path && <ChevronRight size={12} style={{ marginLeft: 'auto', flexShrink: 0 }} />}
                  </button>
              ))}
            </div>
          )}
        </div>

        {selectedFolder && loading && (
          <FileProgressView folder={selectedFolder} />
        )}
      </div>

      <div className="p-3" style={{ borderTop: '0.5px solid #e0ddd6' }}>
        <button 
          onClick={handleRunCompletenessCheck} 
          disabled={!selectedFolder || loading}
          className="w-full py-2 rounded-lg text-xs font-semibold text-white flex items-center justify-center gap-1.5 disabled:opacity-40"
          style={{ background: '#185FA5' }}>
          {loading ? 'Analysing…' : <><Play size={11} /> Run Completeness Check</>}
        </button>
      </div>
    </div>
  );
}

function VersionsCheckUI({ folders, selectedFile, loading, done, newFile, onFileChange, onRun, navigate }: {
  folders: FileNode[];
  selectedFile: FileNode | null;
  loading: boolean;
  done: boolean;
  newFile: string | null;
  onFileChange: (name: string, file: File | null) => void;
  onRun: () => Promise<void>;
  navigate: any;
}) {
  const [selectedFolder, setSelectedFolder] = useState<FileNode | null>(folders[0] || null);
  const [isAllFoldersSelected, setIsAllFoldersSelected] = useState(false);
  const [uploadedZipFile, setUploadedZipFile] = useState<File | null>(null);
  const [uploadedZipTree, setUploadedZipTree] = useState<FileNode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const zipInputRef = useRef<HTMLInputElement>(null);

  const fileListToZip = async (files: FileList | File[], zipName = 'new-version.zip'): Promise<File> => {
    const list = Array.from(files as ArrayLike<File>);
    if (!list.length) throw new Error('No files selected.');
    const zip = new JSZip();
    for (const f of list) {
      const path = ((f as any).webkitRelativePath || f.name || '').replace(/^\/+/, '');
      if (!path) continue;
      zip.file(path, f);
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    return new File([blob], zipName, { type: 'application/zip' });
  };

  const handleFolderUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      // For folder uploads, extract folder name from webkitRelativePath
      const firstFile = files[0] as any;
      const relativePath = firstFile.webkitRelativePath;
      
      if (relativePath) {
        // Extract folder name (first part of the path)
        const folderName = relativePath.split('/')[0];
        const fileCount = files.length;
        const zipName = `${folderName || 'new-version'}-folder.zip`;
        void fileListToZip(files, zipName).then((zipFile) => {
          setUploadedZipFile(zipFile);
          onFileChange(`${folderName} (${fileCount} files)`, zipFile);
          void buildTreeFromZip(zipFile)
            .then((tree) => setUploadedZipTree(tree))
            .catch(() => setUploadedZipTree([]));
        }).catch(() => {
          setError("Something went wrong while packaging your folder. Please try again.");
        });
      } else {
        // Fallback: treat as regular file selection
        const zipName = 'new-version-files.zip';
        void fileListToZip(files, zipName).then((zipFile) => {
          setUploadedZipFile(zipFile);
          onFileChange(`${files.length} files`, zipFile);
          void buildTreeFromZip(zipFile)
            .then((tree) => setUploadedZipTree(tree))
            .catch(() => setUploadedZipTree([]));
        }).catch(() => {
          setError("We couldn't package your files. Please try again.");
        });
      }
    }
    e.target.value = '';
  };

  const handleZipUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const zip = files[0];
      setUploadedZipFile(zip);
      onFileChange(zip.name, zip);
      void buildTreeFromZip(zip)
        .then((tree) => setUploadedZipTree(tree))
        .catch(() => setUploadedZipTree([]));
    }
    e.target.value = '';
  };

  const buildTreeFromZip = async (zipFile: File): Promise<FileNode[]> => {
    const zip = await JSZip.loadAsync(zipFile);
    const root: Record<string, FileNode> = {};

    const getOrCreateFolder = (parts: string[]): FileNode => {
      let currentLevel = root;
      let pathAccumulator = '';
      let parent: FileNode | null = null;
      for (const part of parts) {
        pathAccumulator = pathAccumulator ? `${pathAccumulator}/${part}` : part;
        if (!currentLevel[part]) {
          const folderNode: FileNode = {
            name: part,
            path: pathAccumulator,
            type: 'folder',
            extension: '',
            children: [],
            blobPath: '',
            file: null,
          };
          currentLevel[part] = folderNode;
          if (parent) parent.children.push(folderNode);
        }
        parent = currentLevel[part];
        const map: Record<string, FileNode> = {};
        for (const child of parent.children) {
          map[child.name] = child;
        }
        currentLevel = map;
      }
      return parent!;
    };

    const entries = Object.values(zip.files).filter((entry) => !entry.dir);
    for (const entry of entries) {
      const cleanPath = entry.name.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
      if (!cleanPath) continue;
      const parts = cleanPath.split('/').filter(Boolean);
      const fileName = parts[parts.length - 1];
      const folderParts = parts.slice(0, -1);
      const extension = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() || '' : '';

      if (folderParts.length === 0) {
        root[fileName] = {
          name: fileName,
          path: cleanPath,
          type: 'file',
          extension,
          children: [],
          blobPath: '',
          file: null,
        };
        continue;
      }

      const parent = getOrCreateFolder(folderParts);
      parent.children.push({
        name: fileName,
        path: cleanPath,
        type: 'file',
        extension,
        children: [],
        blobPath: '',
        file: null,
      });
    }

    return Object.values(root).sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  };

  const collectBlobPaths = (nodes: FileNode[]): string[] => {
    const paths: string[] = [];
    const walk = (list: FileNode[]) => {
      for (const n of list) {
        if (n.type === 'file') {
          if (n.blobPath) paths.push(n.blobPath);
        } else if (n.children) {
          walk(n.children);
        }
      }
    };
    walk(nodes);
    return paths;
  };

  const createCurrentVersionZip = async (): Promise<File> => {
    const targets = isAllFoldersSelected ? folders : (selectedFolder ? [selectedFolder] : []);
    if (!targets.length) {
      throw new Error("Please select a folder for the current version to continue.");
    }

    const blobPaths = collectBlobPaths(targets);
    if (!blobPaths.length) {
      throw new Error("The selected folder appears to be empty.");
    }

    // Use server-side ZIP creation: sends blob paths to backend,
    // which creates the ZIP directly from Azure Blob Storage.
    // This eliminates 300+ individual HTTP round trips from the browser.
    const zipName = isAllFoldersSelected ? 'all-folders-current.zip' : `${targets[0].name}-current.zip`;
    return createZipFromBlob(blobPaths, zipName);
  };

  const handleRunVersionsCheck = async () => {
    if (loading || done) return;
    if (!uploadedZipFile) {
      setError("Please upload the ZIP file for the new version.");
      return;
    }

    try {
      setError(null);
      await onRun();
      // Build tree at submit time to avoid race with async state updates after upload.
      const resolvedNewVersionTree = uploadedZipTree.length > 0
        ? uploadedZipTree
        : await buildTreeFromZip(uploadedZipFile);
      const currentZip = await createCurrentVersionZip();
      const result: VersionCheckerResponse = await runVersionChecker(currentZip, uploadedZipFile);
      navigate('/versions-check/results', {
        state: {
          selectedFile,
          newFileName: uploadedZipFile.name || newFile,
          selectedFolder,
          allFolders: folders,
          isAllFoldersSelected,
          versionResult: result,
          newVersionTree: resolvedNewVersionTree,
        },
      });
    } catch (err) {
      setError("The version check encountered an issue. Please try again.");
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Current Version Folders */}
        <div>
          <div className="text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">Current Version</div>
          {folders.length === 0 ? (
            <div className="rounded-lg px-3 py-2 text-xs text-gray-400 text-center" style={{ background: '#F8F7F4', border: '0.5px solid #e0ddd6' }}>
              No folders uploaded
            </div>
          ) : (
            <div className="space-y-1.5 max-h-96 overflow-y-auto scrollbar-thin">
              {folders.map(folder => (
                <button
                  key={folder.path}
                  onClick={() => {
                    setSelectedFolder(folder);
                    setIsAllFoldersSelected(false);
                  }}
                  className="w-full rounded-lg px-3 py-2.5 text-xs flex items-center gap-2 transition-colors text-left"
                  style={{
                    background: !isAllFoldersSelected && selectedFolder?.path === folder.path ? '#E6F1FB' : '#F8F7F4',
                    border: `0.5px solid ${!isAllFoldersSelected && selectedFolder?.path === folder.path ? '#185FA5' : '#e0ddd6'}`,
                    color: !isAllFoldersSelected && selectedFolder?.path === folder.path ? '#0C447C' : '#666',
                  }}
                >
                  <FolderOpen size={12} style={{ flexShrink: 0 }} />
                  <span className="font-medium truncate">{folder.name}</span>
                  {!isAllFoldersSelected && selectedFolder?.path === folder.path && <ChevronRight size={12} style={{ marginLeft: 'auto', flexShrink: 0 }} />}
                </button>
              ))}
            </div>
          )}
          {folders.length > 0 && (
            <button
              onClick={() => {
                setIsAllFoldersSelected(true);
                setSelectedFolder(null);
              }}
              className="w-full mt-1.5 rounded-lg px-3 py-2.5 text-xs flex items-center gap-2 transition-colors text-left"
              style={{
                background: isAllFoldersSelected ? '#E6F1FB' : '#F8F7F4',
                border: `0.5px solid ${isAllFoldersSelected ? '#185FA5' : '#e0ddd6'}`,
                color: isAllFoldersSelected ? '#0C447C' : '#666',
              }}
            >
              <FolderOpen size={12} style={{ flexShrink: 0 }} />
              <span className="font-medium truncate">All Folders</span>
              {isAllFoldersSelected && <ChevronRight size={12} style={{ marginLeft: 'auto', flexShrink: 0 }} />}
            </button>
          )}
        </div>

        {/* New Version Upload */}
        <div>
          <div className="text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">New Version</div>
          
          {newFile ? (
            <div className="flex items-center justify-between px-2 py-1.5 rounded-lg" style={{ background: '#E1F5EE', border: '0.5px solid #0F6E56' }}>
              <div className="flex items-center gap-2 min-w-0">
                <UploadCloud size={11} className="text-green-700 shrink-0" />
                <span className="text-xs text-green-900 truncate font-medium" title={newFile}>{newFile}</span>
              </div>
              <button
                onClick={() => {
                  setUploadedZipFile(null);
                  setUploadedZipTree([]);
                  onFileChange('', null);
                }}
                className="text-green-700 hover:text-red-500 transition-colors shrink-0"
                title="Remove"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            /* Drag Drop Area for New Version */
            <div
              onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                const files = e.dataTransfer.files;
                if (files && files.length > 0) {
                  // Single ZIP: use as-is. Otherwise package files/folder to ZIP.
                  if (files.length === 1 && files[0].name.toLowerCase().endsWith('.zip')) {
                    handleZipUpload({ target: { files, value: '' } } as any);
                  } else {
                    handleFolderUpload({ target: { files, value: '' } } as any);
                  }
                }
              }}
              className="rounded-lg p-4 border-2 border-dashed transition-all"
              style={{
                borderColor: dragActive ? '#185FA5' : '#e0ddd6',
                background: dragActive ? '#E6F1FB' : '#F8F7F4'
              }}
            >
              <div className="flex flex-col items-center justify-center gap-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: '#E6F1FB', border: '0.5px solid #185FA5' }}>
                  <Plus size={14} style={{ color: '#0C447C' }} />
                </div>
                <div className="text-xs text-center" style={{ color: dragActive ? '#0C447C' : '#999' }}>
                  <div className="font-medium">Drag & drop new version here</div>
                  <div className="text-gray-400 text-xs mt-0.5">ZIP file, folder, or files</div>
                </div>
              </div>
            </div>
          )}
          {!newFile && (
            <div className="mt-2 flex gap-2">
              <input ref={zipInputRef} type="file" accept=".zip" className="hidden" onChange={handleZipUpload} />
              <button
                type="button"
                onClick={() => zipInputRef.current?.click()}
                className="px-2 py-1.5 text-[11px] rounded-md"
                style={{ background: '#E6F1FB', border: '0.5px solid #185FA5', color: '#0C447C' }}
              >
                Upload ZIP
              </button>
            </div>
          )}
        </div>

        {loading && (selectedFolder || isAllFoldersSelected) && (
          <FileProgressView folder={isAllFoldersSelected && folders.length > 0 ? { ...folders[0], name: 'All Folders', children: folders.flatMap(f => f.children || []) } : selectedFolder!} />
        )}
        {loading && !selectedFolder && !isAllFoldersSelected && <CompletenessSkeleton />}
        {!loading && done && <div className="text-xs text-green-700">Uploaded Successfully. Processing Folders...</div>}
        {error && <div className="text-xs text-red-600">{error}</div>}
      </div>

      <div className="p-3" style={{ borderTop: '0.5px solid #e0ddd6' }}>
        <button onClick={handleRunVersionsCheck} disabled={!newFile || loading || done}
          className="w-full py-2 rounded-lg text-xs font-semibold text-white flex items-center justify-center gap-1.5 disabled:opacity-40"
          style={{ background: newFile && !loading && !done ? '#185FA5' : '#b8cde0' }}>
          {loading || done ? 'Processing…' : <><Play size={11} /> Run Versions Check</>}
        </button>
      </div>
    </div>
  );
}

function ConsistencyCheckUI({ folders, navigate }: {
  folders: FileNode[];
  navigate: any;
}) {
  const [loading, setLoading] = useState(false);
  const [analysisFinished, setAnalysisFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Progress tracking state
  const [revealedCount, setRevealedCount] = useState(0);
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Build a flat list of { folderName, fileName } for progressive reveal
  const allFileEntries = useCallback(() => {
    const entries: Array<{ folderName: string; fileName: string }> = [];
    for (const folder of folders) {
      const walk = (nodes: FileNode[]) => {
        for (const n of nodes) {
          if (n.type === 'file') {
            entries.push({ folderName: folder.name, fileName: n.name });
          } else if (n.children) {
            walk(n.children);
          }
        }
      };
      walk(folder.children || []);
    }
    return entries;
  }, [folders]);

  const progressEntries = useMemo(() => allFileEntries(), [allFileEntries]);
  const progressTotal = progressEntries.length;

  // Start progressive reveal once per loading cycle.
  useEffect(() => {
    if (!loading) {
      if (progressTimerRef.current) {
        clearTimeout(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      return;
    }

    const total = progressTotal;
    if (total === 0) return;
    // Already completed; do not restart from 1/N while waiting for backend response.
    if (revealedCount >= total) return;

    // Reveal files progressively — faster for small sets, slower for large
    const baseInterval = total > 100 ? 30 : total > 50 ? 50 : 80;
    let current = revealedCount;

    const tick = () => {
      current += 1;
      const next = Math.min(current, total);
      setRevealedCount(next);
      if (next >= total) {
        // Freeze at full completion; don't restart/replay.
        if (progressTimerRef.current) {
          clearTimeout(progressTimerRef.current);
          progressTimerRef.current = null;
        }
        return;
      }
      const nextInterval = Math.max(10, baseInterval - current * 0.2);
      progressTimerRef.current = setTimeout(tick, nextInterval);
    };

    if (!progressTimerRef.current) {
      progressTimerRef.current = setTimeout(tick, baseInterval);
    }
    return () => {
      if (progressTimerRef.current) {
        clearTimeout(progressTimerRef.current);
        progressTimerRef.current = null;
      }
    };
  }, [loading, progressTotal, revealedCount]);

  const collectBlobPaths = (nodes: FileNode[]): string[] => {
    const paths: string[] = [];
    const walk = (list: FileNode[]) => {
      for (const n of list) {
        if (n.type === 'file') {
          if (n.blobPath) paths.push(n.blobPath);
        } else if (n.children) {
          walk(n.children);
        }
      }
    };
    walk(nodes);
    return paths;
  };

  const handleRunConsistency = async () => {
    if (!folders.length) {
      setError("There are no folders available to check for consistency. Please upload some files first.");
      return;
    }

    try {
      setLoading(true);
      setAnalysisFinished(false);
      setError(null);
      setRevealedCount(0);

      // Collect all blob paths from all folders
      const blobPaths = collectBlobPaths(folders);
      if (!blobPaths.length) {
        throw new Error("We couldn't find any files to check in the selected folders.");
      }

      const result: ConsistencyCheckResponse = await runConsistencyCheckFromBlob(blobPaths);
      // Reveal all remaining files as success before navigating
      setRevealedCount(allFileEntries().length);
      setAnalysisFinished(true);
      navigate('/consistency-check-results', {
        state: {
          allFolders: folders,
          consistencyResult: result,
        },
      });
    } catch (err) {
      setError("The consistency check encountered an issue. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Build the progress view
  const renderProgress = () => {
    const entries = progressEntries;
    const total = progressTotal;
    const isProgressComplete = total > 0 && revealedCount >= total;

    // Build a folder-grouped structure with global indices
    const folderGroups: Array<{
      folderName: string;
      files: Array<{ fileName: string; globalIdx: number }>;
    }> = [];
    const folderMap = new Map<string, Array<{ fileName: string; globalIdx: number }>>();
    for (let i = 0; i < entries.length; i++) {
      const { folderName, fileName } = entries[i];
      if (!folderMap.has(folderName)) {
        folderMap.set(folderName, []);
      }
      folderMap.get(folderName)!.push({ fileName, globalIdx: i });
    }
    for (const [folderName, files] of folderMap) {
      folderGroups.push({ folderName, files });
    }

    return (
      <div className="space-y-2 mt-2">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
          Processing Files ({Math.min(revealedCount, total)} / {total})
        </div>
        <div className="relative">
          {isProgressComplete && !analysisFinished && (
            <div
              className="sticky top-0 z-20 flex items-center justify-center rounded-lg mb-2"
              style={{
                background: 'rgba(248,247,244,0.75)',
                backdropFilter: 'blur(3px)',
                cursor: 'progress',
                border: '0.5px solid #e0ddd6',
              }}
            >
              <div className="flex items-center gap-2 px-3 py-2 text-xs font-semibold" style={{ color: '#444441' }}>
                <Loader2 size={12} className="animate-spin" />
                Processing…
              </div>
            </div>
          )}

          <div style={isProgressComplete && !analysisFinished ? { filter: 'blur(1.5px)', opacity: 0.85, pointerEvents: 'none' } : undefined}>
            {folderGroups.map(({ folderName, files }) => {
              // Check if any files in this folder have been revealed yet
              const firstFileIdx = files[0]?.globalIdx ?? 0;
              if (firstFileIdx >= revealedCount) return null;

              const revealedInFolder = files.filter(f => f.globalIdx < revealedCount).length;

              return (
                <div key={folderName} className="rounded-lg overflow-hidden" style={{ border: '0.5px solid #e0ddd6' }}>
                  {/* Folder header */}
                  <div className="px-3 py-2 flex items-center gap-2" style={{ background: '#F8F7F4' }}>
                    <FolderOpen size={12} style={{ flexShrink: 0, color: '#0F6E56' }} />
                    <span className="text-xs font-semibold" style={{ color: '#085041' }}>{folderName}</span>
                    <span className="text-xs text-gray-400 ml-auto">
                      {revealedInFolder} / {files.length}
                    </span>
                  </div>
                  {/* File list */}
                  <div className="px-3 py-1">
                    {files.map(({ fileName, globalIdx }) => {
                      const isRevealed = globalIdx < revealedCount;
                      const isCurrent = !analysisFinished && !isProgressComplete && loading && globalIdx === revealedCount - 1;

                      if (!isRevealed) return null;

                      return (
                        <div
                          key={`${fileName}-${globalIdx}`}
                          className="flex items-center gap-2 py-1.5"
                          style={{
                            borderBottom: '0.5px solid #f0ede6',
                            animation: isCurrent ? 'fadeIn 0.3s ease-out' : undefined,
                          }}
                        >
                          {isCurrent ? (
                            <Loader2 size={11} className="shrink-0 animate-spin" style={{ color: '#854F0B' }} />
                          ) : (
                            <CheckCircle2 size={11} className="shrink-0" style={{ color: '#0F6E56' }} />
                          )}
                          <span className="text-xs truncate" style={{ color: isCurrent ? '#854F0B' : '#444441' }}>
                            {fileName}
                          </span>
                          <span className="text-xs ml-auto shrink-0" style={{
                            color: isCurrent ? '#854F0B' : '#0F6E56',
                            fontWeight: 500,
                          }}>
                            {isCurrent ? 'processing…' : 'success'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div>
          <div className="text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">All Folders are Selected for Analysis</div>
          {folders.length === 0 ? (
            <div className="rounded-lg px-3 py-2 text-xs text-gray-400 text-center" style={{ background: '#F8F7F4', border: '0.5px solid #e0ddd6' }}>
              No folders uploaded
            </div>
          ) : (
            <div className="space-y-1.5 max-h-96 overflow-y-auto scrollbar-thin">
              {folders.map(folder => (
                <div
                  key={folder.path}
                  className="w-full rounded-lg px-3 py-2.5 text-xs flex items-center gap-2 text-left"
                  style={{
                    background: '#E1F5EE',
                    border: '0.5px solid #0F6E56',
                    color: '#085041',
                  }}
                >
                  <FolderOpen size={12} style={{ flexShrink: 0 }} />
                  <span className="font-medium truncate">{folder.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {loading && renderProgress()}
        {error && <div className="text-xs text-red-600">{error}</div>}
      </div>

      <div className="p-3" style={{ borderTop: '0.5px solid #e0ddd6' }}>
        <button onClick={handleRunConsistency} disabled={loading || folders.length === 0}
          className="w-full py-2 rounded-lg text-xs font-semibold text-white flex items-center justify-center gap-1.5 disabled:opacity-40"
          style={{ background: folders.length > 0 && !loading ? '#0F6E56' : '#b2926d' }}>
          {loading ? <><Loader2 size={11} className="animate-spin" /> Analysing…</> : <><Play size={11} /> Run Consistency Check</>}
        </button>
      </div>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
