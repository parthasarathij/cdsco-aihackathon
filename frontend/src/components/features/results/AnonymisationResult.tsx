import { AnonymisationSkeleton } from '../../Skeleton';

interface Data {
  totalEntities: number;
  compliant: string;
  kAnonymity: number;
  samples: { original: string; pseudonym: string; type: string }[];
  entityBreakdown: { type: string; count: number }[];
}

export default function AnonymisationResult({ data, isLoading = false }: { data: Data; isLoading?: boolean }) {
  if (isLoading) return <AnonymisationSkeleton />;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'PII Detected', value: data.totalEntities },
          { label: 'k-Anonymity', value: data.kAnonymity },
          { label: 'Status', value: '✓' },
        ].map(m => (
          <div key={m.label} className="rounded-md p-2 text-center" style={{ background: '#FAECE7', border: '0.5px solid #993C1D' }}>
            <div className="text-base font-medium" style={{ color: '#712B13' }}>{m.value}</div>
            <div className="text-xs mt-0.5" style={{ color: '#993C1D' }}>{m.label}</div>
          </div>
        ))}
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-2">Sample Pseudonymisation</p>
        <div className="space-y-1.5">
          {data.samples.map((s, i) => (
            <div key={i} className="rounded-md p-2 text-xs" style={{ background: '#FAECE7', border: '0.5px solid #993C1D' }}>
              <div className="text-gray-400 mb-1">{s.type}</div>
              <div className="flex items-center gap-2">
                <span className="text-gray-600 line-through">{s.original}</span>
                <span className="text-gray-400">→</span>
                <span className="font-medium" style={{ color: '#712B13' }}>{s.pseudonym}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-2">Entity Breakdown</p>
        <div className="space-y-1.5">
          {data.entityBreakdown.map(e => (
            <div key={e.type} className="flex items-center gap-2">
              <div className="flex-1 text-xs text-gray-600">{e.type}</div>
              <div className="h-1.5 rounded-full flex-1 bg-gray-100">
                <div className="h-full rounded-full" style={{ width: `${(e.count / data.totalEntities) * 100}%`, background: '#993C1D' }} />
              </div>
              <div className="text-xs text-gray-500 w-4 text-right">{e.count}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-md p-2 text-xs text-center font-medium" style={{ background: '#E1F5EE', color: '#085041', border: '0.5px solid #0F6E56' }}>
        ✓ {data.compliant}
      </div>
    </div>
  );
}
