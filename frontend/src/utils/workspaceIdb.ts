import type { FileNode } from '../types';

const DB_NAME = 'cdsco-workspace-v1';
const STORE = 'blobs';
const DB_VERSION = 1;

interface BlobRecord {
  path: string;
  name: string;
  type: string;
  data: ArrayBuffer;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'path' });
      }
    };
  });
}

/** Tree safe for JSON.stringify → localStorage (no File binary). */
export function stripFilesForStorage(nodes: FileNode[]): FileNode[] {
  return nodes.map((n) =>
    n.type === 'folder'
      ? {
          name: n.name,
          path: n.path,
          type: 'folder' as const,
          extension: n.extension,
          blobPath: n.blobPath || '',
          children: stripFilesForStorage(n.children),
          file: null,
        }
      : {
          name: n.name,
          path: n.path,
          type: 'file' as const,
          extension: n.extension,
          blobPath: n.blobPath || n.path,
          children: [],
          file: null,
        },
  );
}

async function collectBlobRecords(nodes: FileNode[]): Promise<BlobRecord[]> {
  const out: BlobRecord[] = [];
  const walk = async (list: FileNode[]) => {
    for (const n of list) {
      if (n.type === 'folder') await walk(n.children);
      else if (n.file instanceof File) {
        const data = await n.file.arrayBuffer();
        out.push({
          path: n.path,
          name: n.name,
          type: n.file.type || 'application/octet-stream',
          data,
        });
      }
    }
  };
  await walk(nodes);
  return out;
}

/** Save all file binaries keyed by path (call after uploads / tree changes). */
export async function persistWorkspaceBlobs(nodes: FileNode[]): Promise<void> {
  const records = await collectBlobRecords(nodes);
  if (records.length === 0) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    for (const r of records) store.put(r);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getBlobRecord(path: string): Promise<BlobRecord | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const r = tx.objectStore(STORE).get(path);
    r.onsuccess = () => resolve(r.result as BlobRecord | undefined);
    r.onerror = () => reject(r.error);
  });
}

/** Re-attach `File` objects from IndexedDB after reload (one short read tx per file). */
export async function hydrateWorkspaceTree(nodes: FileNode[]): Promise<FileNode[]> {
  async function clone(n: FileNode): Promise<FileNode> {
    if (n.type === 'folder') {
      return { ...n, children: await Promise.all(n.children.map(clone)), file: null };
    }
    const rec = await getBlobRecord(n.path);
    if (rec?.data) {
      const file = new File([rec.data], rec.name || n.name, { type: rec.type || 'application/octet-stream' });
      return { ...n, children: [], file };
    }
    return { ...n, children: [], file: null };
  }
  return Promise.all(nodes.map(clone));
}

export async function clearWorkspaceIdb(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* ignore if DB never opened */
  }
}
