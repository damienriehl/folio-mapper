import type { BranchGroup } from '@folio-mapper/core';
import { BranchFilter } from './BranchFilter';
import { CandidateTree } from './CandidateTree';
import { ThresholdSlider } from './ThresholdSlider';

interface CandidatePanelProps {
  branchGroups: BranchGroup[];
  enabledBranches: Set<string>;
  selectedIriHashes: string[];
  selectedCandidateIri: string | null;
  threshold: number;
  onToggleCandidate: (iriHash: string) => void;
  onSelectForDetail: (iriHash: string) => void;
  onToggleBranch: (branchName: string) => void;
  onThresholdChange: (value: number) => void;
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
  onThresholdChange,
}: CandidatePanelProps) {
  const branches = branchGroups.map((g) => ({
    name: g.branch,
    color: g.branch_color,
  }));

  return (
    <div className="flex h-full flex-col">
      <BranchFilter
        branches={branches}
        enabledBranches={enabledBranches}
        onToggle={onToggleBranch}
      />

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
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

      <div className="mt-3 border-t border-gray-100 pt-3">
        <ThresholdSlider value={threshold} onChange={onThresholdChange} />
      </div>
    </div>
  );
}
