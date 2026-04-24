import { ClassificationSkeleton } from '../../Skeleton';

interface Data {
  severity: string;
  severityColor: string;
  priorityScore: number;
  duplicate: boolean;
  recommendation: string;
  caseDetails: { label: string; value: string }[];
}

export default function ClassificationResult({ data, isLoading = false }: { data: Data; isLoading?: boolean }) {
  if (isLoading) return <ClassificationSkeleton />;
  const pct = (data.priorityScore / 10) * 100;

  return (
    <div className="space-y-3">
      {/* Severity badge */}
      <div className="flex items-center justify-between rounded-md p-3" style={{ background: '#FAEEDA', border: '0.5px solid #854F0B' }}>
        <div>
          <div className="text-xs text-gray-500 mb-1">Severity Classification</div>
          <div className="text-sm font-medium" style={{ color: '#633806' }}>{data.severity}</div>
        </div>
        <span className="px-2.5 py-1 rounded-full text-xs font-medium" style={{ background: '#854F0B', color: '#fff' }}>
          SAE
        </span>
      </div>

      {/* Priority score */}
      <div className="rounded-md p-3" style={{ background: '#F8F7F4', border: '0.5px solid #e0ddd6' }}>
        <div className="flex justify-between text-xs mb-2">
          <span className="text-gray-500">Priority Score</span>
          <span className="font-medium" style={{ color: '#633806' }}>{data.priorityScore} / 10</span>
        </div>
        <div className="h-2 rounded-full bg-gray-100">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #854F0B, #d97706)' }} />
        </div>
      </div>

      {/* Duplicate check */}
      <div className="flex items-center gap-2 rounded-md px-3 py-2 text-xs"
        style={data.duplicate
          ? { background: '#FAECE7', border: '0.5px solid #993C1D', color: '#712B13' }
          : { background: '#E1F5EE', border: '0.5px solid #0F6E56', color: '#085041' }}>
        <span>{data.duplicate ? '⚠ Duplicate detected' : '✓ No duplicate found'}</span>
      </div>

      {/* Case details */}
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-1.5">Case Details</p>
        <div className="space-y-1">
          {data.caseDetails.map(d => (
            <div key={d.label} className="flex gap-2 text-xs py-1 border-b" style={{ borderBottomWidth: '0.5px', borderColor: '#e8e6e0' }}>
              <span className="text-gray-400 w-28 shrink-0">{d.label}</span>
              <span className="text-gray-700">{d.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recommendation */}
      <div className="rounded-md p-2.5 text-xs font-medium" style={{ background: '#FAEEDA', border: '0.5px solid #854F0B', color: '#633806' }}>
        → {data.recommendation}
      </div>
    </div>
  );
}
