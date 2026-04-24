import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { FileNode } from '../../types';
import type { AnonymisationJsonReport, AnonymisationResultItem } from '../../types/anonymisation';
import { ExternalLink, Play } from 'lucide-react';
import { AnonymisationSkeleton } from '../Skeleton';
import { fileFromBlobPath, runAnonymisationRoutesForFile } from '../../api/anonymisationClient';
import { isAnonymisableFile } from '../../utils/collectAnonymisableFiles';

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
  const source = (entityType || '').toUpperCase();
  const key = source.split(/[\s_-]/)[0] ?? '';
  for (const k of Object.keys(TYPE_COLORS)) {
    if (key.includes(k) || source.includes(k)) return TYPE_COLORS[k];
  }
  let hash = 0;
  for (let i = 0; i < source.length; i++) hash = (hash * 31 + source.charCodeAt(i)) >>> 0;
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

export default function AnonymisationFeature({
  selectedFile,
  onClearSelectedFile: _,
}: {
  selectedFile: FileNode | null;
  onClearSelectedFile?: () => void;
}) {
  const UI_SCALE = 0.8;
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [pipelineStep, setPipelineStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [previewMode, setPreviewMode] = useState<'pseudonymised' | 'anonymised'>('pseudonymised');
  const [lastReport, setLastReport] = useState<AnonymisationJsonReport | null>(null);
  const [lastItems, setLastItems] = useState<AnonymisationResultItem[]>([]);

  const eligible = selectedFile && isAnonymisableFile(selectedFile);

  const handleRun = async () => {
    if (!selectedFile || !eligible || !selectedFile.blobPath) return;
    setError(null);
    setLoading(true);
    setDone(false);
    setPipelineStep('Fetching file…');
    try {
      const file = await fileFromBlobPath(selectedFile.blobPath, selectedFile.name);
      const { report, pseudoBlob, pseudoBlobPath, fullBlob, fullBlobPath } = await runAnonymisationRoutesForFile(file, (step) => {
        if (step === 'json') setPipelineStep('Fetching Data…');
        else if (step === 'pseudo') setPipelineStep('Making Pseudo');
        else setPipelineStep('Making Anonymised');
      });
      setPipelineStep('Done (json + pseudo + full)');
      const item: AnonymisationResultItem = {
        path: selectedFile.path,
        name: selectedFile.name,
        file,
        blobPath: selectedFile.blobPath,
        report,
        pseudoBlob,
        pseudoBlobPath: pseudoBlobPath ?? undefined,
        fullBlob,
        fullBlobPath: fullBlobPath ?? undefined,
      };
      setLastReport(report);
      setLastItems([item]);
      setDone(true);
    } catch (e) {
      setPipelineStep(null);
      setError("Something went wrong while anonymising your file. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const changes = lastReport?.changes ?? [];
  const entityCountData = Object.entries(
    changes.reduce<Record<string, { count: number; color: { bg: string; border: string; text: string } }>>((acc, row) => {
      const label = normalizeEntityLabel(row.entity_type ?? '');
      if (!acc[label]) {
        acc[label] = { count: 0, color: colorForEntityType(row.entity_type ?? label) };
      }
      acc[label].count += 1;
      return acc;
    }, {}),
  ).sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]));

  return (
    <div className="h-full overflow-hidden">
      <div
        className="flex flex-col"
        style={{
          transform: `scale(${UI_SCALE})`,
          transformOrigin: 'top left',
          width: `${100 / UI_SCALE}%`,
          height: `${100 / UI_SCALE}%`,
        }}
      >
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div className="rounded-lg px-3 py-2 text-xs" style={{ background: '#F8F7F4', border: '0.5px solid #e0ddd6' }}>
          {selectedFile ? (
            <span className="text-gray-600 font-medium">{selectedFile.name}</span>
          ) : (
            <span className="text-gray-400">No file selected — pick a DOCX or PDF from the tree</span>
          )}
          {selectedFile && !eligible && (
            <div className="mt-1 text-amber-800">Only .docx and .pdf are supported.</div>
          )}
        </div>

        {error && (
          <div className="rounded-lg px-3 py-2 text-xs text-red-800" style={{ background: '#FEE2E2', border: '0.5px solid #DC2626' }}>
            {error}
          </div>
        )}

        {loading && (
          <div className="space-y-2">
            {pipelineStep && (
              <div className="text-[10px] text-gray-500 text-center">{pipelineStep}</div>
            )}
            <AnonymisationSkeleton />
          </div>
        )}

        {!loading && done && lastReport && (
          <>
            <div
              className="rounded-xl px-3 py-2.5 text-[13px] font-semibold text-center"
              style={{ background: '#E1F5EE', border: '0.5px solid #0F6E56', color: '#085041' }}
            >
              ✓ DPDP Compliant · {lastReport.total_entities_found ?? changes.length} entities found
            </div>
            <div className="flex items-center justify-end">
              <select
                value={previewMode}
                onChange={(e) => setPreviewMode(e.target.value as 'pseudonymised' | 'anonymised')}
                className="text-[11px] font-semibold rounded-md px-2 py-1 cursor-pointer border h-8"
                style={{ color: '#4b5563', borderColor: '#6366f1', background: '#f8f9ff' }}
              >
                <option value="pseudonymised">Pseudonymised</option>
                <option value="anonymised">Fully anonymised</option>
              </select>
            </div>
            {changes.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Detected entities</p>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {changes.map((row, i) => {
                    const c = colorForEntityType(row.entity_type);
                    return (
                      <div key={i} className="rounded-2xl p-3 text-[11px]" style={{ background: c.bg, border: `0.5px solid ${c.border}` }}>
                        <div className="font-semibold mb-1 text-[14px]" style={{ color: c.text }}>
                          {row.entity_type || 'Entity'}
                        </div>
                        <div className="flex items-center gap-2 text-[12px] leading-snug">
                          <span className="text-gray-500 line-through truncate" title={row.original_value ?? ''}>
                            {row.original_value || '—'}
                          </span>
                          <span className="text-gray-400">→</span>
                          <span
                            className="font-medium truncate"
                            style={{ color: c.text }}
                            title={
                              previewMode === 'anonymised'
                                ? (row.full_anon_value ?? '')
                                : (row.pseudo_value ?? '')
                            }
                          >
                            {previewMode === 'anonymised'
                              ? (row.full_anon_value || '—')
                              : (row.pseudo_value || '—')}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {entityCountData.length > 0 && (
              <div className="rounded-xl p-3" style={{ background: '#F8F7F4', border: '0.5px solid #e0ddd6' }}>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Entity counts</p>
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
            )}
            <button
              type="button"
              onClick={() =>
                navigate('/anonymisation/results', {
                  state: { anonymisationItems: lastItems.length ? lastItems : [] },
                })
              }
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold"
              style={{ background: '#FAECE7', color: '#712B13', border: '0.5px solid #993C1D' }}
            >
              <ExternalLink size={11} /> Open full view
            </button>
          </>
        )}
      </div>

      <div className="p-3" style={{ borderTop: '0.5px solid #e0ddd6' }}>
        <button
          type="button"
          onClick={handleRun}
          disabled={!eligible || loading}
          className="w-full py-2 rounded-lg text-xs font-semibold text-white flex items-center justify-center gap-1.5 disabled:opacity-40"
          style={{ background: '#993C1D' }}
        >
          {loading ? 'Processing…' : (
            <>
              <Play size={11} /> Run anonymisation
            </>
          )}
        </button>
      </div>
      </div>
    </div>
  );
}
