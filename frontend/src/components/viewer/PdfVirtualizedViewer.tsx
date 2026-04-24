import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page } from 'react-pdf';

interface Props {
  file: File | string;
  fileName: string;
  panelWidth: number;
  targetPage?: number | null;
  targetSnippet?: string | null;
  jumpToken?: number;
}


function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function tokenizeSnippet(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function normalizeWithMap(input: string): { normalized: string; map: number[] } {
  let normalized = '';
  const map: number[] = [];
  let prevWasSpace = true;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const isSpace = /\s/.test(ch) || /[\u0000-\u001F\u007F]/.test(ch);
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

export default function PdfVirtualizedViewer({ file, fileName, panelWidth, targetPage = null, targetSnippet = null, jumpToken = 0 }: Props) {
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'single' | 'scroll'>('single');
  const [pdfDoc, setPdfDoc] = useState<any | null>(null);

  // Scroll mode: set of page numbers currently rendered
  const [renderedPages, setRenderedPages] = useState<Set<number>>(new Set([1]));
  const observerRef = useRef<IntersectionObserver | null>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const viewerRootRef = useRef<HTMLDivElement>(null);
  const [strongItemIndexes, setStrongItemIndexes] = useState<Set<number>>(new Set());
  const [weakItemIndexes, setWeakItemIndexes] = useState<Set<number>>(new Set());
  const HIGHLIGHT_FILL = 'rgba(253,230,138,0.18)'; // softer yellow (lower opacity)
  const HIGHLIGHT_BORDER = '#F59E0B';
  const HIGHLIGHT_BOX = `inset 0 0 0 1px ${HIGHLIGHT_BORDER}`;

  const RENDER_BUFFER = 2; 

  useEffect(() => {
    if (viewMode !== 'scroll' || numPages === 0) return;

    observerRef.current?.disconnect();

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const pageNum = Number((entry.target as HTMLElement).dataset.page);
          if (!pageNum) return;

          setRenderedPages((prev) => {
            const next = new Set(prev);
            if (entry.isIntersecting) {
              for (let i = Math.max(1, pageNum - RENDER_BUFFER); i <= Math.min(numPages, pageNum + RENDER_BUFFER); i++) {
                next.add(i);
              }
            }
            return next;
          });
        });
      },
      {
        root: scrollContainerRef.current,
        rootMargin: '200px 0px',
        threshold: 0,
      },
    );

    observerRef.current = observer;
    pageRefs.current.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [viewMode, numPages]);

  const registerPageRef = useCallback(
    (pageNum: number) => (el: HTMLDivElement | null) => {
      if (el) {
        pageRefs.current.set(pageNum, el);
        observerRef.current?.observe(el);
      } else {
        pageRefs.current.delete(pageNum);
      }
    },
    [],
  );

  const safeCurrentPage = useMemo(
    () => (numPages > 0 ? Math.min(Math.max(1, currentPage), numPages) : 1),
    [currentPage, numPages],
  );

  const handleLoadSuccess = useCallback((pdf: { numPages: number; getPage?: (pageNumber: number) => Promise<unknown> }) => {
    const n = pdf.numPages;
    setNumPages(n);
    setPdfDoc(pdf);
    setCurrentPage((p) => Math.min(Math.max(1, p), n));
    setRenderedPages(new Set([1, 2, 3].filter((x) => x <= n)));
  }, []);

  useEffect(() => {
    if (viewMode !== 'single' || !pdfDoc || typeof pdfDoc.getPage !== 'function' || numPages === 0) return;
    const candidates = [currentPage + 1, currentPage + 2, currentPage - 1].filter((p) => p >= 1 && p <= numPages);
    for (const pageNum of candidates) {
      void pdfDoc.getPage(pageNum).catch(() => {
      });
    }
  }, [currentPage, numPages, pdfDoc, viewMode]);

  const switchToScroll = () => {
    setRenderedPages(new Set(Array.from({ length: Math.min(numPages, RENDER_BUFFER * 2 + 1) }, (_, i) => i + 1)));
    setViewMode('scroll');
  };

  const canGoPrev = safeCurrentPage > 1;
  const canGoNext = numPages > 0 && safeCurrentPage < numPages;
  const normalizedSnippet = (targetSnippet || '').trim();
  const STOP_WORDS = useMemo(
    () => new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'were', 'was', 'are', 'have', 'has', 'had', 'into', 'onto', 'about', 'after', 'before', 'report']),
    [],
  );

  const computeHighlightsFromTextItems = useCallback(
    (items: Array<unknown>) => {
      if (!normalizedSnippet || !items?.length) {
        setStrongItemIndexes(new Set());
        setWeakItemIndexes(new Set());
        return;
      }

      const itemTexts = items.map((it) => (typeof it === 'object' && it !== null && 'str' in it ? String((it as { str?: string }).str || '') : ''));
      const joined = itemTexts.join(' ');
      const itemOffsets: Array<{ start: number; end: number; index: number }> = [];
      let cursor = 0;
      for (let i = 0; i < itemTexts.length; i++) {
        const txt = itemTexts[i];
        const start = cursor;
        const end = cursor + txt.length;
        itemOffsets.push({ start, end, index: i });
        cursor = end + 1;
      }

      const { normalized: haystack, map: haystackMap } = normalizeWithMap(joined);
      const { normalized: needle } = normalizeWithMap(normalizedSnippet);
      const strong = new Set<number>();
      const weak = new Set<number>();

      if (needle) {
        const idx = haystack.indexOf(needle);
        if (idx >= 0) {
          const rawStart = haystackMap[idx];
          const rawEnd = haystackMap[idx + needle.length - 1] + 1;
          for (const off of itemOffsets) {
            if (off.end <= rawStart || off.start >= rawEnd) continue;
            strong.add(off.index);
          }
          setStrongItemIndexes(strong);
          setWeakItemIndexes(new Set());
          return;
        }
      }

      const snippetTokens = tokenizeSnippet(normalizedSnippet).filter((t) => t.length >= 4 && !STOP_WORDS.has(t));
      if (!snippetTokens.length) {
        setStrongItemIndexes(new Set());
        setWeakItemIndexes(new Set());
        return;
      }

      for (let i = 0; i < itemTexts.length; i++) {
        const txt = (itemTexts[i] || '').toLowerCase();
        if (!txt.trim()) continue;
        const hits = snippetTokens.reduce((acc, token) => (txt.includes(token) ? acc + 1 : acc), 0);
        if (hits >= 2) weak.add(i);
      }
      setStrongItemIndexes(new Set());
      setWeakItemIndexes(weak);
    },
    [normalizedSnippet, STOP_WORDS],
  );

  const customTextRenderer = useCallback(
    (textItem: { str: string; itemIndex?: number }) => {
      const originalText = textItem.str || '';
      if (!normalizedSnippet || !originalText.trim()) return escapeHtml(originalText);
      const idx = typeof textItem.itemIndex === 'number' ? textItem.itemIndex : -1;
      if (idx >= 0 && strongItemIndexes.has(idx)) {
        return `<mark class="pdf-highlight pdf-highlight-strong" style="background:${HIGHLIGHT_FILL};box-shadow:${HIGHLIGHT_BOX};border-radius:2px;padding:0;">${escapeHtml(originalText)}</mark>`;
      }
      if (idx >= 0 && weakItemIndexes.has(idx)) {
        return `<mark class="pdf-highlight pdf-highlight-weak" style="background:${HIGHLIGHT_FILL};box-shadow:${HIGHLIGHT_BOX};border-radius:2px;padding:0;">${escapeHtml(originalText)}</mark>`;
      }
      return escapeHtml(originalText);
    },
    [normalizedSnippet, strongItemIndexes, weakItemIndexes, HIGHLIGHT_BORDER, HIGHLIGHT_FILL, HIGHLIGHT_BOX],
  );

  const clearDomHighlights = useCallback((root: ParentNode | null) => {
    if (!root) return;
    root.querySelectorAll('[data-pdf-original-text]').forEach((el) => {
      const node = el as HTMLElement;
      const original = node.getAttribute('data-pdf-original-text');
      if (original !== null) {
        node.textContent = original;
      }
      node.removeAttribute('data-pdf-original-text');
    });
    root.querySelectorAll('span[data-pdf-dom-highlight="true"]').forEach((el) => {
      const node = el as HTMLElement;
      node.removeAttribute('data-pdf-dom-highlight');
      node.style.background = '';
      node.style.borderRadius = '';
      node.style.boxShadow = '';
      node.style.padding = '';
      node.style.outline = '';
      node.style.backgroundImage = '';
      node.style.backgroundRepeat = '';
      node.style.backgroundSize = '';
    });
  }, []);

  const applyDomHighlightForSnippet = useCallback(
    (pageRoot: HTMLElement | null) => {
      if (!pageRoot || !normalizedSnippet) return false;
      const textLayer = pageRoot.querySelector('.react-pdf__Page__textContent');
      if (!textLayer) return false;

      const spans = Array.from(textLayer.querySelectorAll('span')) as HTMLElement[];
      if (!spans.length) return false;

      const spanTexts = spans.map((s) => s.textContent || '');
      const joined = spanTexts.join(' ');
      const offsets: Array<{ start: number; end: number; idx: number }> = [];
      let cursor = 0;
      for (let i = 0; i < spanTexts.length; i++) {
        const txt = spanTexts[i];
        offsets.push({ start: cursor, end: cursor + txt.length, idx: i });
        cursor += txt.length + 1;
      }

      const { normalized: haystack, map: haystackMap } = normalizeWithMap(joined);
      const { normalized: needle } = normalizeWithMap(normalizedSnippet);
      if (!needle || !haystack) return false;
      const hit = haystack.indexOf(needle);
      if (hit < 0) return false;

      const rawStart = haystackMap[hit];
      const rawEnd = haystackMap[hit + needle.length - 1] + 1;
      let highlighted = 0;

      for (const off of offsets) {
        if (off.end <= rawStart || off.start >= rawEnd) continue;
        const span = spans[off.idx];
        const spanText = span.textContent || '';
        const localStart = Math.max(0, rawStart - off.start);
        const localEnd = Math.min(spanText.length, rawEnd - off.start);
        if (!spanText || localStart >= localEnd) continue;

        if (localStart === 0 && localEnd === spanText.length) {
          span.setAttribute('data-pdf-dom-highlight', 'true');
          span.style.background = HIGHLIGHT_FILL;
          span.style.borderRadius = '2px';
          span.style.boxShadow = HIGHLIGHT_BOX;
          span.style.padding = '0';
          highlighted++;
          continue;
        }

        span.setAttribute('data-pdf-original-text', spanText);
        span.textContent = '';
        const before = spanText.slice(0, localStart);
        const middle = spanText.slice(localStart, localEnd);
        const after = spanText.slice(localEnd);
        if (before) span.appendChild(document.createTextNode(before));
        const mark = document.createElement('span');
        mark.setAttribute('data-pdf-dom-highlight', 'true');
        mark.style.background = HIGHLIGHT_FILL;
        mark.style.borderRadius = '2px';
        mark.style.boxShadow = HIGHLIGHT_BOX;
        mark.style.padding = '0';
        mark.textContent = middle;
        span.appendChild(mark);
        if (after) span.appendChild(document.createTextNode(after));
        highlighted++;
      }

      if (highlighted > 0) {
        const first = spans.find((s) => s.getAttribute('data-pdf-dom-highlight') === 'true');
        first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return true;
      }
      return false;
    },
    [normalizedSnippet, HIGHLIGHT_BORDER, HIGHLIGHT_FILL, HIGHLIGHT_BOX],
  );

  useEffect(() => {
    if (!targetPage || numPages === 0) return;
    const nextPage = Math.min(Math.max(1, targetPage), numPages);
    
    if (viewMode === 'single') {
      setCurrentPage(nextPage);
      return;
    }

    const pageEl = pageRefs.current.get(nextPage);
    if (pageEl) {
      pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      
      if (normalizedSnippet) {
        const timeoutId = setTimeout(() => {
          const marks = pageEl.querySelectorAll('mark.pdf-highlight');
          if (marks.length > 0) {
            marks[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 800);
        return () => clearTimeout(timeoutId);
      }
    }
  }, [targetPage, numPages, viewMode, jumpToken, normalizedSnippet]);

  useEffect(() => {
    if (!normalizedSnippet || numPages === 0 || viewMode !== 'single') return;
    if (targetPage) {
      const nextPage = Math.min(Math.max(1, targetPage), numPages);
      if (safeCurrentPage !== nextPage) {
        setCurrentPage(nextPage);
      }
    }
  }, [normalizedSnippet, targetPage, numPages, viewMode, safeCurrentPage]);

  useEffect(() => {
    if (!normalizedSnippet || numPages === 0 || viewMode !== 'single') return;
    
    const timeoutId = setTimeout(() => {
      const singlePageRoot = viewerRootRef.current?.querySelector('.react-pdf__Page') as HTMLElement | null;
      if (singlePageRoot) {
        clearDomHighlights(singlePageRoot);
        const domHighlighted = applyDomHighlightForSnippet(singlePageRoot);
        if (domHighlighted) return;
      }
      const strongMarks = viewerRootRef.current?.querySelectorAll('mark.pdf-highlight-strong');
      const weakMarks = viewerRootRef.current?.querySelectorAll('mark.pdf-highlight-weak');
      const marks = viewerRootRef.current?.querySelectorAll('mark.pdf-highlight');
      if (strongMarks && strongMarks.length > 0) {
        strongMarks[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (weakMarks && weakMarks.length > 0) {
        weakMarks[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (marks && marks.length > 0) {
        marks[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 800);

    return () => clearTimeout(timeoutId);
    // Re-run after resize too (divider drag triggers panelWidth changes and reflows text layer).
  }, [normalizedSnippet, numPages, jumpToken, viewMode, safeCurrentPage, panelWidth, clearDomHighlights, applyDomHighlightForSnippet]);

  useEffect(() => {
    setStrongItemIndexes(new Set());
    setWeakItemIndexes(new Set());
  }, [jumpToken, normalizedSnippet, targetPage, safeCurrentPage]);

  return (
    <div ref={viewerRootRef} className="w-full flex flex-col items-center gap-3">
      {/* ── Toolbar ── */}
      <div
        className="w-full max-w-[920px] px-3 py-2 rounded-lg flex items-center justify-between gap-3 text-xs text-gray-600 bg-white flex-shrink-0"
        style={{ border: '0.5px solid #E5E7EB' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="truncate font-medium">{fileName}</span>
          {numPages > 0 && (
            <>
              <span className="text-gray-300">•</span>
              <span className="text-gray-500 whitespace-nowrap">
                {viewMode === 'single'
                  ? `Page ${safeCurrentPage} / ${numPages}`
                  : `${numPages} pages`}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* View mode toggle */}
          <div className="flex items-center rounded-md overflow-hidden" style={{ border: '0.5px solid #E5E7EB' }}>
            <button
              type="button"
              className="px-2 py-1 text-xs transition-colors"
              style={
                viewMode === 'single'
                  ? { background: '#E6F1FB', color: '#0C447C' }
                  : { background: '#F9FAFB', color: '#6B7280' }
              }
              onClick={() => setViewMode('single')}
            >
              Single page
            </button>
            <button
              type="button"
              className="px-2 py-1 text-xs transition-colors"
              style={
                viewMode === 'scroll'
                  ? { background: '#E6F1FB', color: '#0C447C' }
                  : { background: '#F9FAFB', color: '#6B7280' }
              }
              onClick={switchToScroll}
            >
              Scroll all
            </button>
          </div>

          {viewMode === 'single' && (
            <>
              <button
                type="button"
                className="px-2 py-1 rounded-md text-xs"
                style={{
                  border: '0.5px solid #E5E7EB',
                  background: canGoPrev ? '#FFFFFF' : '#F9FAFB',
                  color: canGoPrev ? '#374151' : '#9CA3AF',
                }}
                disabled={!canGoPrev}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </button>
              <button
                type="button"
                className="px-2 py-1 rounded-md text-xs"
                style={{
                  border: '0.5px solid #E5E7EB',
                  background: canGoNext ? '#FFFFFF' : '#F9FAFB',
                  color: canGoNext ? '#374151' : '#9CA3AF',
                }}
                disabled={!canGoNext}
                onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
              >
                Next
              </button>
            </>
          )}
        </div>
      </div>

      {loadError && (
        <div
          className="w-full max-w-[920px] rounded-lg px-3 py-2 text-xs text-red-800"
          style={{ background: '#FEE2E2', border: '0.5px solid #DC2626' }}
        >
          {loadError}
        </div>
      )}

      {/* ── Document ── */}
      <Document
        key={typeof file === 'string' ? file : file.name}
        file={file}
        loading={<div className="py-16 text-sm text-gray-500">Loading PDF…</div>}
        onLoadSuccess={handleLoadSuccess}
        onLoadError={(err) => setLoadError(err.message || 'Failed to open PDF')}
      >
        {viewMode === 'single' ? (
          /* ── Single page mode — only one <Page> mounted at a time ── */
          <div className="shadow-sm bg-white rounded">
            <Page
              key={`${safeCurrentPage}-${jumpToken}`}
              pageNumber={safeCurrentPage}
              width={panelWidth}
              renderTextLayer={!!normalizedSnippet}
              renderAnnotationLayer={false}
              customTextRenderer={normalizedSnippet ? customTextRenderer : undefined}
              onGetTextSuccess={(textContent: { items: unknown[] }) =>
                computeHighlightsFromTextItems(textContent.items || [])
              }
              loading={<div className="py-10 px-8 text-sm text-gray-500">Rendering page…</div>}
            />
          </div>
        ) : (
          <div
            ref={scrollContainerRef}
            className="w-full flex flex-col items-center gap-4"
          >
            {numPages > 0 &&
              Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => {
                const shouldRender = renderedPages.has(pageNum);
                // Estimate page height to keep scroll position stable
                const estimatedHeight = Math.round((panelWidth * 1.414)); // A4 ratio
                // Only enable text highlighting on the target page to avoid performance issues
                const shouldHighlight = !!normalizedSnippet && !!targetPage && pageNum === targetPage;
                return (
                  <div
                    key={pageNum}
                    ref={registerPageRef(pageNum)}
                    data-page={pageNum}
                    className="relative bg-white shadow-sm rounded flex items-center justify-center"
                    style={{
                      width: panelWidth,
                      minHeight: shouldRender ? undefined : estimatedHeight,
                    }}
                  >
                    {shouldRender ? (
                      <Page
                        pageNumber={pageNum}
                        width={panelWidth}
                        renderTextLayer={shouldHighlight}
                        renderAnnotationLayer={false}
                        customTextRenderer={shouldHighlight ? customTextRenderer : undefined}
                        onGetTextSuccess={(textContent: { items: unknown[] }) => {
                          if (shouldHighlight) computeHighlightsFromTextItems(textContent.items || []);
                        }}
                        loading={
                          <div
                            className="flex items-center justify-center text-xs text-gray-400"
                            style={{ width: panelWidth, height: estimatedHeight }}
                          >
                            Page {pageNum}
                          </div>
                        }
                      />
                    ) : (
                      <div
                        className="flex items-center justify-center text-xs text-gray-300"
                        style={{ width: panelWidth, height: estimatedHeight }}
                      >
                        Page {pageNum}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </Document>
    </div>
  );
}
