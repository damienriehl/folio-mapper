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

  // Collect all visible candidate IRI hashes for current item (respecting threshold + branch filters)
  const visibleCandidateHashes: string[] = currentItem
    ? currentItem.branch_groups
        .filter((g) => enabledBranches.has(g.branch))
        .flatMap((g) => g.candidates.filter((c) => c.score >= threshold).map((c) => c.iri_hash))
    : [];

  const handleSelectAllVisible = () => {
    // Add all visible candidates that aren't already selected
    for (const iriHash of visibleCandidateHashes) {
      if (!currentSelections.includes(iriHash)) {
        onToggleCandidate(iriHash);
      }
    }
  };

  const handleClearAll = () => {
    // Remove all currently selected candidates for this item
    for (const iriHash of currentSelections) {
      onToggleCandidate(iriHash);
    }
  };

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
        threshold={threshold}
        onPrev={onPrev}
        onNext={onNext}
        onSkip={onSkip}
        onGoTo={onOpenGoTo}
        onAcceptAll={onAcceptAll}
        onEdit={onEdit}
        onThresholdChange={onThresholdChange}
      />

      {currentItem && (
        <div className="flex min-h-0 flex-1">
          {/* Left column: Your Input (sticky) + Candidate Panel */}
          <div className="flex w-1/2 flex-col border-r border-gray-200">
            {/* Sticky "Your Input" header + Select All / Clear */}
            <div className="shrink-0 border-b border-gray-200 bg-white px-4 pt-3 pb-3">
              <div className="rounded-lg border-2 border-blue-200 bg-blue-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Your Input</p>
                <p className="mt-1 text-base font-semibold text-gray-900">{currentItem.item_text}</p>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAllVisible}
                  className="rounded border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={handleClearAll}
                  disabled={currentSelections.length === 0}
                  className="rounded border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                >
                  Clear
                </button>
                <span className="text-xs text-gray-400">
                  {currentSelections.length} of {visibleCandidateHashes.length} selected
                </span>
              </div>
            </div>
            {/* Scrollable candidate results */}
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <CandidatePanel
                branchGroups={currentItem.branch_groups}
                enabledBranches={enabledBranches}
                selectedIriHashes={currentSelections}
                selectedCandidateIri={selectedCandidateIri}
                threshold={threshold}
                onToggleCandidate={(iriHash) => onToggleCandidate(iriHash)}
                onSelectForDetail={(iriHash) => onSelectForDetail(iriHash)}
                onToggleBranch={onToggleBranch}
              />
            </div>
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
