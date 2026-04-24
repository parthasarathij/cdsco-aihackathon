import { CompletenessSkeleton } from '../../Skeleton';

interface Data {
  score: number;
  missingFields: string[];
  inconsistencies: { field: string; values: string[]; severity: string }[];
}

export default function CompletenessResult({ data, isLoading = false }: { data: Data; isLoading?: boolean }) {
  if (isLoading) return <CompletenessSkeleton />;
  const radius = 28;
  const circ = 2 * Math.PI * radius;
  const dash = (data.score / 100) * circ;

  return (
    <div className="space-y-3">
      {/* Score ring */}
      <div className="flex items-center gap-4 rounded-md p-3" style={{ background: '#E6F1FB', border: '0.5px solid #185FA5' }}>
        <svg width="72" height="72" viewBox="0 0 72 72">
          <circle cx="36" cy="36" r={radius} fill="none" stroke="#c8ddf0" strokeWidth="6" />
          <circle
            cx="36" cy="36" r={radius} fill="none"
            stroke="#185FA5" strokeWidth="6"
            strokeDasharray={`${dash} ${circ}`}
            strokeLinecap="round"
            transform="rotate(-90 36 36)"
          />
          <text x="36" y="40" textAnchor="middle" fontSize="13" fontWeight="500" fill="#0C447C">{data.score}%</text>
        </svg>
        <div>
          <div className="text-sm font-medium" style={{ color: '#0C447C' }}>Completeness Score</div>
          <div className="text-xs mt-0.5" style={{ color: '#185FA5' }}>{data.missingFields.length} fields missing · {data.inconsistencies.length} inconsistencies</div>
        </div>
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-1.5">Missing Fields</p>
        <div className="space-y-1">
          {data.missingFields.map((f, i) => (
            <div key={i} className="flex items-center gap-2 rounded px-2 py-1.5 text-xs" style={{ background: '#FAECE7', border: '0.5px solid #993C1D', color: '#712B13' }}>
              <span>✗</span>
              <span>{f}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-1.5">Inconsistencies</p>
        <div className="space-y-1.5">
          {data.inconsistencies.map((inc, i) => (
            <div key={i} className="rounded-md p-2 text-xs"
              style={inc.severity === 'amber'
                ? { background: '#FAEEDA', border: '0.5px solid #854F0B' }
                : { background: '#F1EFE8', border: '0.5px solid #5F5E5A' }}>
              <div className="font-medium mb-1" style={{ color: inc.severity === 'amber' ? '#633806' : '#444441' }}>{inc.field}</div>
              <div className="flex gap-1 flex-wrap">
                {inc.values.map((v, vi) => (
                  <span key={vi} className="px-1.5 py-0.5 rounded text-xs" style={{ background: 'rgba(0,0,0,0.06)' }}>{v}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
