import type { AnonymisationJsonReport } from '../../../types/anonymisation';
import { getApiOrigin } from '../../../shared/api/base';

function apiOrigin(): string {
  return getApiOrigin();
}

export async function fileFromBlobPath(blobPath: string, fallbackName: string): Promise<File> {
  const url = new URL(`${apiOrigin()}/file`);
  url.searchParams.set('path', blobPath);
  const res = await fetch(url.toString(), { method: 'GET' });
  if (!res.ok) throw new Error(await readError(res));
  const blob = await res.blob();
  const type = blob.type || 'application/octet-stream';
  return new File([blob], fallbackName, { type });
}

function parseErrorDetail(data: unknown): string {
  if (data == null) return 'Request failed';
  if (typeof data === 'string') return data;
  if (typeof data === 'object' && data !== null && 'detail' in data) {
    const d = (data as { detail: unknown }).detail;
    if (typeof d === 'string') return d;
    if (Array.isArray(d)) return d.map((x) => (typeof x === 'object' && x && 'msg' in x ? String((x as { msg: unknown }).msg) : JSON.stringify(x))).join('; ');
  }
  try {
    return JSON.stringify(data);
  } catch {
    return 'Request failed';
  }
}

async function readError(res: Response): Promise<string> {
  try {
    const j = await res.json();
    return parseErrorDetail(j);
  } catch {
    return res.statusText || `HTTP ${res.status}`;
  }
}


export async function postAnonymisationJson(file: File): Promise<AnonymisationJsonReport> {
  const fd = new FormData();
  fd.append('file', file, file.name);
  fd.append('mode', 'both');
  fd.append('return_mapping', 'true');

  const res = await fetch(`${apiOrigin()}/anonymisation/upload-docx/json`, {
    method: 'POST',
    body: fd,
  });

  if (!res.ok) throw new Error(await readError(res));
  return res.json() as Promise<AnonymisationJsonReport>;
}

/**
 * Pseudo-anonymised file (binary DOCX or PDF).
 */
export async function postAnonymisationPseudo(file: File): Promise<Blob> {
  const fd = new FormData();
  fd.append('file', file, file.name);
  const res = await fetch(`${apiOrigin()}/anonymisation/upload-docx/pseudo`, {
    method: 'POST',
    body: fd,
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.blob();
}

/**
 * Fully anonymised file (binary DOCX or PDF).
 */
export async function postAnonymisationFull(file: File): Promise<Blob> {
  const fd = new FormData();
  fd.append('file', file, file.name);
  const res = await fetch(`${apiOrigin()}/anonymisation/upload-docx/full`, {
    method: 'POST',
    body: fd,
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.blob();
}

export async function postAnonymisationPseudoWithPath(file: File): Promise<{ blob: Blob; blobPath: string | null }> {
  const fd = new FormData();
  fd.append('file', file, file.name);
  const res = await fetch(`${apiOrigin()}/anonymisation/upload-docx/pseudo`, {
    method: 'POST',
    body: fd,
  });
  if (!res.ok) throw new Error(await readError(res));
  const blob = await res.blob();
  const blobPath = res.headers.get('X-Blob-Path');
  return { blob, blobPath };
}

export async function postAnonymisationFullWithPath(file: File): Promise<{ blob: Blob; blobPath: string | null }> {
  const fd = new FormData();
  fd.append('file', file, file.name);
  const res = await fetch(`${apiOrigin()}/anonymisation/upload-docx/full`, {
    method: 'POST',
    body: fd,
  });
  if (!res.ok) throw new Error(await readError(res));
  const blob = await res.blob();
  const blobPath = res.headers.get('X-Blob-Path');
  return { blob, blobPath };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export type AnonymisationPipelineStep = 'json' | 'pseudo' | 'full';

/**
 * For one selected file: call JSON → pseudo → full in order (same file uploaded three times).
 * Use the returned blobs for instant downloads on the results page without re-hitting the API.
 */
export async function runAnonymisationRoutesForFile(
  file: File,
  onStep?: (step: AnonymisationPipelineStep) => void,
): Promise<{
  report: AnonymisationJsonReport;
  pseudoBlob: Blob;
  pseudoBlobPath: string | null;
  fullBlob: Blob;
  fullBlobPath: string | null;
}> {
  onStep?.('json');
  const report = await postAnonymisationJson(file);
  onStep?.('pseudo');
  const { blob: pseudoBlob, blobPath: pseudoBlobPath } = await postAnonymisationPseudoWithPath(file);
  onStep?.('full');
  const { blob: fullBlob, blobPath: fullBlobPath } = await postAnonymisationFullWithPath(file);
  return { report, pseudoBlob, pseudoBlobPath, fullBlob, fullBlobPath };
}
