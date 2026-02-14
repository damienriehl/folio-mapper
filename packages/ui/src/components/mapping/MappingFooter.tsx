import type { NodeStatus } from '@folio-mapper/core';

interface MappingFooterProps {
  selectedCount: number;
  totalItems: number;
  nodeStatuses: Record<number, NodeStatus>;
  branchCount: number;
  enabledBranchCount: number;
}

export function MappingFooter({
  selectedCount,
  totalItems,
  nodeStatuses,
  branchCount,
  enabledBranchCount,
}: MappingFooterProps) {
  const completedCount = Object.values(nodeStatuses).filter((s) => s === 'completed').length;
  const skippedCount = Object.values(nodeStatuses).filter((s) => s === 'skipped').length;

  return (
    <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-2">
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span>
          <span className="font-medium text-gray-700">{selectedCount}</span> selected
        </span>
        <span>
          <span className="font-medium text-gray-700">{completedCount}</span>/{totalItems}{' '}
          completed
        </span>
        {skippedCount > 0 && (
          <span>
            <span className="font-medium text-gray-700">{skippedCount}</span> skipped
          </span>
        )}
      </div>
      <div className="text-xs text-gray-500">
        Branches: {enabledBranchCount}/{branchCount}
      </div>
    </div>
  );
}
