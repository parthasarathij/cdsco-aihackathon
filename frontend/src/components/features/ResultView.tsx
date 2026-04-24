import { ArrowLeft } from 'lucide-react';
import type { FeatureId } from '../../types';
import { FEATURES } from '../../utils/features';
import AnonymisationResult from './results/AnonymisationResult';
import SummarisationResult from './results/SummarisationResult';
import CompletenessResult from './results/CompletenessResult';
import ClassificationResult from './results/ClassificationResult';


import {
  ClassificationSkeleton,
  AnonymisationSkeleton,
  SummarisationSkeleton,
  CompletenessSkeleton,

} from '../Skeleton';

interface Props {
  featureId: FeatureId;
  onBack: () => void;
  isLoading?: boolean;
}

const colorMap: Record<string, { bg: string; border: string; text: string }> = {
  coral:  { bg: '#FAECE7', border: '#993C1D', text: '#712B13' },
  teal:   { bg: '#E1F5EE', border: '#0F6E56', text: '#085041' },
  brand:  { bg: '#E6F1FB', border: '#185FA5', text: '#0C447C' },
  amber:  { bg: '#FAEEDA', border: '#854F0B', text: '#633806' },
  purple: { bg: '#EEEDFE', border: '#534AB7', text: '#3C3489' },
};

const skeletonMap: Record<FeatureId, () => React.JSX.Element> = {
  anonymisation: AnonymisationSkeleton,
  summarisation: SummarisationSkeleton,
  completeness: CompletenessSkeleton,
  classification: ClassificationSkeleton,

};

export default function ResultView({ featureId, onBack, isLoading = false }: Props) {
  const feature = FEATURES.find(f => f.id === featureId)!;
  const c = colorMap[feature.color];
  const data = null; 
  const SkeletonComponent = skeletonMap[featureId];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b" style={{ borderBottomWidth: '0.5px', borderColor: '#e0ddd6' }}>
        <button onClick={onBack} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 transition-colors" disabled={isLoading}>
          <ArrowLeft size={12} />
          Back
        </button>
        <div className="w-px h-3 bg-gray-200 mx-1" />
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded flex items-center justify-center text-white text-xs" style={{ background: c.border, fontSize: 9 }}>
            {feature.abbr}
          </div>
          <span className="text-xs font-medium text-gray-700">{feature.label}</span>
        </div>
      </div>

      {/* Result content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-3">
        {isLoading ? (
          <SkeletonComponent />
        ) : data ? (
          <>
            {featureId === 'anonymisation' && <AnonymisationResult data={data as any} />}
            {featureId === 'summarisation' && <SummarisationResult data={data as any} />}
            {featureId === 'completeness' && <CompletenessResult data={data as any} />}
            {featureId === 'classification' && <ClassificationResult data={data as any} />}
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            No results available. Please process a file to view results.
          </div>
        )}
      </div>
    </div>
  );
}
