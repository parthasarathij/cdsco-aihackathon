import { SummarisationSkeleton } from '../../Skeleton';

interface Data {
  docType: string;
  summary: string;
  flaggedItems: { severity: string; text: string }[];
  scores: { rouge1: number; rouge2: number; bertScore: number };
}

export default function SummarisationResult({ data, isLoading = false }: { data: Data; isLoading?: boolean }) {
  if (isLoading) return <SummarisationSkeleton />;
  return (
    <div className="space-y-3">
      <div className="rounded-md p-2.5 text-xs" style={{ background: '#E1F5EE', border: '0.5px solid #0F6E56' }}>
        <div className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: '#0F6E56' }}>Document Type</div>
        <div className="font-medium" style={{ color: '#085041' }}>{data.docType}</div>
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-1.5">Summary</p>
        <p className="text-xs text-gray-600 leading-relaxed" style={{ background: '#F8F7F4', padding: '10px', borderRadius: 6, border: '0.5px solid #e0ddd6' }}>
          {data.summary}
        </p>
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-1.5">Flagged Items</p>
        <div className="space-y-1.5">
          {data.flaggedItems.map((item, i) => (
            <div key={i} className="flex gap-2 rounded-md p-2 text-xs"
              style={item.severity === 'high'
                ? { background: '#FAECE7', border: '0.5px solid #993C1D', color: '#712B13' }
                : { background: '#FAEEDA', border: '0.5px solid #854F0B', color: '#633806' }}>
              <span>{item.severity === 'high' ? '⚠' : '◆'}</span>
              <span>{item.text}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-1.5">Quality Scores</p>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'ROUGE-1', value: data.scores.rouge1 },
            { label: 'ROUGE-2', value: data.scores.rouge2 },
            { label: 'BERTScore', value: data.scores.bertScore },
          ].map(s => (
            <div key={s.label} className="rounded-md p-2 text-center" style={{ background: '#E1F5EE', border: '0.5px solid #0F6E56' }}>
              <div className="text-sm font-medium" style={{ color: '#085041' }}>{s.value.toFixed(2)}</div>
              <div className="text-xs mt-0.5" style={{ color: '#0F6E56' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
