import { useState } from 'react';
import type {
  BranchGroup,
  BranchSortMode,
  BranchState,
  FolioCandidate,
  FolioStatus,
  ItemMappingResult,
  MappingResponse,
  NodeStatus,
} from '@folio-mapper/core';
import { DEFAULT_BRANCH_ORDER } from '@folio-mapper/core';
import { CandidatePanel } from './CandidatePanel';
import { DetailPanel } from './DetailPanel';
import { MappingToolbar } from './MappingToolbar';
import { MappingFooter } from './MappingFooter';
import { FolioLoadingOverlay } from './FolioLoadingOverlay';
import { GoToDialog } from './GoToDialog';
import { BranchOptionsModal } from './BranchOptionsModal';

interface MappingScreenProps {
  mappingResponse: MappingResponse;
  currentItemIndex: number;
  totalItems: number;
  selections: Record<number, string[]>;
  nodeStatuses: Record<number, NodeStatus>;
  threshold: number;
  branchStates: Record<string, BranchState>;
  allBranches: Array<{ name: string; color: string }>;
  selectedCandidateIri: string | null;
  folioStatus: FolioStatus;
  isLoadingCandidates: boolean;
  showGoToDialog: boolean;
  branchSortMode: BranchSortMode;
  customBranchOrder: string[];
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
  onSetBranchState: (branchName: string, state: BranchState) => void;
  onThresholdChange: (value: number) => void;
  onSetBranchSortMode: (mode: BranchSortMode) => void;
  onSetCustomBranchOrder: (order: string[]) => void;
}

function sortBranchGroups(
  groups: BranchGroup[],
  mode: BranchSortMode,
  customOrder: string[],
): BranchGroup[] {
  const sorted = [...groups];
  switch (mode) {
    case 'default':
      sorted.sort((a, b) => {
        const ai = DEFAULT_BRANCH_ORDER.indexOf(a.branch);
        const bi = DEFAULT_BRANCH_ORDER.indexOf(b.branch);
        if (ai === -1 && bi === -1) return a.branch.localeCompare(b.branch);
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });
      return sorted;
    case 'alphabetical':
      sorted.sort((a, b) => a.branch.localeCompare(b.branch));
      return sorted;
    case 'custom': {
      if (customOrder.length === 0) return sorted;
      sorted.sort((a, b) => {
        const ai = customOrder.indexOf(a.branch);
        const bi = customOrder.indexOf(b.branch);
        if (ai === -1 && bi === -1) return a.branch.localeCompare(b.branch);
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });
      return sorted;
    }
  }
}

export function MappingScreen({
  mappingResponse,
  currentItemIndex,
  totalItems,
  selections,
  nodeStatuses,
  threshold,
  branchStates,
  allBranches,
  selectedCandidateIri,
  folioStatus,
  isLoadingCandidates,
  showGoToDialog,
  branchSortMode,
  customBranchOrder,
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
  onSetBranchState,
  onThresholdChange,
  onSetBranchSortMode,
  onSetCustomBranchOrder,
}: MappingScreenProps) {
  const [showBranchOptions, setShowBranchOptions] = useState(false);

  const currentItem: ItemMappingResult | undefined = mappingResponse.items[currentItemIndex];
  const currentSelections = selections[currentItemIndex] || [];

  // Sort branch groups by selected mode
  const sortedBranchGroups = currentItem
    ? sortBranchGroups(currentItem.branch_groups, branchSortMode, customBranchOrder)
    : [];

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
  // Mandatory branches bypass the threshold — show all candidates
  const visibleCandidateHashes: string[] = currentItem
    ? sortedBranchGroups
        .filter((g) => branchStates[g.branch] !== 'excluded')
        .flatMap((g) => {
          const isMandatory = branchStates[g.branch] === 'mandatory';
          return g.candidates
            .filter((c) => isMandatory || c.score >= threshold)
            .map((c) => c.iri_hash);
        })
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

  // Count branches
  const totalBranches = allBranches.length;
  const enabledBranchCount = Object.values(branchStates).filter((s) => s !== 'excluded').length;

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
            {/* Sticky "Your Input" header + Select All / Clear / Branch Options */}
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
                <button
                  type="button"
                  onClick={() => setShowBranchOptions(true)}
                  className="rounded border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  Branch Options
                </button>
                <span className="text-xs text-gray-400">
                  {currentSelections.length} of {visibleCandidateHashes.length} selected
                </span>
              </div>
            </div>
            {/* Scrollable candidate results */}
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <CandidatePanel
                branchGroups={sortedBranchGroups}
                branchStates={branchStates}
                selectedIriHashes={currentSelections}
                selectedCandidateIri={selectedCandidateIri}
                threshold={threshold}
                onToggleCandidate={(iriHash) => onToggleCandidate(iriHash)}
                onSelectForDetail={(iriHash) => onSelectForDetail(iriHash)}
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
        enabledBranchCount={enabledBranchCount}
      />

      {showGoToDialog && (
        <GoToDialog totalItems={totalItems} onGoTo={onGoTo} onClose={onCloseGoTo} />
      )}

      {showBranchOptions && (
        <BranchOptionsModal
          allBranches={allBranches}
          branchStates={branchStates}
          branchSortMode={branchSortMode}
          customBranchOrder={customBranchOrder}
          onSetBranchState={onSetBranchState}
          onSetBranchSortMode={onSetBranchSortMode}
          onSetCustomBranchOrder={onSetCustomBranchOrder}
          onClose={() => setShowBranchOptions(false)}
        />
      )}
    </div>
  );
}
