import { useState } from 'react';
import type { SuggestionEntry } from '@folio-mapper/core';

interface SuggestionQueuePanelProps {
  queue: SuggestionEntry[];
  onEdit: (entry: SuggestionEntry) => void;
  onRemove: (id: string) => void;
  onSubmit: () => void;
}

export function SuggestionQueuePanel({
  queue,
  onEdit,
  onRemove,
  onSubmit,
}: SuggestionQueuePanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="shrink-0 border-t border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => setCollapsed((p) => !p)}
        className="flex w-full items-center justify-between px-4 py-2 text-left hover:bg-gray-50"
      >
        <span className="flex items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Suggestion Queue
          </p>
          {queue.length > 0 && (
            <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-amber-500 px-1.5 text-xs font-bold text-white">
              {queue.length}
            </span>
          )}
        </span>
        <svg
          className={`h-4 w-4 text-gray-400 transition-transform ${collapsed ? '' : 'rotate-180'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {!collapsed && (
        <div className="px-4 pb-3">
          {queue.length === 0 ? (
            <p className="text-xs text-gray-400">
              No suggestions queued. Press <kbd className="rounded border border-gray-300 bg-gray-100 px-1 font-mono text-[10px]">F</kbd> or
              click "Suggest to FOLIO" to flag items for new concept requests.
            </p>
          ) : (
            <>
              <ul className="max-h-40 space-y-1.5 overflow-y-auto">
                {queue.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center gap-2 rounded border border-gray-100 bg-gray-50 px-2 py-1.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-gray-800">
                        {entry.suggested_label}
                      </p>
                      {entry.nearest_candidates.length > 0 && (
                        <p className="truncate text-[10px] text-gray-400">
                          Top: {entry.nearest_candidates[0].label} ({entry.nearest_candidates[0].score}%)
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => onEdit(entry)}
                      className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-blue-600 hover:bg-blue-50"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove(entry.id)}
                      className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-red-500 hover:bg-red-50"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={onSubmit}
                className="mt-2 w-full rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600"
              >
                Submit to ALEA ({queue.length} item{queue.length !== 1 ? 's' : ''})
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
