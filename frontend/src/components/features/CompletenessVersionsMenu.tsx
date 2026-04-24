import { CheckSquare, ArrowRight } from 'lucide-react';

interface CompletenessVersionsMenuProps {
  onSelectCompletenessCheck: () => void;
  onSelectConsistencyCheck: () => void;
  onSelectVersionsCheck: () => void;
}

export default function CompletenessVersionsMenu({ 
  onSelectCompletenessCheck,
  onSelectConsistencyCheck,
  onSelectVersionsCheck 
}: CompletenessVersionsMenuProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center justify-center">
        <div className="w-full max-w-sm space-y-4">
          {/* Header */}
          <div className="mb-8 text-center">
            <div className="flex items-center justify-center mb-3">
              <div 
                className="w-12 h-12 rounded-lg flex items-center justify-center"
                style={{ background: '#E6F1FB', border: '0.5px solid #185FA5' }}
              >
                <CheckSquare size={20} style={{ color: '#0C447C' }} />
              </div>
            </div>
            <h2 className="text-lg font-semibold text-gray-800 mb-1">Completeness, Consistency & Versions Check</h2>
            <p className="text-sm text-gray-500">Select an option to proceed</p>
          </div>

          {/* Completeness Check Option */}
          <button
            onClick={onSelectCompletenessCheck}
            className="w-full p-4 rounded-lg border transition-all hover:shadow-md"
            style={{
              background: '#f8f7f4',
              border: '0.5px solid #E5E7EB',
              textAlign: 'left'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#E6F1FB';
              e.currentTarget.style.borderColor = '#185FA5';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#f8f7f4';
              e.currentTarget.style.borderColor = '#E5E7EB';
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-gray-800 text-sm mb-1">Completeness Check</div>
                <div className="text-xs text-gray-500">Verify missing fields in documents</div>
              </div>
              <ArrowRight size={16} className="text-gray-400 flex-shrink-0" />
            </div>
          </button>

          {/* Consistency Check Option */}
          <button
            onClick={onSelectConsistencyCheck}
            className="w-full p-4 rounded-lg border transition-all hover:shadow-md"
            style={{
              background: '#f8f7f4',
              border: '0.5px solid #E5E7EB',
              textAlign: 'left'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#FAEEDA';
              e.currentTarget.style.borderColor = '#854F0B';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#f8f7f4';
              e.currentTarget.style.borderColor = '#E5E7EB';
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-gray-800 text-sm mb-1">Consistency Check</div>
                <div className="text-xs text-gray-500">Verify consistency across documents</div>
              </div>
              <ArrowRight size={16} className="text-gray-400 flex-shrink-0" />
            </div>
          </button>

          {/* Versions Check Option */}
          <button
            onClick={onSelectVersionsCheck}
            className="w-full p-4 rounded-lg border transition-all hover:shadow-md"
            style={{
              background: '#f8f7f4',
              border: '0.5px solid #E5E7EB',
              textAlign: 'left'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#E1F5EE';
              e.currentTarget.style.borderColor = '#0F6E56';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#f8f7f4';
              e.currentTarget.style.borderColor = '#E5E7EB';
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-gray-800 text-sm mb-1">Versions Check</div>
                <div className="text-xs text-gray-500">Compare and analyze document versions</div>
              </div>
              <ArrowRight size={16} className="text-gray-400 flex-shrink-0" />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
