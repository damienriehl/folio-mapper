import { useState } from 'react';
import type { BranchGroup, BranchState } from '@folio-mapper/core';
import { BranchFilter } from './BranchFilter';
import { CandidateTree } from './CandidateTree';

interface CandidatePanelProps {
  branchGroups: BranchGroup[];
  branchStates: Record<string, BranchState>;
  allBranches: Array<{ name: string; color: string }>;
  selectedIriHashes: string[];
  selectedCandidateIri: string | null;
  threshold: number;
  onToggleCandidate: (iriHash: string) => void;
  onSelectForDetail: (iriHash: string) => void;
  onSetBranchState: (branchName: string, state: BranchState) => void;
}

export function CandidatePanel({
  branchGroups,
  branchStates,
  allBranches,
  selectedIriHashes,
  selectedCandidateIri,
  threshold,
  onToggleCandidate,
  onSelectForDetail,
  onSetBranchState,
}: CandidatePanelProps) {
  const [showBranchFilter, setShowBranchFilter] = useState(false);

  const enabledCount = Object.values(branchStates).filter((s) => s !== 'excluded').length;

  return (
    <div className="flex h-full flex-col">
      {allBranches.length > 0 && (
        <div className="mb-2">
          <button
            type="button"
            onClick={() => setShowBranchFilter(!showBranchFilter)}
            className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-gray-500 hover:text-gray-700"
          >
            <span
              className="inline-block transition-transform"
              style={{ transform: showBranchFilter ? 'rotate(90deg)' : 'rotate(0deg)' }}
            >
              &#9656;
            </span>
            Branch Filter ({enabledCount}/{allBranches.length})
          </button>
          {showBranchFilter && (
            <div className="mt-1">
              <BranchFilter
                allBranches={allBranches}
                branchStates={branchStates}
                onSetBranchState={onSetBranchState}
              />
            </div>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <CandidateTree
          branchGroups={branchGroups}
          branchStates={branchStates}
          selectedIriHashes={selectedIriHashes}
          selectedCandidateIri={selectedCandidateIri}
          threshold={threshold}
          onToggleCandidate={onToggleCandidate}
          onSelectForDetail={onSelectForDetail}
        />
      </div>
    </div>
  );
}
