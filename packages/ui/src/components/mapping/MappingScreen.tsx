import { useState, useEffect } from 'react';
import type {
  BranchGroup,
  BranchSortMode,
  BranchState,
  FolioCandidate,
  FolioStatus,
  ItemMappingResult,
  MappingResponse,
  NodeStatus,
  PreScanSegment,
  StatusFilter,
} from '@folio-mapper/core';
import { DEFAULT_BRANCH_ORDER, fetchConcept } from '@folio-mapper/core';
import { CandidatePanel } from './CandidatePanel';
import { DetailPanel } from './DetailPanel';
import { MappingToolbar } from './MappingToolbar';
import { MappingFooter } from './MappingFooter';
import { FolioLoadingOverlay } from './FolioLoadingOverlay';
import { GoToDialog } from './GoToDialog';
import { BranchOptionsModal } from './BranchOptionsModal';
import { PrescanDisplay } from './PrescanDisplay';
import { SelectionTree } from './SelectionTree';
import { ShortcutsOverlay } from './ShortcutsOverlay';

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
  prescanSegments?: PreScanSegment[] | null;
  isLoadingCandidates: boolean;
  showGoToDialog: boolean;
  showShortcutsOverlay: boolean;
  branchSortMode: BranchSortMode;
  customBranchOrder: string[];
  notes: Record<number, string>;
  statusFilter: StatusFilter;
  isPipeline?: boolean;
  pipelineItemCount?: number;
  onPrev: () => void;
  onNext: () => void;
  onSkip: () => void;
  onGoTo: (index: number) => void;
  onOpenGoTo: () => void;
  onCloseGoTo: () => void;
  onCloseShortcuts: () => void;
  onAcceptAll: () => void;
  onEdit: () => void;
  onToggleCandidate: (iriHash: string) => void;
  onSelectForDetail: (iriHash: string | null) => void;
  onSetBranchState: (branchName: string, state: BranchState) => void;
  onThresholdChange: (value: number) => void;
  onSetBranchSortMode: (mode: BranchSortMode) => void;
  onSetCustomBranchOrder: (order: string[]) => void;
  onSearch: (query: string) => Promise<void>;
  isSearching: boolean;
  onSetNote: (itemIndex: number, text: string) => void;
  onStatusFilterChange: (filter: StatusFilter) => void;
  onShowShortcuts: () => void;
  onExport?: () => void;
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
  prescanSegments,
  folioStatus,
  isLoadingCandidates,
  showGoToDialog,
  showShortcutsOverlay,
  branchSortMode,
  customBranchOrder,
  notes,
  statusFilter,
  isPipeline,
  pipelineItemCount,
  onPrev,
  onNext,
  onSkip,
  onGoTo,
  onOpenGoTo,
  onCloseGoTo,
  onCloseShortcuts,
  onAcceptAll,
  onEdit,
  onToggleCandidate,
  onSelectForDetail,
  onSetBranchState,
  onThresholdChange,
  onSetBranchSortMode,
  onSetCustomBranchOrder,
  onSearch,
  isSearching,
  onSetNote,
  onStatusFilterChange,
  onShowShortcuts,
  onExport,
}: MappingScreenProps) {
  const [showBranchOptions, setShowBranchOptions] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandAllSignal, setExpandAllSignal] = useState(0);
  const [collapseAllSignal, setCollapseAllSignal] = useState(0);

  const currentItem: ItemMappingResult | undefined = mappingResponse.items[currentItemIndex];
  const currentSelections = selections[currentItemIndex] || [];

  // Sort branch groups by selected mode
  const sortedBranchGroups = currentItem
    ? sortBranchGroups(currentItem.branch_groups, branchSortMode, customBranchOrder)
    : [];

  // Find the selected candidate for the detail panel
  let candidateFromData: FolioCandidate | null = null;
  if (selectedCandidateIri && currentItem) {
    for (const group of currentItem.branch_groups) {
      const found = group.candidates.find((c) => c.iri_hash === selectedCandidateIri);
      if (found) {
        candidateFromData = found;
        break;
      }
    }
  }

  // Fetch full concept details for structural nodes (not in candidates list)
  const [fetchedConcept, setFetchedConcept] = useState<FolioCandidate | null>(null);
  useEffect(() => {
    if (!selectedCandidateIri || candidateFromData) {
      setFetchedConcept(null);
      return;
    }
    let cancelled = false;
    fetchConcept(selectedCandidateIri).then((concept) => {
      if (!cancelled) setFetchedConcept(concept);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [selectedCandidateIri, candidateFromData]);

  const selectedCandidate = candidateFromData ?? fetchedConcept;

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
      <FolioLoadingOverlay
        status={folioStatus}
        isLoadingCandidates={isLoadingCandidates}
        isPipeline={isPipeline}
        pipelineItemCount={pipelineItemCount}
      />

      <MappingToolbar
        currentIndex={currentItemIndex}
        totalItems={totalItems}
        nodeStatuses={nodeStatuses}
        threshold={threshold}
        statusFilter={statusFilter}
        onPrev={onPrev}
        onNext={onNext}
        onSkip={onSkip}
        onGoTo={onOpenGoTo}
        onAcceptAll={onAcceptAll}
        onEdit={onEdit}
        onThresholdChange={onThresholdChange}
        onStatusFilterChange={onStatusFilterChange}
        onShowShortcuts={onShowShortcuts}
      />

      {currentItem && (
        <div className="flex min-h-0 flex-1">
          {/* Left column: Your Input (sticky) + Candidate Panel */}
          <div className="flex w-1/2 flex-col border-r border-gray-200">
            {/* Sticky "Your Input" header + Select All / Clear / Branch Options */}
            <div className="shrink-0 border-b border-gray-200 bg-white px-4 pt-3 pb-3">
              <div className="rounded-lg border-2 border-blue-200 bg-blue-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Your Input</p>
                <PrescanDisplay itemText={currentItem.item_text} segments={prescanSegments ?? null} />
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
                  className="self-stretch rounded border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
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
                <form
                  className="ml-auto flex items-center gap-1"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const q = searchQuery.trim();
                    if (!q || isSearching) return;
                    await onSearch(q);
                    setSearchQuery('');
                  }}
                >
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search candidates..."
                    disabled={isSearching}
                    className="w-44 rounded border border-gray-300 px-2 py-1 text-xs placeholder:text-gray-400 focus:border-blue-400 focus:outline-none disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={isSearching || !searchQuery.trim()}
                    className="flex items-center gap-1 rounded border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                  >
                    {isSearching ? (
                      <span className="inline-block h-3 w-3 animate-spin rounded-full border border-gray-300 border-t-blue-600" />
                    ) : (
                      'Search'
                    )}
                  </button>
                </form>
                <button
                  type="button"
                  onClick={() => setExpandAllSignal((n) => n + 1)}
                  className="rounded border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  Expand All
                </button>
                <button
                  type="button"
                  onClick={() => setCollapseAllSignal((n) => n + 1)}
                  className="rounded border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  Collapse All
                </button>
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
                expandAllSignal={expandAllSignal}
                collapseAllSignal={collapseAllSignal}
              />
            </div>
          </div>

          {/* Right column: Selection Tree + Detail Panel */}
          <div className="flex w-1/2 flex-col">
            {/* Top half: Current Selection(s) */}
            <div className="flex min-h-0 flex-1 flex-col border-b border-gray-200">
              <div className="shrink-0 border-b border-gray-100 bg-white px-4 pt-3 pb-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Current Selection(s)
                  </p>
                  <span className="text-xs text-gray-400">
                    {currentSelections.length} of {visibleCandidateHashes.length} selected
                  </span>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <SelectionTree
                  branchGroups={sortedBranchGroups}
                  selectedIriHashes={currentSelections}
                  selectedCandidateIri={selectedCandidateIri}
                  onSelectForDetail={(iriHash) => onSelectForDetail(iriHash)}
                />
              </div>
            </div>
            {/* Notes */}
            <div className="shrink-0 border-b border-gray-200 bg-white px-4 py-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500" htmlFor="item-note">
                Notes
              </label>
              <textarea
                id="item-note"
                value={notes[currentItemIndex] || ''}
                onChange={(e) => onSetNote(currentItemIndex, e.target.value)}
                placeholder="Add a note for this item..."
                rows={notes[currentItemIndex] ? 2 : 1}
                onFocus={(e) => { if (!notes[currentItemIndex]) (e.target as HTMLTextAreaElement).rows = 2; }}
                onBlur={(e) => { if (!notes[currentItemIndex]) (e.target as HTMLTextAreaElement).rows = 1; }}
                className="w-full resize-none rounded border border-gray-200 px-2 py-1 text-xs text-gray-700 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none"
              />
            </div>
            {/* Bottom half: Candidate Details */}
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="shrink-0 border-b border-gray-100 bg-white px-4 pt-3 pb-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Candidate Details
                </p>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <DetailPanel currentItem={currentItem} selectedCandidate={selectedCandidate} />
              </div>
            </div>
          </div>
        </div>
      )}

      <MappingFooter
        selectedCount={totalSelected}
        totalItems={totalItems}
        nodeStatuses={nodeStatuses}
        branchCount={totalBranches}
        enabledBranchCount={enabledBranchCount}
        onExport={onExport}
      />

      {showGoToDialog && (
        <GoToDialog totalItems={totalItems} onGoTo={onGoTo} onClose={onCloseGoTo} />
      )}

      {showShortcutsOverlay && (
        <ShortcutsOverlay onClose={onCloseShortcuts} />
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
