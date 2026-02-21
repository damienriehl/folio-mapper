import type { BranchGroup, BranchState } from '@folio-mapper/core';
import { CandidateTree } from './CandidateTree';

interface CandidatePanelProps {
  branchGroups: BranchGroup[];
  branchStates: Record<string, BranchState>;
  selectedIriHashes: string[];
  selectedCandidateIri: string | null;
  topN: number;
  threshold: number;
  onToggleCandidate: (iriHash: string) => void;
  onSelectForDetail: (iriHash: string) => void;
  expandAllSignal?: number;
  collapseAllSignal?: number;
  searchFilterHashes?: string[] | null;
  isProcessing?: boolean;
}

export function CandidatePanel({
  branchGroups,
  branchStates,
  selectedIriHashes,
  selectedCandidateIri,
  topN,
  threshold,
  onToggleCandidate,
  onSelectForDetail,
  expandAllSignal,
  collapseAllSignal,
  searchFilterHashes,
  isProcessing,
}: CandidatePanelProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <CandidateTree
          branchGroups={branchGroups}
          branchStates={branchStates}
          selectedIriHashes={selectedIriHashes}
          selectedCandidateIri={selectedCandidateIri}
          topN={topN}
          threshold={threshold}
          onToggleCandidate={onToggleCandidate}
          onSelectForDetail={onSelectForDetail}
          expandAllSignal={expandAllSignal}
          collapseAllSignal={collapseAllSignal}
          searchFilterHashes={searchFilterHashes}
          isProcessing={isProcessing}
        />
      </div>
    </div>
  );
}
