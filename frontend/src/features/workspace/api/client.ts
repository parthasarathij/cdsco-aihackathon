import type { FileNode } from '../../../types';
import { getApiOrigin, setApiOrigin } from '../../../shared/api/base';

function apiOrigin(): string {
  return getApiOrigin();
}

async function fetchWithOriginFallback(path: string, init: RequestInit): Promise<Response> {
  const primaryOrigin = apiOrigin();
  try {
    const response = await fetch(`${primaryOrigin}${path}`, init);
    setApiOrigin(primaryOrigin);
    return response;
  } catch (primaryError) {
    // Use a single deterministic fallback in case configured/cached host is stale.
    if (primaryOrigin !== 'http://127.0.0.1:8000') {
      const fallbackOrigin = 'http://127.0.0.1:8000';
      try {
        const response = await fetch(`${fallbackOrigin}${path}`, init);
        setApiOrigin(fallbackOrigin);
        return response;
      } catch (fallbackError) {
        throw fallbackError instanceof Error ? fallbackError : new Error('Failed to connect to backend.');
      }
    }
    throw primaryError instanceof Error ? primaryError : new Error('Failed to connect to backend.');
  }
}

interface UploadTreeResponse {
  tree: FileNode[];
  uploadedCount: number;
  rootPath?: string;
}

interface BlobTreeResponse {
  tree: FileNode[];
  count: number;
  prefix: string;
}

export interface CompletenessItemRow {
  module: string;
  checklist_title: string;
  applicability: 'Mandatory' | 'Conditional' | 'Optional' | string;
  status: 'matched' | 'needs_user_confirmation' | 'missing' | string;
}

export interface VersionCheckerItem {
  document_added: string;
  path_in_zip: string;
  Description: string | null;
}

export interface VersionCheckerResponse {
  only_in_zip_a: VersionCheckerItem[];
  only_in_zip_b: VersionCheckerItem[];
}

export interface ConsistencyCheckResult {
  [fieldName: string]: string; 
  consistency: string; 
}

export interface ConsistencyCheckResponse extends Array<ConsistencyCheckResult> {}

interface CompletenessModuleReport {
  items?: Array<{
    module: string;
    checklist_title: string;
    applicability: string;
    status: string;
  }>;
}

interface CompletenessResponse {
  modules?: Record<string, CompletenessModuleReport>;
}

export interface SummarizationFieldSource {
  file?: string;
  page?: number;
  chunk_id?: string;
  text_snippet?: string;
  section?: string;
  reason?: string;
}

export interface SummarizationFieldValue {
  value?: string | number | boolean | null;
  confidence?: string;
  source?: SummarizationFieldSource[];
}

export type SummarizationResponse = Record<string, SummarizationFieldValue | Record<string, SummarizationFieldValue> | unknown>;

export interface UploadProgress {
  uploaded: number;
  total: number;
  currentFile: string;
}

function extractLastPathSegment(path?: string): string {
  if (!path) return '';
  const segments = path
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);
  return segments.length ? segments[segments.length - 1] : '';
}

export async function uploadFolderToBackend(
  files: FileList | File[], 
  onProgress?: (progress: UploadProgress) => void
): Promise<UploadTreeResponse> {
  const fileArray = Array.from(files);
  const totalSize = fileArray.reduce((acc, f) => acc + f.size, 0);
  let uploadedSize = 0;
  let rootFolder = '';

  // Determine the root folder from the first file's path
  if (fileArray.length > 0) {
    const firstRelPath = (fileArray[0] as any).webkitRelativePath || fileArray[0].name;
    const parts = firstRelPath.split('/');
    if (parts.length > 1) {
      rootFolder = parts[0];
    }
  }

  // Upload files sequentially for maximum stability during large transfers (100GB+)
  const CONCURRENCY = 1;
  const results: string[] = [];
  const uploadErrors: string[] = [];

  for (let i = 0; i < fileArray.length; i += CONCURRENCY) {
    const batch = fileArray.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (file) => {
      const relPath = (file as any).webkitRelativePath || file.name;
      const form = new FormData();
      form.append('file', file);
      form.append('relative_path', relPath);
      if (rootFolder) {
        form.append('root_folder', rootFolder);
      }

      try {
        const res = await fetchWithOriginFallback('/upload/file', {
          method: 'POST',
          body: form,
        });

        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          uploadErrors.push(`Failed to upload ${relPath}: ${payload.detail || payload.message || 'Unknown error'}`);
          return;
        }

        const data = await res.json().catch(() => null);
        const blobPath = data?.blobPath as string | undefined;
        if (blobPath) results.push(blobPath);

        uploadedSize += file.size;
        if (onProgress) {
          onProgress({
            uploaded: uploadedSize,
            total: totalSize,
            currentFile: relPath,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        uploadErrors.push(`Failed to upload ${relPath}: ${message}`);
      }
    }));
  }

  if (results.length === 0) {
    throw new Error(uploadErrors[0] || 'No files were uploaded.');
  }

  // Once all files are uploaded, try to get the final tree.
  // Do not fail the entire upload flow if tree fetch is temporarily unavailable.
  let treeRes: BlobTreeResponse = { tree: [], count: 0, prefix: rootFolder || '' };
  try {
    treeRes = await fetchWorkspaceTree(undefined, rootFolder || undefined);
  } catch (_error) {
    // Workspace page will attempt to load the tree again.
  }

  const inferredRootFolder = extractLastPathSegment(treeRes.prefix) || rootFolder;

  return {
    tree: treeRes.tree,
    uploadedCount: fileArray.length,
    rootPath: inferredRootFolder
  };
}

export async function uploadZipToBackend(zipFile: File): Promise<UploadTreeResponse> {
  const form = new FormData();
  form.append('zip_file', zipFile);
  const res = await fetchWithOriginFallback('/upload/zip', { method: 'POST', body: form });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.detail || payload.message || 'ZIP upload failed.');
  }
  return res.json();
}

export async function getRenderableFileUrl(blobPath: string): Promise<string> {
  const url = new URL(`${apiOrigin()}/file`);
  url.searchParams.set('path', blobPath);
  return url.toString();
}

async function fetchBlobFileWithRetry(
  blobPath: string,
  filename?: string,
  maxRetries = 3
): Promise<File> {
  const url = new URL(`${apiOrigin()}/file`);
  url.searchParams.set('path', blobPath);

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Exponential backoff: 100ms, 200ms, 400ms
    if (attempt > 0) {
      const delay = 100 * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2 * 60 * 1000); // 2 minute timeout

    try {
      const res = await fetch(url.toString(), {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.detail || payload.message || 'Failed to download file from blob.');
      }
      const blob = await res.blob();
      const inferredName = filename || blobPath.split('/').filter(Boolean).pop() || 'document.bin';
      return new File([blob], inferredName, { type: blob.type || 'application/octet-stream' });
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on abort errors (timeout) or if this is the last attempt
      if (attempt === maxRetries) {
        throw lastError;
      }

      // Continue to next retry attempt
    }
  }

  throw lastError || new Error('Failed to download file from blob after retries.');
}

export async function fetchBlobFile(blobPath: string, filename?: string): Promise<File> {
  return fetchBlobFileWithRetry(blobPath, filename, 3);
}

export async function runCompletenessCheck(zipFile: File): Promise<CompletenessItemRow[]> {
  const form = new FormData();
  form.append('zip_file', zipFile);
  const res = await fetch(`${apiOrigin()}/completeness`, { method: 'POST', body: form });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.detail || payload.message || 'Completeness check failed.');
  }

  const payload = (await res.json()) as CompletenessResponse;
  const rows: CompletenessItemRow[] = [];
  const modules = payload.modules || {};
  for (const moduleReport of Object.values(modules)) {
    const items = moduleReport.items || [];
    for (const item of items) {
      rows.push({
        module: item.module,
        checklist_title: item.checklist_title,
        applicability: item.applicability,
        status: item.status,
      });
    }
  }
  return rows;
}

export async function runVersionChecker(zipA: File, zipB: File): Promise<VersionCheckerResponse> {
  const form = new FormData();
  form.append('zip_a', zipA);
  form.append('zip_b', zipB);

  const res = await fetch(`${apiOrigin()}/version-checker`, { method: 'POST', body: form });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.detail || payload.message || 'Version check failed.');
  }
  return res.json();
}

export async function runConsistencyCheck(zipFile: File): Promise<ConsistencyCheckResponse> {
  const form = new FormData();
  form.append('zip_file', zipFile);
  const res = await fetch(`${apiOrigin()}/dossier-checker/upload`, { method: 'POST', body: form });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.detail || payload.message || 'Consistency check failed.');
  }
  return res.json();
}

/**
 * Run consistency check entirely server-side by sending blob paths directly.
 * Eliminates the need to download hundreds of files individually to the browser.
 */
export async function runConsistencyCheckFromBlob(blobPaths: string[]): Promise<ConsistencyCheckResponse> {
  const res = await fetch(`${apiOrigin()}/consistency-check-from-blob`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths: blobPaths }),
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.detail || payload.message || 'Consistency check from blob failed.');
  }
  return res.json();
}

/**
 * Create a ZIP file server-side from blob paths, returning it as a File.
 * Avoids downloading hundreds of files individually to the browser.
 */
export async function createZipFromBlob(blobPaths: string[], zipName?: string): Promise<File> {
  const res = await fetch(`${apiOrigin()}/create-zip-from-blob`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths: blobPaths, zip_name: zipName || 'blob-archive.zip' }),
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.detail || payload.message || 'Failed to create ZIP from blob.');
  }
  const blob = await res.blob();
  return new File([blob], zipName || 'blob-archive.zip', { type: 'application/zip' });
}

export async function getWordDocumentSourceUrl(blobPath: string): Promise<string> {
  const url = new URL(`${apiOrigin()}/file-url`);
  url.searchParams.set('path', blobPath);
  const res = await fetch(url.toString(), { method: 'GET' });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.detail || payload.message || 'Failed to load Word document URL.');
  }
  const payload = (await res.json()) as { url: string };
  if (!payload.url) throw new Error('Backend did not return a file URL.');
  return payload.url;
}

export async function fetchWorkspaceTree(prefix?: string, rootFolder?: string): Promise<BlobTreeResponse> {
  const url = new URL(`${apiOrigin()}/tree`);
  if (prefix) url.searchParams.set('prefix', prefix);
  if (rootFolder) url.searchParams.set('root_folder', rootFolder);
  const res = await fetchWithOriginFallback(`/tree${url.search}`, { method: 'GET' });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.detail || payload.message || 'Failed to fetch workspace tree.');
  }
  return res.json();
}

export async function clearWorkspace(): Promise<{ deleted: number; message: string }> {
  const url = new URL(`${apiOrigin()}/clear`);
  const res = await fetch(url.toString(), { method: 'DELETE' });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.detail || payload.message || 'Failed to clear workspace.');
  }
  return res.json();
}

export async function runSummarization(files: File[], taskType = 'application_document_summarization'): Promise<SummarizationResponse> {
  const payload = await runSummarizationByEndpoint(files, '/api/v1/summarize/', taskType);
  return payload as SummarizationResponse;
}

export async function runSummarizationByEndpoint(
  files: File[],
  endpoint: '/api/v1/summarize/' | '/api/v1/sae_summarize/' | '/api/v1/meeting_summarize/',
  taskType?: string,
): Promise<unknown> {
  if (!files.length) {
    throw new Error('At least one file is required for summarization.');
  }
  const form = new FormData();
  for (const file of files) {
    form.append('files', file, file.name);
  }
  if (taskType) form.append('task_type', taskType);
  const res = await fetch(`${apiOrigin()}${endpoint}`, { method: 'POST', body: form });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.detail || payload.message || 'Summarization failed.');
  }
  return res.json();
}

export interface OtherFilesSummaryResult {
  summary: SummarizationResponse | unknown;
  blobPaths: string[];
  fileNames: string[];
}

export async function runOtherFilesSummarization(
  files: File[],
  summaryType: 'application' | 'sae' | 'meeting'
): Promise<OtherFilesSummaryResult> {
  if (!files.length) {
    throw new Error('At least one file is required for summarization.');
  }
  const form = new FormData();
  for (const file of files) {
    form.append('files', file, file.name);
  }
  form.append('summary_type', summaryType);
  
  const res = await fetch(`${apiOrigin()}/summarize-other-files`, {
    method: 'POST',
    body: form,
  });
  
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.detail || payload.message || 'Summarization failed.');
  }
  return res.json();
}