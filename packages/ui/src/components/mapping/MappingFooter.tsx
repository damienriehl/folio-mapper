import type { NodeStatus } from '@folio-mapper/core';

interface MappingFooterProps {
  nodeStatuses: Record<number, NodeStatus>;
  suggestionCount?: number;
  reviewCount?: number;
}

export function MappingFooter({
  nodeStatuses,
  suggestionCount,
  reviewCount,
}: MappingFooterProps) {
  const skippedCount = Object.values(nodeStatuses).filter((s) => s === 'skipped').length;

  return (
    <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-2" aria-live="polite">
      <div className="flex items-center gap-4 text-xs text-gray-500">
        {skippedCount > 0 && (
          <span>
            <span className="font-medium text-gray-700">{skippedCount}</span> skipped
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {!!reviewCount && reviewCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
            {reviewCount} review{reviewCount !== 1 ? 's' : ''}
          </span>
        )}
        {!!suggestionCount && suggestionCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
            {suggestionCount} suggestion{suggestionCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    </div>
  );
}
