import type {
  BranchGroup,
  FolioCandidate,
  FolioStatus,
  ItemMappingResult,
  MappingResponse,
  NodeStatus,
} from '@folio-mapper/core';
import { CandidatePanel } from './CandidatePanel';
import { DetailPanel } from './DetailPanel';
import { MappingToolbar } from './MappingToolbar';
import { MappingFooter } from './MappingFooter';
import { FolioLoadingOverlay } from './FolioLoadingOverlay';
import { GoToDialog } from './GoToDialog';

interface MappingScreenProps {
  mappingResponse: MappingResponse;
  currentItemIndex: number;
  totalItems: number;
  selections: Record<number, string[]>;
  nodeStatuses: Record<number, NodeStatus>;
  threshold: number;
  enabledBranches: Set<string>;
  selectedCandidateIri: string | null;
  folioStatus: FolioStatus;
  isLoadingCandidates: boolean;
  showGoToDialog: boolean;
  onPrev: () => void;
  onNext: () => void;
  onSkip: () => void;
  onGoTo: (index: number) => void;
  onOpenGoTo: () => void;
  onCloseGoTo: () => void;
  onAcceptAll: () => void;
  onEdit: () => void;
  onToggleCandidate: (iriHash: string) => void;
  onSelectForDetail: (iriHash: string | null) => void;
  onToggleBranch: (branchName: string) => void;
  onThresholdChange: (value: number) => void;
}

export function MappingScreen({
  mappingResponse,
  currentItemIndex,
  totalItems,
  selections,
  nodeStatuses,
  threshold,
  enabledBranches,
  selectedCandidateIri,
  folioStatus,
  isLoadingCandidates,
  showGoToDialog,
  onPrev,
  onNext,
  onSkip,
  onGoTo,
  onOpenGoTo,
  onCloseGoTo,
  onAcceptAll,
  onEdit,
  onToggleCandidate,
  onSelectForDetail,
  onToggleBranch,
  onThresholdChange,
}: MappingScreenProps) {
  const currentItem: ItemMappingResult | undefined = mappingResponse.items[currentItemIndex];
  const currentSelections = selections[currentItemIndex] || [];

  // Find the selected candidate for the detail panel
  let selectedCandidate: FolioCandidate | null = null;
  if (selectedCandidateIri && currentItem) {
    for (const group of currentItem.branch_groups) {
      const found = group.candidates.find((c) => c.iri_hash === selectedCandidateIri);
      if (found) {
        selectedCandidate = found;
        break;
      }
    }
  }

  // Count total selected across all items
  const totalSelected = Object.values(selections).reduce((sum, arr) => sum + arr.length, 0);

  // Count unique branches in current item
  const currentBranches = currentItem?.branch_groups.map((g) => g.branch) || [];
  const totalBranches = new Set(
    mappingResponse.items.flatMap((item) => item.branch_groups.map((g) => g.branch)),
  ).size;

  return (
    <div className="flex h-full flex-col">
      <FolioLoadingOverlay status={folioStatus} isLoadingCandidates={isLoadingCandidates} />

      <MappingToolbar
        currentIndex={currentItemIndex}
        totalItems={totalItems}
        nodeStatuses={nodeStatuses}
        onPrev={onPrev}
        onNext={onNext}
        onSkip={onSkip}
        onGoTo={onOpenGoTo}
        onAcceptAll={onAcceptAll}
        onEdit={onEdit}
      />

      {currentItem && (
        <div className="flex min-h-0 flex-1">
          {/* Left column: Candidate Panel */}
          <div className="w-1/2 overflow-y-auto border-r border-gray-200 p-4">
            <CandidatePanel
              branchGroups={currentItem.branch_groups}
              enabledBranches={enabledBranches}
              selectedIriHashes={currentSelections}
              selectedCandidateIri={selectedCandidateIri}
              threshold={threshold}
              onToggleCandidate={(iriHash) => onToggleCandidate(iriHash)}
              onSelectForDetail={(iriHash) => onSelectForDetail(iriHash)}
              onToggleBranch={onToggleBranch}
              onThresholdChange={onThresholdChange}
            />
          </div>

          {/* Right column: Detail Panel */}
          <div className="w-1/2 overflow-y-auto p-4">
            <DetailPanel currentItem={currentItem} selectedCandidate={selectedCandidate} />
          </div>
        </div>
      )}

      <MappingFooter
        selectedCount={totalSelected}
        totalItems={totalItems}
        nodeStatuses={nodeStatuses}
        branchCount={totalBranches}
        enabledBranchCount={enabledBranches.size}
      />

      {showGoToDialog && (
        <GoToDialog totalItems={totalItems} onGoTo={onGoTo} onClose={onCloseGoTo} />
      )}
    </div>
  );
}
