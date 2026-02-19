import type { NodeStatus } from '@folio-mapper/core';

interface MappingFooterProps {
  selectedCount: number;
  totalItems: number;
  nodeStatuses: Record<number, NodeStatus>;
  branchCount: number;
  enabledBranchCount: number;
  suggestionCount?: number;
  onExport?: () => void;
}

export function MappingFooter({
  selectedCount,
  totalItems,
  nodeStatuses,
  branchCount,
  enabledBranchCount,
  suggestionCount,
  onExport,
}: MappingFooterProps) {
  const completedCount = Object.values(nodeStatuses).filter((s) => s === 'completed').length;
  const skippedCount = Object.values(nodeStatuses).filter((s) => s === 'skipped').length;

  return (
    <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-2" aria-live="polite">
      <div className="flex items-center gap-4 text-xs text-gray-500">
        {/* Selected count removed — low-value, not actionable. Uncomment to restore:
        <span>
          <span className="font-medium text-gray-700">{selectedCount}</span> selected
        </span>
        */}
        {/* Completed count moved to toolbar progress bar. Uncomment to restore:
        <span>
          <span className="font-medium text-gray-700">{completedCount}</span>/{totalItems}{' '}
          completed
        </span>
        */}
        {skippedCount > 0 && (
          <span>
            <span className="font-medium text-gray-700">{skippedCount}</span> skipped
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {!!suggestionCount && suggestionCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
            {suggestionCount} suggestion{suggestionCount !== 1 ? 's' : ''}
          </span>
        )}
        {/* Export button moved to MappingToolbar (amber style). Ctrl+E shortcut still works.
           Uncomment to restore footer Export:
        {onExport && (
          <button
            onClick={onExport}
            className="rounded border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
            title="Export mappings (Ctrl+E)"
          >
            Export
          </button>
        )}
        */}
        {/* Branch count indicator removed — was showing incorrect enabled/total values.
           Uncomment to restore:
        <span className="text-xs text-gray-500">
          Branches: {enabledBranchCount}/{branchCount}
        </span>
        */}
      </div>
    </div>
  );
}
