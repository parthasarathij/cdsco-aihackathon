import type { FileNode } from '../types';

export function buildFileTree(fileList: FileList): FileNode[] {
  const root: FileNode = { name: 'root', type: 'folder', children: [], path: '', extension: '', blobPath: '', file: null };

  for (const file of Array.from(fileList)) {
    const parts = file.webkitRelativePath.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;

      if (isFile) {
        const ext = part.includes('.') ? part.split('.').pop()!.toLowerCase() : '';
        current.children.push({
          name: part,
          path: file.webkitRelativePath,
          type: 'file',
          extension: ext,
          children: [],
          blobPath: file.webkitRelativePath,
          file,
        });
      } else {
        let folder = current.children.find(c => c.type === 'folder' && c.name === part);
        if (!folder) {
          folder = {
            name: part,
            path: parts.slice(0, i + 1).join('/'),
            type: 'folder',
            extension: '',
            children: [],
            blobPath: '',
            file: null,
          };
          current.children.push(folder);
        }
        current = folder;
      }
    }
  }

  sortNodes(root.children);
  return root.children;
}

function sortNodes(nodes: FileNode[]) {
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  nodes.forEach(n => { if (n.type === 'folder') sortNodes(n.children); });
}
