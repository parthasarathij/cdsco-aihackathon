import { ChevronRight, ChevronDown, FileText, Table, AlignLeft, Music, File, Folder } from 'lucide-react';
import type { FileNode } from '../../types';

if (typeof window !== 'undefined' && !(window as any).__fileStore) {
  (window as any).__fileStore = new Map();
}

interface Props {
  node: FileNode;
  depth: number;
  selectedFile: FileNode | null;
  expandedFolders: Record<string, boolean>;
  onToggleFolder: (path: string) => void;
  onSelectFile: (node: FileNode) => void;
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

export default function FileTreeNode({ node, depth, selectedFile, expandedFolders, onToggleFolder, onSelectFile }: Props) {
  const isExpanded = expandedFolders[node.path];
  const isSelected = selectedFile?.path === node.path;

  if (node.type === 'folder') {
    return (
      <div>
        <button
          onClick={() => onToggleFolder(node.path)}
          className="flex items-center gap-1.5 w-full text-left px-2 py-1 rounded hover:bg-gray-100 text-gray-700 font-medium"
          style={{ paddingLeft: `${8 + depth * 12}px` }}
        >
          {isExpanded ? <ChevronDown size={12} className="text-gray-400 shrink-0" /> : <ChevronRight size={12} className="text-gray-400 shrink-0" />}
          <Folder size={13} className="text-amber-500 shrink-0" />
          <span className="truncate text-xs">{node.name}</span>
        </button>
        {isExpanded && node.children.map(child => (
          <FileTreeNode
            key={child.path}
            node={child}
            depth={depth + 1}
            selectedFile={selectedFile}
            expandedFolders={expandedFolders}
            onToggleFolder={onToggleFolder}
            onSelectFile={onSelectFile}
          />
        ))}
      </div>
    );
  }

  return (
    <button
      draggable={node.type === 'file'}
      onDragStart={(e) => {
        if (node.type === 'file') {
          // Generate a unique key for this file
          const fileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          // Store the file object or just the name for retrieval during drop
          const fileStore = (window as any).__fileStore;
          fileStore.set(fileId, { file: node.file, name: node.name, blobPath: node.blobPath });
          // Pass the ID through dataTransfer
          e.dataTransfer!.effectAllowed = 'copy';
          e.dataTransfer!.setData('text/plain', fileId);
          e.dataTransfer!.setData('text/x-fileid', fileId);
        }
      }}
      onClick={() => onSelectFile(node)}
      className="flex items-center gap-1.5 w-full text-left px-2 py-1.5 rounded text-gray-700 transition-colors hover:bg-gray-50"
      style={{
        paddingLeft: `${8 + depth * 12}px`,
        background: isSelected ? '#E6F1FB' : undefined,
        color: isSelected ? '#0C447C' : undefined,
        cursor: node.type === 'file' ? 'move' : 'default',
      }}
    >
      {getFileIcon(node.extension)}
      <span className="truncate text-xs flex-1 min-w-0">{node.name}</span>
      {getBadge(node.extension)}
    </button>
  );
}
