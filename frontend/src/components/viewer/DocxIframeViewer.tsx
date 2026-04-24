import { useEffect, useMemo, useRef, useState } from 'react';
import { renderAsync } from 'docx-preview';

interface Props {
  fileUrl: string;
  officeEmbedUrl?: string;
  fileName: string;
  fileSize?: number;
  compact?: boolean;
  compactScale?: number;
  targetPage?: number | null;
  targetSnippet?: string | null;
  jumpToken?: number;
}


function normalizeText(value: string): string {
  return value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

function clearHighlights(root: HTMLElement) {
  root.querySelectorAll('[data-docx-highlight="true"]').forEach((node) => {
    const el = node as HTMLSpanElement;
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
    parent.normalize();
  });
}

function normalizeWithMap(input: string): { normalized: string; map: number[] } {
  let normalized = '';
  const map: number[] = [];
  let prevWasSpace = true;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const isSpace = /\s/.test(ch) || /[\u0000-\u001F\u007F]/.test(ch) || /[^a-zA-Z0-9]/.test(ch);
    if (isSpace) {
      if (!prevWasSpace) {
        normalized += ' ';
        map.push(i);
      }
      prevWasSpace = true;
    } else {
      normalized += ch.toLowerCase();
      map.push(i);
      prevWasSpace = false;
    }
  }
  if (normalized.endsWith(' ')) {
    normalized = normalized.slice(0, -1);
    map.pop();
  }
  return { normalized, map };
}

function normalizeSnippetForMatch(snippet: string): string {
  return (snippet || '').replace(/(\.\.\.|…)+/g, ' ');
}

function highlightRangeInTextNodes(textNodes: Text[], start: number, end: number): HTMLElement | null {
  let offset = 0;
  let firstHighlight: HTMLElement | null = null;
  for (const textNode of textNodes) {
    const value = textNode.nodeValue || '';
    const nodeStart = offset;
    const nodeEnd = offset + value.length;
    offset = nodeEnd;
    if (nodeEnd <= start || nodeStart >= end) continue;

    const localStart = Math.max(0, start - nodeStart);
    const localEnd = Math.min(value.length, end - nodeStart);
    if (localStart >= localEnd) continue;

    const after = textNode.splitText(localEnd);
    const middle = textNode.splitText(localStart);
    const mark = document.createElement('span');
    mark.setAttribute('data-docx-highlight', 'true');
    mark.style.background = '#FDE68A';
    mark.style.outline = '2px solid #F59E0B';
    mark.style.borderRadius = '2px';
    mark.style.padding = '2px 1px';
    mark.style.boxShadow = '0 0 0 2px #F59E0B';
    middle.parentNode?.insertBefore(mark, middle);
    mark.appendChild(middle);
    if (!firstHighlight) firstHighlight = mark;

    // Continue scanning with remaining text node after split.
    if (!after.parentNode) break;
  }
  return firstHighlight;
}

function highlightSnippetInElement(el: HTMLElement, snippet: string): HTMLElement | null {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let fullRaw = '';
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const value = node.nodeValue || '';
    if (!value) continue;
    nodes.push(node);
    fullRaw += value;
  }
  if (!nodes.length || !fullRaw.trim()) return null;

  const { normalized: haystack, map } = normalizeWithMap(fullRaw);
  const { normalized: needle } = normalizeWithMap(normalizeSnippetForMatch(snippet));
  if (!needle) return null;
  const idx = haystack.indexOf(needle);
  if (idx < 0) return null;
  const rawStart = map[idx];
  const rawEnd = map[idx + needle.length - 1] + 1;
  return highlightRangeInTextNodes(nodes, rawStart, rawEnd);
}

function highlightAndScroll(root: HTMLElement, snippet: string | null, targetPage: number | null) {
  const normalizedSnippet = normalizeText(snippet || '');
  if (normalizedSnippet) {
      const globalMark = highlightSnippetInElement(root, snippet || '');
    if (globalMark) {
      globalMark.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const candidates = Array.from(root.querySelectorAll('p,span,div,li,td,h1,h2,h3,h4,h5,h6')) as HTMLElement[];
      for (const candidate of candidates) {
      const text = normalizeText(candidate.textContent || '');
      if (!text) continue;
      const firstMark = highlightSnippetInElement(candidate, snippet || '');
      if (firstMark) {
        firstMark.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }
  }

  if (targetPage && targetPage > 1) {
    const pageBlocks = root.querySelectorAll('.docx-wrapper > section, .docx section');
    if (pageBlocks.length >= targetPage) {
      (pageBlocks[targetPage - 1] as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
  }

  if (targetPage === 1) {
    root.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

export default function DocxIframeViewer({
  fileUrl,
  officeEmbedUrl,
  fileName,
  fileSize = 0,
  compact = false,
  compactScale = 0.82,
  targetPage = null,
  targetSnippet = null,
  jumpToken = 0,
}: Props) {
  const [status, setStatus] = useState<'loading' | 'rendered' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [useOfficeFallback, setUseOfficeFallback] = useState(false);
  const localRootRef = useRef<HTMLDivElement>(null);
  const isOfficeEmbed = useMemo(
    () => useOfficeFallback || /view\.officeapps\.live\.com/i.test(fileUrl),
    [fileUrl, useOfficeFallback],
  );
  const iframeUrl = useMemo(() => {
    if (/view\.officeapps\.live\.com/i.test(fileUrl)) return fileUrl;
    return officeEmbedUrl || fileUrl;
  }, [fileUrl, officeEmbedUrl]);

  useEffect(() => {
    if (isOfficeEmbed) return;
    const mount = localRootRef.current;
    if (!mount) return;
    let cancelled = false;
    setStatus('loading');
    setErrorMsg('');
    setUseOfficeFallback(false);

    const run = async () => {
      try {
        const response = await fetch(fileUrl, { method: 'GET' });
        if (!response.ok) {
          throw new Error(`Failed to load DOCX (${response.status})`);
        }
        const buffer = await response.arrayBuffer();
        mount.innerHTML = '';
        await renderAsync(buffer, mount, undefined, {
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          breakPages: true,
          renderHeaders: true,
          renderFooters: true,
        });
        if (cancelled) return;
        clearHighlights(mount);
        highlightAndScroll(mount, targetSnippet, targetPage);
        setStatus('rendered');
      } catch (err) {
        if (cancelled) return;
           if (officeEmbedUrl) {
          setUseOfficeFallback(true);
          setStatus('loading');
          setErrorMsg('');
        } else {
          setErrorMsg(err instanceof Error ? err.message : 'Could not render Word preview.');
          setStatus('error');
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [fileUrl, isOfficeEmbed, officeEmbedUrl]);

  useEffect(() => {
    if (isOfficeEmbed) return;
    if (status !== 'rendered') return;
    const mount = localRootRef.current;
    if (!mount) return;
    clearHighlights(mount);
    highlightAndScroll(mount, targetSnippet, targetPage);
  }, [targetPage, targetSnippet, jumpToken, status, isOfficeEmbed]);

  return (
    <div className="w-full flex flex-col gap-2">
      {/* Toolbar */}
      <div
        className="w-full max-w-[920px] self-center px-3 py-2 rounded-lg flex items-center justify-between gap-3 text-xs text-gray-600 bg-white"
        style={{ border: '0.5px solid #E5E7EB' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="truncate font-medium">{fileName}</span>
          <span className="text-gray-300">•</span>
          {fileSize > 0 && (
            <span className="text-gray-500 whitespace-nowrap">{(fileSize / (1024 * 1024)).toFixed(1)} MB</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {status === 'loading' && (
            <span className="text-gray-400 italic">Loading Word document…</span>
          )}
          {status === 'rendered' && (
            <span className="text-green-600">✓ Rendered</span>
          )}
          {status === 'error' && (
            <span className="text-red-500">⚠ Render error</span>
          )}
        </div>
      </div>

      {status === 'error' && (
        <div
          className="w-full max-w-[920px] self-center rounded-lg px-3 py-2 text-xs text-red-800"
          style={{ background: '#FEE2E2', border: '0.5px solid #DC2626' }}
        >
          {errorMsg || 'Failed to render DOCX.'}
        </div>
      )}

      {isOfficeEmbed ? (
        compact ? (
          <div
            style={{
              width: '100%',
              minHeight: '600px',
              height: '70vh',
              border: 'none',
              borderRadius: '8px',
              background: '#fff',
              display: 'block',
              overflow: 'auto',
            }}
          >
            <iframe
              title="DOCX Preview"
              src={iframeUrl}
              onLoad={() => setStatus('rendered')}
              onError={() => {
                setErrorMsg('Could not load Word preview.');
                setStatus('error');
              }}
              style={{
                width: `${100 / compactScale}%`,
                height: `${100 / compactScale}%`,
                border: 'none',
                borderRadius: '8px',
                background: '#fff',
                display: 'block',
                transform: `scale(${compactScale})`,
                transformOrigin: 'top left',
              }}
            />
          </div>
        ) : (
          <iframe
            title="DOCX Preview"
            src={iframeUrl}
            onLoad={() => setStatus('rendered')}
            onError={() => {
              setErrorMsg('Could not load Word preview.');
              setStatus('error');
            }}
            style={{
              width: '100%',
              minHeight: '600px',
              height: '70vh',
              border: 'none',
              borderRadius: '8px',
              background: '#fff',
              display: 'block',
            }}
          />
        )
      ) : compact ? (
        <div
          style={{
            width: '100%',
            minHeight: '600px',
            height: '70vh',
            border: 'none',
            borderRadius: '8px',
            background: '#fff',
            display: 'block',
            overflow: 'auto',
          }}
        >
          <div
            ref={localRootRef}
            style={{
              width: `${100 / compactScale}%`,
              minHeight: `${100 / compactScale}%`,
              border: 'none',
              borderRadius: '8px',
              background: '#fff',
              display: 'block',
              transform: `scale(${compactScale})`,
              transformOrigin: 'top left',
              overflow: 'auto',
            }}
          />
        </div>
      ) : (
        <div
          ref={localRootRef}
          style={{
            width: '100%',
            minHeight: '600px',
            height: '70vh',
            border: '0.5px solid #e0ddd6',
            borderRadius: '8px',
            background: '#fff',
            display: 'block',
            overflow: 'auto',
          }}
        />
      )}
    </div>
  );
}
