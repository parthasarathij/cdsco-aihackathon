const shimmerStyle = `
  @keyframes shimmer {
    0% {
      backgroundPosition: -200% center;
    }
    50% {
      backgroundPosition: 100% center;
    }
    100% {
      backgroundPosition: 200% center;
    }
  }
`;

interface SkeletonProps {
  className?: string;
  count?: number;
}

export function SkeletonLine({ className = 'h-4 w-full' }: SkeletonProps) {
  return (
    <div
      className={`${className} bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 rounded`}
      style={{
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s ease-in-out infinite',
      }}
    />
  );
}

export function SkeletonBox({ className = 'h-12 w-12' }: SkeletonProps) {
  return (
    <div
      className={`${className} bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 rounded`}
      style={{
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s ease-in-out infinite',
      }}
    />
  );
}

export function ClassificationSkeleton() {
  return (
    <>
      <style>{shimmerStyle}</style>
      <div className="space-y-3">
        {/* Severity badge skeleton */}
        <div className="flex items-center justify-between rounded-md p-3" style={{ background: '#F8F7F4', border: '0.5px solid #e0ddd6' }}>
          <div className="flex-1">
            <SkeletonLine className="h-3 w-20 mb-2" />
            <SkeletonLine className="h-5 w-32" />
          </div>
          <SkeletonBox className="h-7 w-16 rounded-full" />
        </div>

        {/* Priority score skeleton */}
        <div className="rounded-md p-3" style={{ background: '#F8F7F4', border: '0.5px solid #e0ddd6' }}>
          <div className="flex justify-between mb-2">
            <SkeletonLine className="h-3 w-24" />
            <SkeletonLine className="h-3 w-16" />
          </div>
          <SkeletonBox className="h-2 w-full rounded-full" />
        </div>

        {/* Duplicate check skeleton */}
        <div className="rounded-md px-3 py-2" style={{ background: '#F8F7F4', border: '0.5px solid #e0ddd6' }}>
          <SkeletonLine className="h-3 w-48" />
        </div>

        {/* Case details skeleton */}
        <div>
          <SkeletonLine className="h-3 w-32 mb-2" />
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex gap-2">
                <SkeletonLine className="h-3 w-24 shrink-0" />
                <SkeletonLine className="h-3 flex-1" />
              </div>
            ))}
          </div>
        </div>

        {/* Recommendation skeleton */}
        <div className="rounded-md p-2.5" style={{ background: '#F8F7F4', border: '0.5px solid #e0ddd6' }}>
          <SkeletonLine className="h-4 w-full" />
        </div>
      </div>
    </>
  );
}

// Anonymisation Result Skeleton
export function AnonymisationSkeleton() {
  return (
    <div className="space-y-3">
      {/* Success message skeleton */}
      <div className="rounded-lg px-3 py-2" style={{ background: '#F8F7F4', border: '0.5px solid #e0ddd6' }}>
        <SkeletonLine className="h-4 w-56" />
      </div>

      {/* Entity list skeleton */}
      <div>
        <SkeletonLine className="h-3 w-32 mb-3" />
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center gap-2 rounded-md p-2.5 bg-gray-50">
              <SkeletonBox className="h-4 w-24 rounded" />
              <SkeletonLine className="h-3 flex-1" />
              <SkeletonLine className="h-3 w-24" />
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes shimmer {
          0% {
            backgroundPosition: -200% center;
          }
          100% {
            backgroundPosition: 200% center;
          }
        }
      `}</style>
    </div>
  );
}

// Summarisation Result Skeleton
export function SummarisationSkeleton() {
  return (
    <div className="space-y-3">
      {/* Summary section skeleton */}
      <div className="rounded-md p-3" style={{ background: '#F8F7F4', border: '0.5px solid #e0ddd6' }}>
        <SkeletonLine className="h-3 w-24 mb-2" />
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <SkeletonLine key={i} className="h-3 w-full" />
          ))}
          <SkeletonLine className="h-3 w-2/3" />
        </div>
      </div>

      {/* Key points skeleton */}
      <div>
        <SkeletonLine className="h-3 w-20 mb-2" />
        <div className="space-y-1">
          {[...Array(3)].map((_, i) => (
            <SkeletonLine key={i} className="h-3 w-full" />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes shimmer {
          0% {
            backgroundPosition: -200% center;
          }
          100% {
            backgroundPosition: 200% center;
          }
        }
      `}</style>
    </div>
  );
}

// Completeness Result Skeleton
export function CompletenessSkeleton() {
  return (
    <>
      <style>{shimmerStyle}</style>
      <div className="space-y-3">
        {/* Completion percentage skeleton */}
        <div className="rounded-md p-3" style={{ background: '#F8F7F4', border: '0.5px solid #e0ddd6' }}>
          <div className="flex justify-between mb-2">
            <SkeletonLine className="h-3 w-28" />
            <SkeletonLine className="h-3 w-12" />
          </div>
          <SkeletonBox className="h-3 w-full rounded-full" />
        </div>

        {/* Missing fields skeleton */}
        <div>
          <SkeletonLine className="h-3 w-32 mb-2" />
          <div className="space-y-1.5">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <SkeletonBox className="h-4 w-4 rounded" />
                <SkeletonLine className="h-3 flex-1" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}



// Generic skeleton container
export function GenericSkeleton() {
  return (
    <div className="space-y-4 p-3">
      <SkeletonLine className="h-6 w-2/3" />
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <SkeletonLine key={i} className="h-4 w-full" />
        ))}
      </div>
    </div>
  );
}

// Classification Page - Case List Skeleton
export function CaseListSkeleton() {
  return (
    <div className="space-y-2 px-3 py-3">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="rounded-lg p-3" style={{ background: '#F8F7F4', border: '0.5px solid #e0ddd6' }}>
          <div className="flex items-center justify-between mb-2">
            <SkeletonLine className="h-4 w-32" />
            <SkeletonBox className="h-6 w-16 rounded-full" />
          </div>
          <SkeletonLine className="h-3 w-full mb-2" />
          <div className="flex gap-4 text-xs">
            <SkeletonLine className="h-3 w-20" />
            <SkeletonLine className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

// Anonymisation Page - Entity List Skeleton
export function EntityListSkeleton() {
  return (
    <div className="space-y-2 px-3 py-3">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="rounded-lg p-2.5" style={{ background: '#F8F7F4', border: '0.5px solid #e0ddd6' }}>
          <div className="flex items-center justify-between mb-2">
            <SkeletonLine className="h-3 w-24" />
            <SkeletonBox className="h-5 w-20 rounded" />
          </div>
          <SkeletonLine className="h-3 w-full mb-1" />
          <SkeletonLine className="h-3 w-3/4" />
        </div>
      ))}
    </div>
  );
}

// Document Table Skeleton
export function DocumentTableSkeleton() {
  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-2 border-b" style={{ borderColor: '#e0ddd6' }}>
        <SkeletonBox className="h-4 w-4" />
        <SkeletonLine className="h-3 w-24" />
        <SkeletonLine className="h-3 flex-1" />
        <SkeletonLine className="h-3 w-20" />
      </div>
      {/* Rows */}
      {[...Array(4)].map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-3 border-b" style={{ borderColor: '#f0ede8' }}>
          <SkeletonBox className="h-4 w-4 rounded-sm" />
          <SkeletonLine className="h-3 w-28" />
          <SkeletonLine className="h-3 flex-1" />
          <SkeletonLine className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}



// Anonymisation Result Panel Skeleton
export function AnonymisationResultSkeleton() {
  return (
    <div className="space-y-3 p-3">
      <div className="grid grid-cols-3 gap-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-md p-2 text-center" style={{ background: '#F8F7F4', border: '0.5px solid #e0ddd6' }}>
            <SkeletonLine className="h-5 w-12 mx-auto mb-1" />
            <SkeletonLine className="h-3 w-16 mx-auto" />
          </div>
        ))}
      </div>
      <div>
        <SkeletonLine className="h-3 w-32 mb-2" />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-md p-2 mb-1.5" style={{ background: '#F8F7F4', border: '0.5px solid #e0ddd6' }}>
            <SkeletonLine className="h-3 w-full mb-1" />
            <SkeletonLine className="h-3 w-4/5" />
          </div>
        ))}
      </div>
    </div>
  );
}

// Classification Result Panel Skeleton
export function ClassificationResultSkeleton() {
  return (
    <div className="space-y-3 p-3">
      <div className="grid grid-cols-2 gap-2">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="rounded-md p-2.5 text-center" style={{ background: '#F8F7F4', border: '0.5px solid #e0ddd6' }}>
            <SkeletonLine className="h-5 w-8 mx-auto mb-1" />
            <SkeletonLine className="h-3 w-20 mx-auto" />
          </div>
        ))}
      </div>
      <div>
        <SkeletonLine className="h-3 w-24 mb-2" />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex items-center gap-2 mb-1.5">
            <SkeletonLine className="h-3 w-20" />
            <SkeletonBox className="h-1.5 flex-1 rounded-full" />
            <SkeletonLine className="h-3 w-6" />
          </div>
        ))}
      </div>
    </div>
  );
}

// Summarisation Result Panel Skeleton
export function SummarisationResultSkeleton() {
  return (
    <div className="space-y-3 p-3">
      <SkeletonLine className="h-4 w-32 mb-2" />
      <div className="space-y-1.5 mb-3">
        {[...Array(3)].map((_, i) => (
          <SkeletonLine key={i} className="h-3 w-full" />
        ))}
        <SkeletonLine className="h-3 w-2/3" />
      </div>
      <div>
        <SkeletonLine className="h-3 w-24 mb-2" />
        {[...Array(2)].map((_, i) => (
          <div key={i} className="rounded-md p-2 mb-1.5" style={{ background: '#F8F7F4', border: '0.5px solid #e0ddd6' }}>
            <SkeletonLine className="h-3 w-full mb-1" />
            <SkeletonLine className="h-3 w-5/6" />
          </div>
        ))}
      </div>
    </div>
  );
}

// Completeness Result Panel Skeleton
export function CompletenessResultSkeleton() {
  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center gap-4 rounded-md p-3" style={{ background: '#F8F7F4', border: '0.5px solid #e0ddd6' }}>
        <SkeletonBox className="h-16 w-16 rounded-full shrink-0" />
        <div className="flex-1">
          <SkeletonLine className="h-4 w-32 mb-2" />
          <SkeletonLine className="h-3 w-40" />
        </div>
      </div>
      <div>
        <SkeletonLine className="h-3 w-24 mb-2" />
        {[...Array(3)].map((_, i) => (
          <SkeletonLine key={i} className="h-3 w-full mb-1.5" />
        ))}
      </div>
    </div>
  );
}

export default {
  ClassificationSkeleton,
  AnonymisationSkeleton,
  SummarisationSkeleton,
  CompletenessSkeleton,
  GenericSkeleton,
  CaseListSkeleton,
  EntityListSkeleton,
  DocumentTableSkeleton,
  AnonymisationResultSkeleton,
  ClassificationResultSkeleton,
  SummarisationResultSkeleton,
  CompletenessResultSkeleton,
    
};
