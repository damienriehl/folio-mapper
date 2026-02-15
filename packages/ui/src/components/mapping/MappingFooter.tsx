import type { NodeStatus } from '@folio-mapper/core';

interface MappingFooterProps {
  selectedCount: number;
  totalItems: number;
  nodeStatuses: Record<number, NodeStatus>;
  branchCount: number;
  enabledBranchCount: number;
  onExport?: () => void;
}

export function MappingFooter({
  selectedCount,
  totalItems,
  nodeStatuses,
  branchCount,
  enabledBranchCount,
  onExport,
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
      <div className="flex items-center gap-3">
        {onExport && (
          <button
            onClick={onExport}
            className="rounded border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
            title="Export mappings (Ctrl+E)"
          >
            Export
          </button>
        )}
        <span className="text-xs text-gray-500">
          Branches: {enabledBranchCount}/{branchCount}
        </span>
      </div>
    </div>
  );
}
