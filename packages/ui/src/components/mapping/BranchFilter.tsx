import type { BranchState } from '@folio-mapper/core';

interface BranchFilterProps {
  allBranches: Array<{ name: string; color: string }>;
  branchStates: Record<string, BranchState>;
  onSetBranchState: (branchName: string, state: BranchState) => void;
}

const CYCLE_ORDER: BranchState[] = ['normal', 'mandatory', 'excluded'];

function nextState(current: BranchState): BranchState {
  const idx = CYCLE_ORDER.indexOf(current);
  return CYCLE_ORDER[(idx + 1) % CYCLE_ORDER.length];
}

export function BranchFilter({ allBranches, branchStates, onSetBranchState }: BranchFilterProps) {
  if (allBranches.length === 0) return null;

  return (
    <div>
      <p className="mb-1.5 px-2 text-[10px] text-gray-400">
        Click to cycle: Normal &rarr; Mandatory &rarr; Excluded
      </p>
      <div className="space-y-0.5">
        {allBranches.map((branch) => {
          const state = branchStates[branch.name] || 'normal';

          return (
            <button
              key={branch.name}
              type="button"
              onClick={() => onSetBranchState(branch.name, nextState(state))}
              className={`flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1 text-left text-sm transition-colors ${
                state === 'excluded'
                  ? 'bg-red-50 text-gray-400 line-through'
                  : state === 'mandatory'
                    ? 'bg-amber-50'
                    : 'hover:bg-gray-50'
              }`}
            >
              {/* State indicator */}
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-bold">
                {state === 'normal' && (
                  <span className="text-green-600">{'\u2713'}</span>
                )}
                {state === 'mandatory' && (
                  <span className="rounded bg-amber-500 px-1 text-[9px] text-white">M</span>
                )}
                {state === 'excluded' && (
                  <span className="text-red-500">{'\u2717'}</span>
                )}
              </span>
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: state === 'excluded' ? '#9CA3AF' : branch.color }}
              />
              <span className={state === 'mandatory' ? 'font-medium text-amber-800' : 'text-gray-700'}>
                {branch.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
