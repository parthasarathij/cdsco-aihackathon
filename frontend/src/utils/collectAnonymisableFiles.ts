import type { FileNode } from '../types';

const EXT = new Set(['docx', 'pdf']);

export function isAnonymisableFile(node: FileNode): boolean {
  if (node.type !== 'file') return false;
  const ext = (node.extension || '').toLowerCase();
  return EXT.has(ext);
}

export function collectAnonymisableFiles(nodes: FileNode[]): FileNode[] {
  const out: FileNode[] = [];
  const walk = (n: FileNode[]) => {
    for (const x of n) {
      if (x.type === 'folder') walk(x.children);
      else if (isAnonymisableFile(x)) out.push(x);
    }
  };
  walk(nodes);
  return out;
}
