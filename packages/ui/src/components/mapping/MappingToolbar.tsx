import type { NodeStatus, StatusFilter } from '@folio-mapper/core';

interface MappingToolbarProps {
  currentIndex: number;
  totalItems: number;
  nodeStatuses: Record<number, NodeStatus>;
  topN: number;
  defaultTopN: number;
  statusFilter: StatusFilter;
  onPrev: () => void;
  onNext: () => void;
  onSkip: () => void;
  onGoTo: () => void;
  onAcceptAll: () => void;
  onEdit: () => void;
  onTopNChange: (value: number) => void;
  onDefaultTopNChange: (value: number) => void;
  onStatusFilterChange: (filter: StatusFilter) => void;
  onShowShortcuts: () => void;
  onMappings?: () => void;
  onExport?: () => void;
  loadedItemCount?: number;
  isBatchLoading?: boolean;
}

export function MappingToolbar({
  currentIndex,
  totalItems,
  nodeStatuses,
  topN,
  defaultTopN,
  statusFilter,
  onPrev,
  onNext,
  onSkip,
  onGoTo,
  onAcceptAll,
  onEdit,
  onTopNChange,
  onDefaultTopNChange,
  onStatusFilterChange,
  onShowShortcuts,
  onMappings,
  onExport,
  loadedItemCount,
  isBatchLoading,
}: MappingToolbarProps) {
  // Defensive defaults in case store hydration provides undefined
  const safeTopN = topN ?? 5;
  const safeDefaultTopN = defaultTopN ?? 5;
  const completedCount = Object.values(nodeStatuses).filter((s) => s === 'completed').length;
  const progressPercent = totalItems > 0 ? Math.round((completedCount / totalItems) * 100) : 0;

  return (
    <div className="border-b border-gray-200 bg-white px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {isBatchLoading && loadedItemCount != null && (
            <span className="flex items-center gap-1.5 text-xs text-blue-600">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border border-blue-300 border-t-blue-600" />
              Loading... {loadedItemCount}/{totalItems}
            </span>
          )}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onEdit}
              className="rounded border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
              title="Back to edit"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={onPrev}
              disabled={currentIndex === 0}
              className="rounded border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
              title="Previous (Left Arrow)"
            >
              &larr; Prev
            </button>
            <button
              type="button"
              onClick={onNext}
              className="rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
              title="Next (Enter)"
            >
              Next &rarr;
            </button>
            <div className="ml-2 flex items-center gap-2 border-l border-gray-200 pl-3">
              <label
                className="cursor-pointer text-xs font-medium text-gray-500 whitespace-nowrap hover:text-blue-600"
                htmlFor="toolbar-topn"
                onClick={(e) => { e.preventDefault(); onTopNChange?.(safeDefaultTopN); }}
                title="Reset to default"
              >
                Show
              </label>
              <input
                id="toolbar-topn"
                type="range"
                min={1}
                max={50}
                value={safeTopN}
                onChange={(e) => onTopNChange?.(Number(e.target.value))}
                className="h-1.5 w-24 cursor-pointer appearance-none rounded-full bg-gray-200 accent-blue-600"
              />
              <span className="w-6 text-right text-xs font-medium text-gray-700">{safeTopN >= 50 ? 'All' : safeTopN}</span>
              {safeTopN !== safeDefaultTopN && (
                <button
                  type="button"
                  onClick={() => onDefaultTopNChange?.(safeTopN)}
                  className="rounded border border-blue-300 bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 hover:bg-blue-100"
                  title="Save current value as the default for all items"
                >
                  Save as default
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value as StatusFilter)}
            className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 focus:border-blue-400 focus:outline-none"
          >
            <option value="all">All items</option>
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
            <option value="skipped">Skipped</option>
            <option value="needs_attention">Needs attention</option>
          </select>
          {onMappings && (
            <button
              type="button"
              onClick={onMappings}
              className="rounded border border-blue-300 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
            >
              Mappings
            </button>
          )}
          {onExport && (
            <button
              type="button"
              onClick={onExport}
              className="flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
              title="Export (Ctrl+E)"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v10m0 0l3-3m-3 3l-3-3" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
              </svg>
              Export
            </button>
          )}
          {/* Accept All button — hidden but functionality preserved via onAcceptAll prop + Shift+A shortcut.
             Uncomment to restore:
          <button
            type="button"
            onClick={onAcceptAll}
            className="rounded border border-green-300 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-100"
            title="Accept All Defaults (Shift+A)"
          >
            Accept All (&#8679;A)
          </button>
          */}
          <button
            type="button"
            onClick={onShowShortcuts}
            className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-50"
            title="Keyboard shortcuts (?)"
          >
            ?
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-2 flex items-center gap-2">
        <span className="shrink-0 text-base font-semibold text-blue-600">
          {currentIndex + 1} of {totalItems}
        </span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-blue-600 transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <span className="shrink-0 text-xs text-gray-500">{progressPercent}%</span>
      </div>
    </div>
  );
}
