import type { FeatureId } from '../types';

export const FEATURES: { id: FeatureId; label: string; abbr: string; color: string }[] = [
  { id: 'anonymisation', label: 'Anonymisation', abbr: 'AN', color: 'coral' },
  { id: 'summarisation', label: 'Summarisation', abbr: 'SU', color: 'teal' },
  { id: 'completeness', label: 'Completeness Check, Consistency Check and Version Check', abbr: 'CK', color: 'brand' },
  { id: 'classification', label: 'Classification', abbr: 'CL', color: 'amber' },
];