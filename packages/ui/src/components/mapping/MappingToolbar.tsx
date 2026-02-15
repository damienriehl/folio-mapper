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
}: MappingToolbarProps) {
  const completedCount = Object.values(nodeStatuses).filter((s) => s === 'completed').length;
  const progressPercent = totalItems > 0 ? Math.round((completedCount / totalItems) * 100) : 0;

  return (
    <div className="border-b border-gray-200 bg-white px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-gray-900">
            NODE: {currentIndex + 1} of {totalItems}
          </span>
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
              <label className="text-xs font-medium text-gray-500 whitespace-nowrap" htmlFor="toolbar-topn">
                Top N
              </label>
              <input
                id="toolbar-topn"
                type="range"
                min={1}
                max={50}
                value={topN}
                onChange={(e) => onTopNChange(Number(e.target.value))}
                className="h-1.5 w-24 cursor-pointer appearance-none rounded-full bg-gray-200 accent-blue-600"
              />
              <span className="w-6 text-right text-xs font-medium text-gray-700">{topN >= 50 ? 'All' : topN}</span>
              {topN !== defaultTopN && (
                <button
                  type="button"
                  onClick={() => onDefaultTopNChange(topN)}
                  className="rounded border border-blue-300 bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 hover:bg-blue-100"
                  title="Set current Top N as the default for all items"
                >
                  Set default
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
          <button
            type="button"
            onClick={onAcceptAll}
            className="rounded border border-green-300 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-100"
            title="Accept All Defaults (Shift+A)"
          >
            Accept All (&#8679;A)
          </button>
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
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-blue-600 transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <span className="text-xs text-gray-500">{progressPercent}%</span>
      </div>
    </div>
  );
}
