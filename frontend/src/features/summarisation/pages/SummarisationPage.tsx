import { useDeferredValue, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import TopBarSimple from '../../../components/TopBarSimple';
import type { FileNode } from '../../../types';
import { type SummarizationFieldSource, type SummarizationResponse } from '../api/client';
import ResponsivePage from '../../../components/layout/ResponsiveShell';
import MiddlePanel from '../../../components/layout/MiddlePanel';

type SummarizedFileRef = { name: string; blobPath?: string; extension?: string };
type LocationState = { summaryResult?: SummarizationResponse | SummarizationResponse[]; summarizedFiles?: SummarizedFileRef[] };
const HIDDEN_KEYS = new Set(['confidence', 'chunk_id']);
const SECTION_ORDER = [
  'application_details',
  'quality_summary',
  'bioequivalence_summary',
  'regulatory_summary',
  'final_status',
  'overall_summary',
];
const FIELD_ORDER_BY_SECTION: Record<string, string[]> = {
  application_details: ['drug_name', 'applicant', 'dosage_form', 'strength', 'indication', 'application_type'],
  quality_summary: ['api_compliance', 'manufacturing_process', 'stability', 'key_quality_findings'],
  bioequivalence_summary: ['study_conducted', 'study_design', 'result', 'conclusion'],
  regulatory_summary: ['key_observations', 'deficiencies', 'risk_flags', 'compliance_status'],
  final_status: ['completeness', 'recommendation', 'review_confidence'],
};
const MAX_SOURCES_RENDER = 6;
const SOURCE_TEXT_PREVIEW_CHARS = 220;

function prettifyLabel(raw: string): string {
  return raw.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeKeyForCompare(raw: string): string {
  return raw.replace(/[_\-\s]+/g, '').toLowerCase();
}

function sanitizeDisplayText(value: unknown): string {
  return String(value)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isNonEmptyPrimitive(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

function isFieldObject(value: unknown): value is { value?: unknown; source?: unknown } {
  return typeof value === 'object' && value !== null && ('value' in value || 'source' in value);
}

function sortEntriesByOrder(entries: [string, unknown][], order: string[]): [string, unknown][] {
  const orderIndex = new Map(order.map((key, idx) => [key, idx]));
  return [...entries].sort(([a], [b]) => {
    const ai = orderIndex.get(a);
    const bi = orderIndex.get(b);
    if (ai !== undefined && bi !== undefined) return ai - bi;
    if (ai !== undefined) return -1;
    if (bi !== undefined) return 1;
    return a.localeCompare(b);
  });
}

function normalizeSourceFileName(value: string): string {
  return value
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    ?.replace(/\s*\(page\s*\d+\)\s*$/i, '')
    .trim()
    .toLowerCase() || '';
}

function toCanonicalName(value: string): string {
  return normalizeSourceFileName(value).replace(/[^a-z0-9]/g, '');
}

function getStem(value: string): string {
  return normalizeSourceFileName(value).replace(/\.[a-z0-9]+$/i, '');
}

function matchScore(nodeName: string, sourceName: string): number {
  const nodeNorm = normalizeSourceFileName(nodeName);
  const sourceNorm = normalizeSourceFileName(sourceName);
  if (!nodeNorm || !sourceNorm) return -1;
  if (nodeNorm === sourceNorm) return 100;

  const nodeStem = getStem(nodeNorm);
  const sourceStem = getStem(sourceNorm);
  if (nodeStem === sourceStem) return 95;

  const nodeCanon = toCanonicalName(nodeNorm);
  const sourceCanon = toCanonicalName(sourceNorm);
  if (nodeCanon === sourceCanon) return 90;
  if (nodeCanon.includes(sourceCanon) || sourceCanon.includes(nodeCanon)) return 80;

  const nodeTokens = new Set(nodeStem.split(/[^a-z0-9]+/).filter(Boolean));
  const sourceTokens = sourceStem.split(/[^a-z0-9]+/).filter(Boolean);
  if (!nodeTokens.size || !sourceTokens.length) return -1;
  const overlap = sourceTokens.filter((t) => nodeTokens.has(t)).length;
  return overlap > 0 ? overlap : -1;
}

function toFileNode(file: SummarizedFileRef, idx: number): FileNode {
  const ext = (file.extension || file.name.split('.').pop() || '').toLowerCase();
  return {
    name: file.name,
    path: `summarized/${idx}/${file.name}`,
    type: 'file',
    extension: ext,
    children: [],
    blobPath: file.blobPath || '',
    file: null,
  };
}

function compactText(value: string, maxLen = SOURCE_TEXT_PREVIEW_CHARS): string {
  if (value.length <= maxLen) return value;
  return `${value.slice(0, maxLen).trimEnd()}...`;
}

export default function SummarisationPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const state = (location.state as LocationState | null) ?? {};
  const [summary] = useState<SummarizationResponse | SummarizationResponse[] | null>(state.summaryResult ?? null);
  const [files] = useState<SummarizedFileRef[]>(state.summarizedFiles ?? []);
  const processed = !!summary && files.length > 0;
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [targetPage, setTargetPage] = useState<number | null>(null);
  const [targetSnippet, setTargetSnippet] = useState<string | null>(null);
  const [jumpToken, setJumpToken] = useState(0);
  const [leftWidth, setLeftWidth] = useState(280);
  const [rightWidth, setRightWidth] = useState(430);

  const nodes = useMemo(() => files.map((f, i) => toFileNode(f, i)), [files]);
  const selectedNode = nodes[selectedIdx] ?? null;
  const activeSummary: SummarizationResponse | null = useMemo(() => {
    if (!summary) return null;
    if (Array.isArray(summary)) {
      const candidate = summary[selectedIdx] ?? summary[0];
      return (candidate as SummarizationResponse) ?? null;
    }
    return summary;
  }, [summary, selectedIdx]);
  const deferredSummary = useDeferredValue(activeSummary);

  const selectSource = (source: { file: string; page?: number; text_snippet?: string }) => {
    const ranked = nodes
      .map((n, i) => ({ idx: i, score: matchScore(n.name, source.file) }))
      .sort((a, b) => b.score - a.score);
    const idx = ranked[0] && ranked[0].score > 0 ? ranked[0].idx : -1;
    if (idx >= 0) {
      setSelectedIdx(idx);
      setTargetPage(source.page ?? null);
      setTargetSnippet(source.text_snippet ?? null);
      setJumpToken((t) => t + 1);
    }
  };

  const renderSources = (sources: unknown) => {
    const list = Array.isArray(sources) ? (sources as SummarizationFieldSource[]) : [];
    if (!list.length) return null;
    const rendered = list.slice(0, MAX_SOURCES_RENDER);
    const hiddenCount = Math.max(0, list.length - rendered.length);
    return (
      <div className="mt-2 space-y-1">
        {rendered.map((source, idx) => {
          const label = source.file
            ? `${source.file}${source.page ? ` (Page ${source.page})` : ''}`
            : source.section || `Source ${idx + 1}`;
          return (
            <div key={`${label}-${idx}`} className="rounded px-2 py-1 text-[11px]" style={{ background: '#F8F7F4', border: '0.5px solid #e0ddd6' }}>
              {source.file ? (
                <button
                  type="button"
                  className="text-left w-full"
                  style={{ color: '#0C447C' }}
                  onClick={() => selectSource({ file: source.file!, page: source.page, text_snippet: source.text_snippet })}
                  title={source.text_snippet || label}
                >
                  {label}
                </button>
              ) : (
                <div className="text-black">{label}</div>
              )}
              {source.text_snippet && <div className="text-black mt-1">{compactText(sanitizeDisplayText(source.text_snippet))}</div>}
              {source.reason && <div className="text-black mt-1">{compactText(sanitizeDisplayText(source.reason))}</div>}
            </div>
          );
        })}
        {hiddenCount > 0 && (
          <div className="text-[10px] text-gray-500 px-1">+{hiddenCount} more source{hiddenCount > 1 ? 's' : ''}</div>
        )}
      </div>
    );
  };

  const renderField = (label: string, value: unknown, depth = 0, path = label): React.ReactNode => {
    if (HIDDEN_KEYS.has(label.trim().toLowerCase())) return null;

    if (isFieldObject(value)) {
      const extraEntries = Object.entries(value as Record<string, unknown>).filter(
        ([k]) => !['value', 'source'].includes(k) && !HIDDEN_KEYS.has(k.trim().toLowerCase()),
      );
      const orderedExtras = sortEntriesByOrder(extraEntries, FIELD_ORDER_BY_SECTION[label] || []);
      const extras = orderedExtras.map(([k, v]) => renderField(k, v, depth + 1, `${path}.${k}`)).filter(Boolean);
      const isOverallSummary = label.trim().toLowerCase() === 'overall_summary';
      const sourceBlock = isOverallSummary ? null : renderSources((value as { source?: unknown }).source);
      const hasDisplayValue = isNonEmptyPrimitive(value.value);

      if (!hasDisplayValue && !extras.length && !sourceBlock) return null;

      return (
        <div key={path} className="rounded-lg px-3 py-2.5" style={{ background: '#FFFFFF', border: '0.5px solid #e0ddd6' }}>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-black">{prettifyLabel(label)}</div>
          {hasDisplayValue && <div className="text-xs text-black mt-1">{sanitizeDisplayText((value as { value: unknown }).value)}</div>}
          {extras.length > 0 && <div className="mt-2 space-y-2">{extras}</div>}
          {sourceBlock}
        </div>
      );
    }

    if (Array.isArray(value)) {
      const includeIndexSuffix = value.length > 1;
      if (!includeIndexSuffix) {
        const sole = value[0];
        if (sole && typeof sole === 'object' && !Array.isArray(sole) && !isFieldObject(sole)) {
          const entries = Object.entries(sole as Record<string, unknown>);
          let renderEntries = entries;
          if (entries.length === 1) {
            const [onlyKey, onlyValue] = entries[0];
            if (normalizeKeyForCompare(onlyKey) === normalizeKeyForCompare(label)) {
              if (onlyValue && typeof onlyValue === 'object' && !Array.isArray(onlyValue)) {
                renderEntries = Object.entries(onlyValue as Record<string, unknown>);
              } else {
                renderEntries = [[onlyKey, onlyValue]];
              }
            }
          }
          const nested = renderEntries
            .map(([k, v]) => renderField(k, v, depth + 1, `${path}[0].${k}`))
            .filter(Boolean);
          if (nested.length) {
            return (
              <div key={path} className="rounded-lg p-2 space-y-2" style={{ background: '#F8F7F4', border: '0.5px solid #e0ddd6' }}>
                <div className="text-xs font-semibold text-black px-1">{prettifyLabel(label)}</div>
                {nested}
              </div>
            );
          }
        }
      }
      const items = value
        .map((item, idx) => {
          const childLabel = includeIndexSuffix ? `${label}_${idx + 1}` : label;
          return renderField(childLabel, item, depth + 1, `${path}[${idx}]`);
        })
        .filter(Boolean);
      if (!items.length) return null;
      return (
        <div key={path} className="rounded-lg p-2 space-y-2" style={{ background: '#F8F7F4', border: '0.5px solid #e0ddd6' }}>
          <div className="text-xs font-semibold text-black px-1">{prettifyLabel(label)}</div>
          {items}
        </div>
      );
    }

    if (value && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>);
      const orderedEntries = sortEntriesByOrder(entries, FIELD_ORDER_BY_SECTION[label] || []);
      const items = orderedEntries
        .map(([k, v]) => renderField(k, v, depth + 1, `${path}.${k}`))
        .filter(Boolean);
      if (!items.length) return null;
      return (
        <div key={path} className="rounded-lg p-2 space-y-2" style={{ background: '#F8F7F4', border: '0.5px solid #e0ddd6' }}>
          <div className="text-xs font-semibold text-black px-1">{prettifyLabel(label)}</div>
          {items}
        </div>
      );
    }

    if (!isNonEmptyPrimitive(value)) return null;
    return (
      <div key={path} className="rounded-lg px-3 py-2.5" style={{ background: '#FFFFFF', border: '0.5px solid #e0ddd6' }}>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-black">{prettifyLabel(label)}</div>
        <div className="text-xs text-black mt-1">{sanitizeDisplayText(value)}</div>
      </div>
    );
  };

  const subHeader = (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-white" style={{ borderBottom: '0.5px solid #e0ddd6', flexShrink: 0 }}>
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={() => navigate('/workspace')}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors px-2 py-1 rounded hover:bg-gray-100"
        >
          <ArrowLeft size={13} /> Back to Workspace
        </button>
        <div style={{ width: 1, height: 16, background: '#e0ddd6' }} />
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: '#E1F5EE', border: '0.5px solid #0F6E56' }}>
            <FileText size={12} style={{ color: '#0F6E56' }} />
          </div>
          <span className="text-sm font-semibold text-gray-800">Summarisation Full View</span>
        </div>
      </div>

      <div>
        <button
          type="button"
          onClick={() => navigate('/summarize-other-files')}
          className="text-xs px-3 py-1.5 rounded-md font-semibold"
          style={{ background: '#E6F1FB', color: '#0C447C', border: '0.5px solid #185FA5' }}
        >
          Summarize other files
        </button>
      </div>
    </div>
  );

  const uploadView = (
    <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4">
      <p className="text-sm text-gray-600 text-center max-w-md">
        Run summarisation from the workspace panel first, then click &quot;Open Full View&quot;.
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
    <div className="h-full overflow-y-auto p-3 space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">Summarized Files</div>
      {nodes.map((node, idx) => (
        <button
          key={node.path}
          type="button"
          onClick={() => {
            setSelectedIdx(idx);
            setTargetPage(null);
            setTargetSnippet(null);
            setJumpToken((t) => t + 1);
          }}
          className="w-full text-left rounded-lg px-3 py-2 text-xs"
          style={{
            background: selectedIdx === idx ? '#E6F1FB' : '#FFFFFF',
            border: selectedIdx === idx ? '0.5px solid #185FA5' : '0.5px solid #e0ddd6',
            color: selectedIdx === idx ? '#0C447C' : '#1F2937',
          }}
        >
          {node.name}
          {!node.blobPath && <div className="text-[10px] text-amber-700 mt-1">Preview unavailable (local upload)</div>}
        </button>
      ))}
    </div>
  ) : null;

  const middlePanel = processed ? (
    selectedNode?.blobPath ? (
      <MiddlePanel selectedFile={selectedNode} targetPage={targetPage} targetSnippet={targetSnippet} jumpToken={jumpToken} />
    ) : (
      <div className="h-full flex items-center justify-center text-xs text-gray-400">Preview unavailable for this file.</div>
    )
  ) : <div />;

  const rightPanel = processed && deferredSummary ? (
    <div className="h-full overflow-y-auto p-3 space-y-2">
      {sortEntriesByOrder(Object.entries(deferredSummary), SECTION_ORDER).map(([sectionKey, sectionVal]) => {
        return renderField(sectionKey, sectionVal);
      })}
    </div>
  ) : null;

  return (
    <ResponsivePage
      topBar={<TopBarSimple user={user} onLogout={() => { logout(); navigate('/login'); }} />}
      subHeader={subHeader}
      leftPanel={leftPanel ?? undefined}
      middlePanel={middlePanel}
      rightPanel={rightPanel ?? undefined}
      uploadView={uploadView}
      processed={processed}
      leftLabel="Files"
      middleLabel="Preview"
      rightLabel="Results"
      leftPanelWidth={leftWidth}
      rightPanelWidth={rightWidth}
      onLeftDrag={(delta) => setLeftWidth((prev) => Math.max(220, Math.min(520, prev + delta)))}
      onRightDrag={(delta) => setRightWidth((prev) => Math.max(280, Math.min(640, prev - delta)))}
    />
  );
}
