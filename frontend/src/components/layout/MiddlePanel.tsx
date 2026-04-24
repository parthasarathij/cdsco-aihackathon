import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { pdfjs } from 'react-pdf';
import type { FileNode } from '../../types';
import { getRenderableFileUrl, getWordDocumentSourceUrl } from '../../api/workspaceClient';

import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import DocxIframeViewer from '../viewer/DocxIframeViewer';
import PdfVirtualizedViewer from '../viewer/PdfVirtualizedViewer';
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface Props {
  selectedFile: FileNode | null;
  targetPage?: number | null;
  targetSnippet?: string | null;
  jumpToken?: number;
}

function getTagsForFolder(path: string): string[] {
  const p = path.toLowerCase();
  if (p.includes('drug') || p.includes('application')) return ['NDA', 'Phase III', 'CMC'];
  if (p.includes('sae') || p.includes('report')) return ['SAE Report', 'Pharmacovigilance'];
  if (p.includes('meeting') || p.includes('transcript')) return ['Meeting Minutes', 'DTAB'];
  return ['Document', 'Review'];
}

function titleFromName(name: string): string {
  return name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function MiddlePanel({ selectedFile, targetPage = null, targetSnippet = null, jumpToken = 0 }: Props) {
  const DOCUMENT_RENDER_SCALE = 0.72;
  const [plainText, setPlainText] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [panelWidth, setPanelWidth] = useState(720);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pdfViewportRef = useRef<HTMLDivElement>(null);
  const lastMeasuredWidthRef = useRef<number | null>(null);
  const widthRafRef = useRef<number | null>(null);

  const [pdfFileUrl, setPdfFileUrl] = useState<string | null>(null);
  const [docxFileUrl, setDocxFileUrl] = useState<string | null>(null);
  const [docxOfficeUrl, setDocxOfficeUrl] = useState<string | null>(null);
  const [docxFileSize, setDocxFileSize] = useState<number>(0);
  const [audioFileUrl, setAudioFileUrl] = useState<string | null>(null);

  useLayoutEffect(() => {
    const el = pdfViewportRef.current ?? scrollRef.current;
    if (!el) return;
    const measure = () => {
      const next = Math.max(280, Math.min(920, el.clientWidth - 32));
      const prev = lastMeasuredWidthRef.current;
      if (prev !== null && Math.abs(prev - next) < 2) return;
      lastMeasuredWidthRef.current = next;
      setPanelWidth(next);
    };

    const ro = new ResizeObserver(() => {
      if (widthRafRef.current !== null) cancelAnimationFrame(widthRafRef.current);
      widthRafRef.current = requestAnimationFrame(() => {
        widthRafRef.current = null;
        measure();
      });
    });
    ro.observe(el);
    measure();
    return () => {
      ro.disconnect();
      if (widthRafRef.current !== null) cancelAnimationFrame(widthRafRef.current);
      widthRafRef.current = null;
      lastMeasuredWidthRef.current = null;
    };
  }, [selectedFile?.path]);

  useEffect(() => {
    setPdfFileUrl(null);
    setDocxFileUrl(null);
    setDocxOfficeUrl(null);
    setDocxFileSize(0);
    setAudioFileUrl(null);
    setPlainText(null);
    setLoadError(null);
    setLoading(false);

    if (!selectedFile || selectedFile.type === 'folder') return;

    const ext = (selectedFile.extension || '').toLowerCase();
    if (!selectedFile.blobPath) {
      setLoadError('This file is missing a blob path. Please upload again.');
      return;
    }

    let cancelled = false;
    setLoading(true);
    getRenderableFileUrl(selectedFile.blobPath)
      .then(async (url) => {
        if (cancelled) return;
        if (ext === 'pdf') {
          setPdfFileUrl(url);
          setLoading(false);
          return;
        }
        if (ext === 'docx' || ext === 'doc') {
          setDocxFileUrl(url);
          try {
          const sourceUrl = await getWordDocumentSourceUrl(selectedFile.blobPath);
          const officeEmbedUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(sourceUrl)}`;
            setDocxOfficeUrl(officeEmbedUrl);
          } catch {
            setDocxOfficeUrl(null);
          }
          setLoading(false);
          return;
        }
        if (ext === 'txt' || ext === 'csv' || ext === 'md') {
          const response = await fetch(url);
          if (!response.ok) throw new Error('Could not download text file.');
          setPlainText(await response.text());
          setLoading(false);
          return;
        }
        if (ext === 'mp3' || ext === 'wav' || ext === 'ogg' || ext === 'm4a' || ext === 'aac' || ext === 'flac') {
          setAudioFileUrl(url);
          setLoading(false);
          return;
        }
        setLoadError(`Preview is not available for .${ext} files.`);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : 'Could not load this document.');
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedFile?.path, selectedFile?.type, selectedFile?.blobPath, selectedFile?.extension]);

  const useFullBleedViewer = pdfFileUrl !== null || docxFileUrl !== null || audioFileUrl !== null;

  const documentBodyClassic = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-20 text-sm text-gray-400">
          Fetching file from cloud and preparing preview...
        </div>
      );
    }
    if (loadError) {
      return (
        <div
          className="rounded-lg px-4 py-3 text-sm text-amber-900"
          style={{ background: '#FFFBEB', border: '0.5px solid #D97706' }}
        >
          {loadError}
        </div>
      );
    }
    if (plainText !== null) {
      return (
        <pre className="text-sm leading-relaxed whitespace-pre-wrap font-mono text-gray-700">{plainText}</pre>
      );
    }
    if (audioFileUrl !== null) {
      return (
        <div className="flex flex-col items-center justify-center py-12 space-y-6">
          <div className="text-6xl opacity-60">🎵</div>
          <div className="text-sm text-gray-600 font-medium">{selectedFile?.name || 'Audio File'}</div>
          <audio controls className="w-full max-w-md" style={{ outline: 'none' }}>
            <source src={audioFileUrl} />
            Your browser does not support the audio element.
          </audio>
        </div>
      );
    }
    return (
      <div className="text-sm text-gray-500">
        No preview for this file type. Supported: PDF, DOCX, DOC, TXT, CSV, MD, Audio (MP3, WAV, OGG).
      </div>
    );
  };

  if (!selectedFile) {
    return (
      <main className="flex-1 flex items-center justify-center bg-gray-50 text-gray-400">
        <div className="text-center">
          <div className="text-4xl mb-3 opacity-30">📄</div>
          <p className="text-sm">Select a file from the left panel</p>
        </div>
      </main>
    );
  }

  if (selectedFile.type === 'folder') {
    return (
      <main className="flex-1 flex flex-col bg-white overflow-hidden">
        <div
          className="flex items-center gap-1 px-4 py-2 border-b text-xs text-gray-400"
          style={{ borderBottomWidth: '0.5px', borderColor: '#e0ddd6' }}
        >
          <span className="text-gray-700 font-medium">{selectedFile.name}</span>
          <span className="text-gray-300">›</span>
          <span className="text-gray-500">folder</span>
        </div>
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm px-6 text-center">
          Select a document inside this folder to show it here.
        </div>
      </main>
    );
  }

  const parts = selectedFile.path.split('/');
  const title = titleFromName(selectedFile.name);
  const tags = getTagsForFolder(selectedFile.path);
  const ext = (selectedFile.extension || '').toLowerCase();

  return (
    <main className="flex-1 flex flex-col bg-white overflow-hidden min-w-0 min-h-0 h-full">
      <div
        className="flex items-center gap-1 px-4 py-2 border-b text-xs text-gray-400 flex-shrink-0"
        style={{ borderBottomWidth: '0.5px', borderColor: '#e0ddd6' }}
      >
        {parts.map((part, i) => (
          <span key={i} className="flex items-center gap-1 min-w-0">
            {i > 0 && <span className="text-gray-300 flex-shrink-0">›</span>}
            <span className={i === parts.length - 1 ? 'text-gray-700 font-medium truncate' : 'truncate'}>{part}</span>
          </span>
        ))}
      </div>

      {useFullBleedViewer ? (
        <div
          ref={pdfViewportRef}
          className="flex-1 min-h-0 flex flex-col relative overflow-y-auto items-center gap-3 py-4 bg-neutral-100"
        >
          {loadError && (
            <div
              className="flex-shrink-0 mx-3 rounded-lg px-3 py-2 text-xs text-red-800"
              style={{ background: '#FEE2E2', border: '0.5px solid #DC2626' }}
            >
              {loadError}
            </div>
          )}

          {pdfFileUrl && (
            <PdfVirtualizedViewer
              file={pdfFileUrl}
              fileName={selectedFile.name}
              panelWidth={Math.round(panelWidth * DOCUMENT_RENDER_SCALE)}
              targetPage={targetPage}
              targetSnippet={targetSnippet}
              jumpToken={jumpToken}
            />
          )}

          {docxFileUrl && (
            <div className="w-full max-w-[920px] flex flex-col gap-3 px-2">
              <DocxIframeViewer
                fileUrl={docxFileUrl}
                officeEmbedUrl={docxOfficeUrl ?? undefined}
                fileName={selectedFile.name}
                fileSize={docxFileSize}
                compact
                compactScale={DOCUMENT_RENDER_SCALE}
                targetPage={targetPage}
                targetSnippet={targetSnippet}
                jumpToken={jumpToken}
              />
            </div>
          )}

          {audioFileUrl && (
            <div className="w-full max-w-[920px] flex flex-col items-center justify-center px-2 py-12 space-y-6">
              <div className="text-8xl opacity-60">🎵</div>
              <div className="text-lg text-gray-700 font-semibold">{selectedFile.name}</div>
              <audio controls className="w-full max-w-lg" style={{ outline: 'none' }}>
                <source src={audioFileUrl} />
                Your browser does not support the audio element.
              </audio>
            </div>
          )}
        </div>
      ) : (
        <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin px-6 py-5 min-h-0">
          <div className="mb-5 pb-4 border-b" style={{ borderBottomWidth: '0.5px', borderColor: '#e8e6e0' }}>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: '#E6F1FB', color: '#0C447C', border: '0.5px solid #185FA5' }}
                >
                  {tag}
                </span>
              ))}
            </div>
            <h1 className="text-lg font-medium text-gray-800 mb-1 break-words">{title}</h1>
            <div className="flex flex-wrap gap-4 text-xs text-gray-400">
              <span>Format: {ext ? ext.toUpperCase() : 'FILE'}</span>
              <span>Original document preview</span>
            </div>
          </div>
          {documentBodyClassic()}
        </div>
      )}
    </main>
  );
}
