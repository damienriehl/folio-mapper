import type { NodeStatus } from '@folio-mapper/core';

interface MappingToolbarProps {
  currentIndex: number;
  totalItems: number;
  nodeStatuses: Record<number, NodeStatus>;
  onPrev: () => void;
  onNext: () => void;
  onSkip: () => void;
  onGoTo: () => void;
  onAcceptAll: () => void;
  onEdit: () => void;
}

export function MappingToolbar({
  currentIndex,
  totalItems,
  nodeStatuses,
  onPrev,
  onNext,
  onSkip,
  onGoTo,
  onAcceptAll,
  onEdit,
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
            <button
              type="button"
              onClick={onSkip}
              className="rounded border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
              title="Skip (S)"
            >
              Skip (S)
            </button>
            <button
              type="button"
              onClick={onGoTo}
              className="rounded border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
              title="Go to... (G)"
            >
              Go to (G)
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={onAcceptAll}
          className="rounded border border-green-300 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-100"
          title="Accept All Defaults (Shift+A)"
        >
          Accept All (&#8679;A)
        </button>
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
