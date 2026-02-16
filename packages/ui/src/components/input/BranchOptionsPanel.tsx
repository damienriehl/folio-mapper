import type { BranchSortMode, BranchState } from '@folio-mapper/core';
import { DEFAULT_BRANCH_ORDER } from '@folio-mapper/core';

interface BranchOptionsPanelProps {
  allBranches: Array<{ name: string; color: string }>;
  branchStates: Record<string, BranchState>;
  branchSortMode: BranchSortMode;
  onSetBranchState: (branchName: string, state: BranchState) => void;
  onSetBranchSortMode: (mode: BranchSortMode) => void;
}

function getSortedBranches(
  allBranches: Array<{ name: string; color: string }>,
  mode: BranchSortMode,
): Array<{ name: string; color: string }> {
  const branches = [...allBranches];
  switch (mode) {
    case 'alphabetical':
      branches.sort((a, b) => a.name.localeCompare(b.name));
      return branches;
    default: {
      branches.sort((a, b) => {
        const ai = DEFAULT_BRANCH_ORDER.indexOf(a.name);
        const bi = DEFAULT_BRANCH_ORDER.indexOf(b.name);
        if (ai === -1 && bi === -1) return a.name.localeCompare(b.name);
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });
      return branches;
    }
  }
}

export function BranchOptionsPanel({
  allBranches,
  branchStates,
  branchSortMode,
  onSetBranchState,
  onSetBranchSortMode,
}: BranchOptionsPanelProps) {
  const sortedBranches = getSortedBranches(allBranches, branchSortMode);
  const mandatoryCount = Object.values(branchStates).filter((s) => s === 'mandatory').length;

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Branch Options</h3>
          <p className="mt-0.5 text-xs text-gray-400">
            Check branches to make them <span className="font-medium text-amber-600">mandatory</span> in results
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>Sort:</span>
          <select
            value={branchSortMode === 'custom' ? 'default' : branchSortMode}
            onChange={(e) => onSetBranchSortMode(e.target.value as BranchSortMode)}
            className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-xs text-gray-600"
          >
            <option value="default">Default</option>
            <option value="alphabetical">A-Z</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 px-4 py-3">
        {sortedBranches.map((branch) => {
          const isMandatory = branchStates[branch.name] === 'mandatory';

          return (
            <label
              key={branch.name}
              className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm transition-colors ${
                isMandatory ? 'bg-amber-50' : 'hover:bg-gray-50'
              }`}
            >
              <input
                type="checkbox"
                checked={isMandatory}
                onChange={() =>
                  onSetBranchState(branch.name, isMandatory ? 'normal' : 'mandatory')
                }
                className="h-3.5 w-3.5 rounded border-gray-300 text-amber-500 focus:ring-amber-500"
              />
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: branch.color }}
              />
              <span
                className={
                  isMandatory ? 'font-medium text-amber-800' : 'text-gray-700'
                }
              >
                {branch.name}
              </span>
            </label>
          );
        })}
      </div>

      {mandatoryCount > 0 && (
        <div className="border-t border-gray-100 px-4 py-2 text-xs text-amber-700">
          {mandatoryCount} branch{mandatoryCount !== 1 ? 'es' : ''} marked mandatory — results will always include these branches
        </div>
      )}
    </div>
  );
}
