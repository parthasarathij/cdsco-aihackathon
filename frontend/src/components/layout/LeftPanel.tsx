import { useRef } from 'react';
import { FolderOpen, UploadCloud } from 'lucide-react';
import type { FileNode } from '../../types';
import { buildFileTree } from '../../utils/buildFileTree';
import FileTreeNode from '../filetree/FileTreeNode';

interface Props {
  files: FileNode[];
  selectedFile: FileNode | null;
  expandedFolders: Record<string, boolean>;
  onFilesLoaded: (nodes: FileNode[], count: number) => void;
  onToggleFolder: (path: string) => void;
  onSelectFile: (node: FileNode) => void;
  style?: React.CSSProperties;
}

export default function LeftPanel({ files, selectedFile, expandedFolders, onFilesLoaded, onToggleFolder, onSelectFile, style }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const fl = e.target.files;
    if (!fl || fl.length === 0) return;
    const tree = buildFileTree(fl);
    onFilesLoaded(tree, fl.length);
    e.target.value = '';
  }

  return (
    <aside className="flex flex-col bg-white border-r" style={{ ...style, borderRightWidth: '0.5px', borderColor: '#e0ddd6', flexShrink: 0 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b" style={{ borderBottomWidth: '0.5px', borderColor: '#e0ddd6' }}>
        <span className="text-xs font-medium uppercase tracking-wider text-gray-400">Files</span>
        <button
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded-md font-medium transition-colors hover:opacity-80"
          style={{ background: '#E6F1FB', color: '#0C447C', border: '0.5px solid #185FA5' }}
        >
          <UploadCloud size={11} />
          Upload
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        // @ts-ignore
        webkitdirectory=""
        multiple
        className="hidden"
        onChange={handleChange}
      />

      {/* Tree or empty state */}
      <div className="flex-1 overflow-y-auto scrollbar-thin py-2 px-1">
        {files.length === 0 ? (
          <button
            onClick={() => inputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-3 w-full h-full min-h-48 rounded-lg border-2 border-dashed border-gray-200 text-gray-400 hover:border-blue-300 hover:text-blue-400 transition-colors p-4"
          >
            <FolderOpen size={28} strokeWidth={1.5} />
            <span className="text-xs text-center leading-relaxed">Upload a folder<br />to begin</span>
          </button>
        ) : (
          files.map(node => (
            <FileTreeNode
              key={node.path}
              node={node}
              depth={0}
              selectedFile={selectedFile}
              expandedFolders={expandedFolders}
              onToggleFolder={onToggleFolder}
              onSelectFile={onSelectFile}
            />
          ))
        )}
      </div>
    </aside>
  );
}
