import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Shield, Download } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import TopBarSimple from '../../../components/TopBarSimple';
import ResponsivePage from '../../../components/layout/ResponsiveShell';
import PdfVirtualizedViewer from '../../../components/viewer/PdfVirtualizedViewer';
import DocxIframeViewer from '../../../components/viewer/DocxIframeViewer';
import type { AnonymisationChangeRow, AnonymisationResultItem } from '../../../types/anonymisation';
import {
  downloadBlob,
  postAnonymisationFull,
  postAnonymisationPseudo,
} from '../api/client';
import { getRenderableFileUrl } from '../../../api/workspaceClient';

type LocationState = {
  anonymisationItems?: AnonymisationResultItem[];
  skipUpload?: boolean;
};

const TYPE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  PER: { bg: '#FAECE7', border: '#993C1D', text: '#712B13' },
  LOC: { bg: '#E1F5EE', border: '#0F6E56', text: '#085041' },
  ORG: { bg: '#E6F1FB', border: '#185FA5', text: '#0C447C' },
  DATE: { bg: '#FAEEDA', border: '#854F0B', text: '#633806' },
  PHONE: { bg: '#EEEDFE', border: '#534AB7', text: '#3C3489' },
};

const COLOR_PALETTE: Array<{ bg: string; border: string; text: string }> = [
  { bg: '#FAECE7', border: '#993C1D', text: '#712B13' },
  { bg: '#E1F5EE', border: '#0F6E56', text: '#085041' },
  { bg: '#E6F1FB', border: '#185FA5', text: '#0C447C' },
  { bg: '#FAEEDA', border: '#854F0B', text: '#633806' },
  { bg: '#EEEDFE', border: '#534AB7', text: '#3C3489' },
  { bg: '#FDE8EF', border: '#BE185D', text: '#9D174D' },
  { bg: '#E0F2FE', border: '#0369A1', text: '#075985' },
];

function colorForEntityType(entityType: string) {
  const u = (entityType || '').toUpperCase();
  for (const k of Object.keys(TYPE_COLORS)) {
    if (u.includes(k)) return TYPE_COLORS[k];
  }
  let hash = 0;
  for (let i = 0; i < u.length; i++) hash = (hash * 31 + u.charCodeAt(i)) >>> 0;
  return COLOR_PALETTE[hash % COLOR_PALETTE.length];
}

function normalizeEntityLabel(entityType: string): string {
  const raw = (entityType || '').trim();
  if (!raw) return 'Entity';
  return raw
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function stemFilename(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}

function fileExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : 'docx';
}

export default function AnonymisationPage() {
  const UI_SCALE = 0.8;
  const PREVIEW_FIT_SCALE = 0.55; // stronger zoom-out for split-panel previews
  const DOCX_COMPARE_SCALE = 0.55; // align DOCX preview scale with PDF zoom-out
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1440;
  const initialLeft = Math.round(viewportWidth * 0.2);
  const initialRight = Math.round(viewportWidth * 0.4);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const items = (location.state as LocationState | null)?.anonymisationItems ?? [];
  const processed = items.length > 0;

  const [fileIndex, setFileIndex] = useState(0);
  const [outputMode, setOutputMode] = useState<'anonymised' | 'pseudonymised'>('pseudonymised');
  const [leftWidth, setLeftWidth] = useState(initialLeft);
  const [rightWidth, setRightWidth] = useState(initialRight);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [dlError, setDlError] = useState<string | null>(null);
  const [dlBusy, setDlBusy] = useState<'pseudo' | 'full' | null>(null);
  const [originalPreviewUrl, setOriginalPreviewUrl] = useState<string | null>(null);
  const [outputPreviewUrl, setOutputPreviewUrl] = useState<string | null>(null);
  const [middlePanelWidth, setMiddlePanelWidth] = useState(640);
  const [rightPanelWidthPx, setRightPanelWidthPx] = useState(360);

  const itemsKey = items.map((i) => i.path).join('\0');
  useEffect(() => {
    setFileIndex(0);
    setHighlighted(null);
  }, [itemsKey]);

  useEffect(() => {
    setHighlighted(null);
  }, [fileIndex]);

  const current = items[fileIndex] ?? null;
  const report = current?.report;
  const changes: AnonymisationChangeRow[] = report?.changes ?? [];
  const entityCountData = Object.entries(
    changes.reduce<Record<string, { count: number; color: { bg: string; border: string; text: string } }>>((acc, row) => {
      const label = normalizeEntityLabel(row.entity_type ?? '');
      if (!acc[label]) {
        acc[label] = {
          count: 0,
          color: colorForEntityType(row.entity_type ?? label),
        };
      }
      acc[label].count += 1;
      return acc;
    }, {}),
  ).sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]));

  useEffect(() => {
    let cancelled = false;
    let tempOriginalObjectUrl: string | null = null;
    let tempOutputObjectUrl: string | null = null;
    if (!current) {
      setOriginalPreviewUrl(null);
      setOutputPreviewUrl(null);
      return;
    }
    const ext = fileExt(current.name);
    const buildUrl = async (blobPath?: string) => {
      if (!blobPath) return null;
      return getRenderableFileUrl(blobPath);
    };
    void (async () => {
      try {
        let original = await buildUrl(current.blobPath);
        let output = await buildUrl(outputMode === 'anonymised' ? current.fullBlobPath : current.pseudoBlobPath);
        if (!original && ext === 'pdf' && current.file) {
          tempOriginalObjectUrl = URL.createObjectURL(current.file);
          original = tempOriginalObjectUrl;
        }
        if (!output && ext === 'pdf') {
          const outputBlob = outputMode === 'anonymised' ? current.fullBlob : current.pseudoBlob;
          if (outputBlob) {
            tempOutputObjectUrl = URL.createObjectURL(outputBlob);
            output = tempOutputObjectUrl;
          }
        }
        if (!cancelled) {
          setOriginalPreviewUrl(original);
          setOutputPreviewUrl(output);
        }
      } catch {
        if (!cancelled) {
          setOriginalPreviewUrl(null);
          setOutputPreviewUrl(null);
        }
      }
    })();
    return () => {
      cancelled = true;
      if (tempOriginalObjectUrl) URL.revokeObjectURL(tempOriginalObjectUrl);
      if (tempOutputObjectUrl) URL.revokeObjectURL(tempOutputObjectUrl);
    };
  }, [current, outputMode]);

  const handleLeftDrag = (delta: number) => setLeftWidth((prev) => Math.max(200, Math.min(520, prev + delta)));
  const handleRightDrag = (delta: number) => setRightWidth((prev) => Math.max(200, Math.min(560, prev - delta)));
  useEffect(() => {
    setRightPanelWidthPx(rightWidth);
  }, [rightWidth]);

  const downloadCurrent = async (kind: 'pseudo' | 'full') => {
    if (!current?.file) return;
    setDlError(null);
    setDlBusy(kind);
    try {
      const cached = kind === 'pseudo' ? current.pseudoBlob : current.fullBlob;
      const blob =
        cached ??
        (kind === 'pseudo' ? await postAnonymisationPseudo(current.file) : await postAnonymisationFull(current.file));
      const ext = fileExt(current.name);
      const stem = stemFilename(current.name);
      const suffix = kind === 'pseudo' ? '_pseudo' : '_full_anonymised';
      downloadBlob(blob, `${stem}${suffix}.${ext}`);
    } catch (e) {
      setDlError(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setDlBusy(null);
    }
  };

  const subHeader = (
    <div
      className="flex items-center gap-3 px-4 py-2.5 bg-white flex-wrap"
      style={{ borderBottom: '0.5px solid #e0ddd6', flexShrink: 0 }}
    >
      <button
        type="button"
        onClick={() => navigate('/workspace')}
        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 px-2 py-1 rounded hover:bg-gray-100"
      >
        <ArrowLeft size={13} /> Back
      </button>
      <div style={{ width: 1, height: 16, background: '#e0ddd6' }} />
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: '#FAECE7', border: '0.5px solid #993C1D' }}>
          <Shield size={12} style={{ color: '#993C1D' }} />
        </div>
        <span className="text-sm font-semibold text-gray-800">Anonymisation</span>
      </div>
      {processed && (
        <span className="ml-auto text-xs text-gray-500">
          {items.length} file{items.length !== 1 ? 's' : ''} in batch
        </span>
      )}
    </div>
  );

  const uploadView = (
    <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4">
      <p className="text-sm text-gray-600 text-center max-w-md">
        Upload a folder or ZIP in the workspace, select a DOCX or PDF, run anonymisation from the right panel, then open full view.
      </p>
      <button
        type="button"
        onClick={() => navigate('/workspace')}
        className="text-xs px-4 py-2 rounded-lg font-semibold text-white"
        style={{ background: '#185FA5' }}
      >
        Go to workspace
      </button>
    </div>
  );

  const leftPanel = processed ? (
    <div className="h-full min-h-0 overflow-hidden">
      <div
        className="flex flex-col"
        style={{
          transform: `scale(${UI_SCALE})`,
          transformOrigin: 'top left',
          width: `${100 / UI_SCALE}%`,
          height: `${100 / UI_SCALE}%`,
        }}
      >
      <div className="px-3 py-2.5 flex flex-col gap-2" style={{ borderBottom: '0.5px solid #e0ddd6' }}>
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Document</span>
        <select
          className="text-xs w-full rounded-md px-2 py-1.5 border border-gray-200 bg-white text-gray-800"
          value={fileIndex}
          onChange={(e) => setFileIndex(Number(e.target.value))}
        >
          {items.map((it, idx) => (
            <option key={it.path} value={idx}>
              {it.name}
              {it.error ? ' (error)' : ''}
            </option>
          ))}
        </select>
        {current?.error && (
          <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">{current.error}</div>
        )}
      </div>
      <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: '0.5px solid #e0ddd6' }}>
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Entities</span>
        <span
          className="ml-auto text-xs px-1.5 py-0.5 rounded-full font-medium"
          style={{ background: '#FAECE7', color: '#712B13', border: '0.5px solid #993C1D' }}
        >
          {changes.length} values
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
        {changes.map((row, i) => {
          const c = colorForEntityType(row.entity_type);
          const key = row.original_value ?? String(i);
          const isHL = highlighted === key;
          return (
            <button
              type="button"
              key={`${key}-${i}`}
              onClick={() => setHighlighted((h) => (h === key ? null : key))}
              className="w-full text-left rounded-lg p-2.5 transition-all"
              style={{
                background: isHL ? c.border : c.bg,
                border: `0.5px solid ${c.border}`,
              }}
            >
              <div className="text-xs font-semibold mb-1" style={{ color: isHL ? '#fff' : c.text }}>
                {row.entity_type}
              </div>
              <div className="text-[10px] space-y-0.5" style={{ color: isHL ? 'rgba(255,255,255,0.92)' : '#374151' }}>
                <div>
                  <span className="opacity-70">original:</span> {row.original_value}
                </div>
                <div>
                  <span className="opacity-70">{outputMode === 'anonymised' ? 'full:' : 'pseudo:'}</span>{' '}
                  {outputMode === 'anonymised' ? (row.full_anon_value ?? '—') : (row.pseudo_value ?? '—')}
                </div>
              </div>
            </button>
          );
        })}
        {changes.length === 0 && <div className="text-xs text-gray-400">No change rows in JSON for this file.</div>}
      </div>
      {entityCountData.length > 0 && (
        <div className="p-3" style={{ borderTop: '0.5px solid #e0ddd6', flexShrink: 0 }}>
          <div className="rounded-xl p-3" style={{ background: '#F8F7F4', border: '0.5px solid #e0ddd6' }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Entity counts</p>
            {(() => {
              const maxCount = Math.max(...entityCountData.map(([, data]) => data.count), 1);
              return (
                <div className="space-y-1.5">
                  {entityCountData.map(([label, data]) => {
                    const widthPct = Math.max(10, Math.round((data.count / maxCount) * 100));
                    return (
                      <div key={label} className="grid grid-cols-[1fr_170px_28px] items-center gap-2 text-xs">
                        <span className="truncate text-gray-700">{label}</span>
                        <span className="h-2 rounded-full bg-gray-200 overflow-hidden">
                          <span className="h-2 rounded-full block" style={{ width: `${widthPct}%`, background: data.color.border }} />
                        </span>
                        <span className="text-right text-gray-500">{data.count}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      )}
      </div>
    </div>
  ) : null;

  const middlePanel = processed ? (
    <div className="flex flex-col bg-white h-full overflow-hidden min-h-0">
      <div className="px-4 h-11 flex items-center gap-2" style={{ borderBottom: '0.5px solid #e0ddd6', flexShrink: 0 }}>
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Original</span>
      </div>
      <div
        className="flex-1 overflow-hidden p-3 min-h-0"
        ref={(el) => {
          if (!el) return;
          const w = Math.max(320, el.clientWidth - 24);
          if (Math.abs(w - middlePanelWidth) > 6) setMiddlePanelWidth(w);
        }}
      >
        {originalPreviewUrl && fileExt(current?.name || '') === 'pdf' ? (
          <div className="h-full overflow-y-auto">
            <PdfVirtualizedViewer file={originalPreviewUrl} fileName={current?.name || 'Original'} panelWidth={Math.max(220, Math.round(middlePanelWidth * PREVIEW_FIT_SCALE))} />
          </div>
        ) : originalPreviewUrl && (fileExt(current?.name || '') === 'docx' || fileExt(current?.name || '') === 'doc') ? (
          <DocxIframeViewer
            fileUrl={originalPreviewUrl}
            fileName={current?.name || 'Original'}
            compact
            compactScale={DOCX_COMPARE_SCALE}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-xs text-gray-400">Original preview unavailable</div>
        )}
      </div>
    </div>
  ) : (
    <div />
  );

  const rightPanel = processed ? (
    <div className="flex flex-col bg-white h-full overflow-hidden min-h-0">
      <div className="px-4 pt-[4.5px] pb-[4.5px] flex flex-col gap-1" style={{ borderBottom: '0.5px solid #e0ddd6', flexShrink: 0 }}>
        <div className="h-8 flex items-center gap-2">
          <select
            value={outputMode}
            onChange={(e) => setOutputMode(e.target.value as 'anonymised' | 'pseudonymised')}
            className="text-[11px] font-semibold rounded-md px-2 py-1 cursor-pointer border h-8"
            style={{
              color: '#4b5563',
              borderColor: '#6366f1',
              background: '#f8f9ff',
            }}
          >
            <option value="pseudonymised">Pseudonymised (preview)</option>
            <option value="anonymised">Fully anonymised (preview)</option>
          </select>
          <span className="ml-auto text-[10px] text-gray-400">Preview</span>
        </div>
        {dlError && <div className="text-[11px] text-red-600">{dlError}</div>}
      </div>
      <div className="flex-1 overflow-hidden p-3 min-h-0">
        {outputPreviewUrl && fileExt(current?.name || '') === 'pdf' ? (
          <div className="h-full overflow-y-auto">
            <PdfVirtualizedViewer
              file={outputPreviewUrl}
              fileName={outputMode === 'anonymised' ? 'Fully anonymised' : 'Pseudonymised'}
              panelWidth={Math.max(220, Math.round((rightPanelWidthPx - 32) * PREVIEW_FIT_SCALE))}
            />
          </div>
        ) : outputPreviewUrl && (fileExt(current?.name || '') === 'docx' || fileExt(current?.name || '') === 'doc') ? (
          <DocxIframeViewer
            fileUrl={outputPreviewUrl}
            fileName={outputMode === 'anonymised' ? 'Fully anonymised' : 'Pseudonymised'}
            compact
            compactScale={DOCX_COMPARE_SCALE}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-xs text-gray-400">Output preview unavailable</div>
        )}
      </div>
      <div className="p-3" style={{ borderTop: '0.5px solid #e0ddd6', flexShrink: 0 }}>
        <button
          type="button"
          disabled={!!dlBusy || !current?.file}
          onClick={() => downloadCurrent(outputMode === 'anonymised' ? 'full' : 'pseudo')}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
          style={{ background: outputMode === 'anonymised' ? '#185FA5' : '#0F6E56' }}
        >
          <Download size={13} />
          {dlBusy
            ? 'Preparing download...'
            : outputMode === 'anonymised'
              ? 'Download Anonymised Document'
              : 'Download Pseudonymised Document'}
        </button>
      </div>
    </div>
  ) : (
    <div />
  );

  return (
    <ResponsivePage
      topBar={<TopBarSimple user={user} onLogout={() => { logout(); navigate('/login'); }} />}
      subHeader={subHeader}
      leftPanel={leftPanel ?? undefined}
      middlePanel={middlePanel}
      rightPanel={rightPanel ?? undefined}
      uploadView={uploadView}
      processed={processed}
      leftLabel="Results"
      middleLabel="Original"
      rightLabel={outputMode === 'anonymised' ? 'Anonymised' : 'Pseudonymised'}
      leftPanelWidth={leftWidth}
      rightPanelWidth={rightWidth}
      onLeftDrag={handleLeftDrag}
      onRightDrag={handleRightDrag}
    />
  );
}
