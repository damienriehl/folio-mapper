import { useState, useRef, useCallback } from 'react';
import type { BranchSortMode, BranchState } from '@folio-mapper/core';
import { DEFAULT_BRANCH_ORDER } from '@folio-mapper/core';

interface BranchOptionsModalProps {
  allBranches: Array<{ name: string; color: string }>;
  branchStates: Record<string, BranchState>;
  branchSortMode: BranchSortMode;
  customBranchOrder: string[];
  onSetBranchState: (branchName: string, state: BranchState) => void;
  onSetBranchSortMode: (mode: BranchSortMode) => void;
  onSetCustomBranchOrder: (order: string[]) => void;
  onClose: () => void;
}

const CYCLE_ORDER: BranchState[] = ['normal', 'mandatory', 'excluded'];

function nextState(current: BranchState): BranchState {
  const idx = CYCLE_ORDER.indexOf(current);
  return CYCLE_ORDER[(idx + 1) % CYCLE_ORDER.length];
}

function getSortedBranches(
  allBranches: Array<{ name: string; color: string }>,
  mode: BranchSortMode,
  customOrder: string[],
): Array<{ name: string; color: string }> {
  const branches = [...allBranches];
  switch (mode) {
    case 'default': {
      branches.sort((a, b) => {
        const ai = DEFAULT_BRANCH_ORDER.indexOf(a.name);
        const bi = DEFAULT_BRANCH_ORDER.indexOf(b.name);
        // Branches not in default order go to end, sorted alphabetically
        if (ai === -1 && bi === -1) return a.name.localeCompare(b.name);
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });
      return branches;
    }
    case 'alphabetical':
      branches.sort((a, b) => a.name.localeCompare(b.name));
      return branches;
    case 'custom': {
      if (customOrder.length === 0) return branches;
      branches.sort((a, b) => {
        const ai = customOrder.indexOf(a.name);
        const bi = customOrder.indexOf(b.name);
        if (ai === -1 && bi === -1) return a.name.localeCompare(b.name);
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });
      return branches;
    }
  }
}

export function BranchOptionsModal({
  allBranches,
  branchStates,
  branchSortMode,
  customBranchOrder,
  onSetBranchState,
  onSetBranchSortMode,
  onSetCustomBranchOrder,
  onClose,
}: BranchOptionsModalProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const sortedBranches = getSortedBranches(allBranches, branchSortMode, customBranchOrder);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  const handleDragStart = (idx: number) => {
    setDragIndex(idx);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIndex(idx);
  };

  const handleDrop = (dropIdx: number) => {
    if (dragIndex === null || dragIndex === dropIdx) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    const order = sortedBranches.map((b) => b.name);
    const [moved] = order.splice(dragIndex, 1);
    order.splice(dropIdx, 0, moved);
    onSetCustomBranchOrder(order);
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const sortModes: { value: BranchSortMode; label: string }[] = [
    { value: 'default', label: 'Default (most common first)' },
    { value: 'alphabetical', label: 'Alphabetical' },
    { value: 'custom', label: 'Custom (drag to reorder)' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={handleOverlayClick}
    >
      <div className="flex max-h-[80vh] w-96 flex-col rounded-lg bg-white shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-900">Branch Options</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            {'\u2715'}
          </button>
        </div>

        {/* Sort mode */}
        <div className="border-b border-gray-200 px-4 py-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
            Display Order
          </p>
          <div className="space-y-1">
            {sortModes.map((m) => (
              <label key={m.value} className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                <input
                  type="radio"
                  name="branchSortMode"
                  value={m.value}
                  checked={branchSortMode === m.value}
                  onChange={() => onSetBranchSortMode(m.value)}
                  className="text-blue-600"
                />
                {m.label}
              </label>
            ))}
          </div>
        </div>

        {/* Branch list */}
        <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
          <p className="mb-1.5 text-xs text-gray-400">
            Click to cycle: Normal &rarr; Mandatory &rarr; Excluded
          </p>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="space-y-0.5">
              {sortedBranches.map((branch, idx) => {
                const state = branchStates[branch.name] || 'normal';
                const isDragging = dragIndex === idx;
                const isDragOver = dragOverIndex === idx && dragIndex !== idx;

                return (
                  <div
                    key={branch.name}
                    draggable={branchSortMode === 'custom'}
                    onDragStart={() => handleDragStart(idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDrop={() => handleDrop(idx)}
                    onDragEnd={handleDragEnd}
                    className={`flex items-center gap-2 rounded px-2 py-1 text-sm transition-colors ${
                      isDragging ? 'opacity-40' : ''
                    } ${isDragOver ? 'border-t-2 border-blue-400' : ''} ${
                      state === 'excluded'
                        ? 'bg-red-50 text-gray-400 line-through'
                        : state === 'mandatory'
                          ? 'bg-amber-50'
                          : 'hover:bg-gray-50'
                    }`}
                  >
                    {/* Drag handle — only in custom mode */}
                    {branchSortMode === 'custom' ? (
                      <span className="cursor-grab text-gray-300 select-none">{'\u2261'}</span>
                    ) : (
                      <span className="w-3" />
                    )}

                    {/* Click-to-cycle button */}
                    <button
                      type="button"
                      onClick={() => onSetBranchState(branch.name, nextState(state))}
                      className="flex flex-1 cursor-pointer items-center gap-2 text-left"
                    >
                      {/* State indicator */}
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-bold">
                        {state === 'normal' && <span className="text-green-600">{'\u2713'}</span>}
                        {state === 'mandatory' && (
                          <span className="rounded bg-amber-500 px-1 text-[9px] text-white">M</span>
                        )}
                        {state === 'excluded' && <span className="text-red-500">{'\u2717'}</span>}
                      </span>
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: state === 'excluded' ? '#9CA3AF' : branch.color }}
                      />
                      <span
                        className={
                          state === 'mandatory' ? 'font-medium text-amber-800' : 'text-gray-700'
                        }
                      >
                        {branch.name}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
