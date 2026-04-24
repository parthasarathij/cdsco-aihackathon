import type { FileNode, FeatureId } from '../../types';
import FeatureList from '../features/FeatureList';
import ResultView from '../features/ResultView';

interface Props {
  selectedFile: FileNode | null;
  selectedFeature: FeatureId | null;
  resultVisible: boolean;
  loading: boolean;
  onSelectFeature: (id: FeatureId) => void;
  onRun: () => void;
  onBack: () => void;
  style?: React.CSSProperties;
}

export default function RightPanel({ selectedFile, selectedFeature, resultVisible, loading, onSelectFeature, onRun, onBack, style }: Props) {
  return (
    <aside className="flex flex-col bg-white border-l" style={{ ...style, borderLeftWidth: '0.5px', borderColor: '#e0ddd6', flexShrink: 0 }}>
      {/* Header */}
      <div className="px-3 py-2.5 border-b" style={{ borderBottomWidth: '0.5px', borderColor: '#e0ddd6' }}>
        <span className="text-xs font-medium uppercase tracking-wider text-gray-400">AI Features</span>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400">
            <div className="w-7 h-7 rounded-full border-2 border-gray-200 border-t-blue-500 animate-spin" />
            <span className="text-xs">Processing…</span>
          </div>
        ) : resultVisible && selectedFeature ? (
          <ResultView featureId={selectedFeature} onBack={onBack} />
        ) : (
          <FeatureList
            selectedFile={selectedFile}
            selectedFeature={selectedFeature}
            onSelectFeature={onSelectFeature}
            onRun={onRun}
          />
        )}
      </div>
    </aside>
  );
}
