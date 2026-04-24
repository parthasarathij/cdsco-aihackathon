import type { FileNode, FeatureId } from '../../types';
import { FEATURES } from '../../utils/features';

const colorMap: Record<string, { bg: string; border: string; text: string; abbr: string }> = {
  coral:  { bg: '#FAECE7', border: '#993C1D', text: '#712B13', abbr: '#993C1D' },
  teal:   { bg: '#E1F5EE', border: '#0F6E56', text: '#085041', abbr: '#0F6E56' },
  brand:  { bg: '#E6F1FB', border: '#185FA5', text: '#0C447C', abbr: '#185FA5' },
  amber:  { bg: '#FAEEDA', border: '#854F0B', text: '#633806', abbr: '#854F0B' },
  purple: { bg: '#EEEDFE', border: '#534AB7', text: '#3C3489', abbr: '#534AB7' },
};

const descriptions: Record<FeatureId, string> = {
  anonymisation: 'Detect & pseudonymise PII entities. DPDP compliant.',
  summarisation: 'Extract key insights and flag critical issues.',
  completeness: 'Check required fields and flag inconsistencies.',
  classification: 'Classify severity and priority of SAE reports.',
};

interface Props {
  selectedFile: FileNode | null;
  selectedFeature: FeatureId | null;
  onSelectFeature: (id: FeatureId) => void;
  onRun: () => void;
}

export default function FeatureList({ selectedFile, selectedFeature, onSelectFeature, onRun }: Props) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto scrollbar-thin space-y-1.5 p-3">
        {FEATURES.map(f => {
          const c = colorMap[f.color];
          const isSelected = selectedFeature === f.id;
          return (
            <button
              key={f.id}
              onClick={() => onSelectFeature(f.id)}
              disabled={!selectedFile}
              className="w-full text-left rounded-lg p-2.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: isSelected ? c.bg : '#FAFAF8',
                border: `0.5px solid ${isSelected ? c.border : '#e0ddd6'}`,
                outline: isSelected ? `1.5px solid ${c.border}` : 'none',
                outlineOffset: '-1px',
              }}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-medium text-white shrink-0"
                  style={{ background: c.abbr }}>
                  {f.abbr}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-medium text-gray-800">{f.label}</div>
                  <div className="text-xs text-gray-400 mt-0.5 leading-tight">{descriptions[f.id]}</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Run button */}
      <div className="p-3 border-t" style={{ borderTopWidth: '0.5px', borderColor: '#e0ddd6' }}>
        <button
          onClick={onRun}
          disabled={!selectedFile || !selectedFeature}
          className="w-full py-2 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: '#185FA5' }}
        >
          {selectedFeature
            ? `Run: ${FEATURES.find(f => f.id === selectedFeature)?.label} →`
            : 'Select a feature to run'}
        </button>
        {!selectedFile && (
          <p className="text-xs text-center text-gray-400 mt-1.5">Open a document first</p>
        )}
      </div>
    </div>
  );
}
