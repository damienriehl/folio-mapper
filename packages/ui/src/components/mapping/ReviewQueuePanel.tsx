import { useState, useEffect, useRef } from 'react';
import type { ReviewEntry } from '@folio-mapper/core';

interface ReviewQueuePanelProps {
  queue: ReviewEntry[];
  notes?: Record<number, string>;
  currentItemIndex?: number;
  onNavigate: (itemIndex: number) => void;
  onRemove: (id: string) => void;
}

export function ReviewQueuePanel({
  queue,
  notes,
  currentItemIndex,
  onNavigate,
  onRemove,
}: ReviewQueuePanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const activeRef = useRef<HTMLLIElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!collapsed && activeRef.current && listRef.current) {
      const list = listRef.current;
      const item = activeRef.current;
      const listRect = list.getBoundingClientRect();
      const itemRect = item.getBoundingClientRect();
      if (itemRect.top < listRect.top || itemRect.bottom > listRect.bottom) {
        item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [currentItemIndex, collapsed, queue.length]);

  return (
    <div className="shrink-0 border-t border-gray-300 bg-gray-200">
      <button
        type="button"
        onClick={() => setCollapsed((p) => !p)}
        className="flex w-full items-center justify-between px-4 py-1.5 text-left hover:bg-gray-300/50"
      >
        <span className="flex items-center gap-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-600">
            Review Queue
          </p>
          {queue.length > 0 && (
            <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-blue-500 px-1.5 text-xs font-bold text-white">
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
              No items flagged for review. Press <kbd className="rounded border border-gray-300 bg-gray-100 px-1 font-mono text-[10px]">R</kbd> to
              flag the current item.
            </p>
          ) : (
            <ul ref={listRef} className="max-h-40 space-y-1.5 overflow-y-auto">
              {queue.map((entry) => {
                const isActive = entry.item_index === currentItemIndex;
                const noteText = notes?.[entry.item_index];
                return (
                  <li
                    key={entry.id}
                    ref={isActive ? activeRef : undefined}
                    className={`flex items-center gap-2 rounded border px-2 py-1.5 cursor-pointer ${
                      isActive
                        ? 'border-blue-300 bg-blue-50'
                        : 'border-gray-100 bg-gray-50 hover:bg-gray-100'
                    }`}
                    onClick={() => onNavigate(entry.item_index)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-xs font-medium text-gray-800">
                        <svg className={`h-3.5 w-3.5 shrink-0 ${noteText ? 'text-amber-500' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <title>{noteText ? 'Note added' : 'No note'}</title>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        {entry.item_text}
                      </p>
                      {noteText && (
                        <p className="truncate text-[10px] italic text-amber-600 pl-5">
                          {noteText}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onRemove(entry.id); }}
                      className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-red-500 hover:bg-red-50"
                    >
                      Remove
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
