import { useState } from 'react';
import type { BranchGroup } from '@folio-mapper/core';
import { BranchFilter } from './BranchFilter';
import { CandidateTree } from './CandidateTree';

interface CandidatePanelProps {
  branchGroups: BranchGroup[];
  enabledBranches: Set<string>;
  selectedIriHashes: string[];
  selectedCandidateIri: string | null;
  threshold: number;
  onToggleCandidate: (iriHash: string) => void;
  onSelectForDetail: (iriHash: string) => void;
  onToggleBranch: (branchName: string) => void;
}

export function CandidatePanel({
  branchGroups,
  enabledBranches,
  selectedIriHashes,
  selectedCandidateIri,
  threshold,
  onToggleCandidate,
  onSelectForDetail,
  onToggleBranch,
}: CandidatePanelProps) {
  const [showBranchFilter, setShowBranchFilter] = useState(false);

  const branches = branchGroups.map((g) => ({
    name: g.branch,
    color: g.branch_color,
  }));

  return (
    <div className="flex h-full flex-col">
      {branches.length > 0 && (
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
            Branch Filter ({enabledBranches.size}/{branches.length})
          </button>
          {showBranchFilter && (
            <div className="mt-1">
              <BranchFilter
                branches={branches}
                enabledBranches={enabledBranches}
                onToggle={onToggleBranch}
              />
            </div>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <CandidateTree
          branchGroups={branchGroups}
          enabledBranches={enabledBranches}
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
