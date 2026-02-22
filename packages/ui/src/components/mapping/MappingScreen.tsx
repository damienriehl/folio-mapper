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
  SuggestionEntry,
  ReviewEntry,
} from '@folio-mapper/core';
import { DEFAULT_BRANCH_ORDER, fetchConcept, computeScoreCutoff } from '@folio-mapper/core';
import { CandidatePanel } from './CandidatePanel';
import { DetailPanel } from './DetailPanel';
import { MappingToolbar } from './MappingToolbar';

import { FolioLoadingOverlay } from './FolioLoadingOverlay';
import { GoToDialog } from './GoToDialog';
import { BranchOptionsModal } from './BranchOptionsModal';
import { PrescanDisplay } from './PrescanDisplay';
import { SelectionTree } from './SelectionTree';
import { ShortcutsOverlay } from './ShortcutsOverlay';
import { SuggestionQueuePanel } from './SuggestionQueuePanel';
import { ReviewQueuePanel } from './ReviewQueuePanel';
import { EntityGraphModal } from './EntityGraphModal';

interface MappingScreenProps {
  mappingResponse: MappingResponse;
  currentItemIndex: number;
  totalItems: number;
  selections: Record<number, string[]>;
  nodeStatuses: Record<number, NodeStatus>;
  topN: number;
  defaultTopN: number;
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
  onTopNChange: (value: number) => void;
  onDefaultTopNChange: (value: number) => void;
  onSetBranchSortMode: (mode: BranchSortMode) => void;
  onSetCustomBranchOrder: (order: string[]) => void;
  onSearch: (query: string) => Promise<void>;
  isSearching: boolean;
  onSetNote: (itemIndex: number, text: string) => void;
  onStatusFilterChange: (filter: StatusFilter) => void;
  onShowShortcuts: () => void;
  onExport?: () => void;
  suggestionQueue: SuggestionEntry[];
  onSuggestToFolio: () => void;
  onRemoveSuggestion: (id: string) => void;
  onEditSuggestion: (entry: SuggestionEntry) => void;
  onOpenSubmission: () => void;
  reviewQueue: ReviewEntry[];
  onFlagForReview: () => void;
  onRemoveReview: (id: string) => void;
  onNavigateToItem: (itemIndex: number) => void;
  searchFilterHashes?: string[] | null;
  onClearSearchFilter?: () => void;
  onMappings?: () => void;
  loadedItemCount?: number;
  isBatchLoading?: boolean;
  batchLoadingError?: string | null;
}

const NUDGE_KEYFRAMES = `@keyframes nudge-bg { 0% { background-color: white; } 40% { background-color: rgb(253 230 138); } 100% { background-color: rgb(254 243 199); } }`;

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
  topN,
  defaultTopN,
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
  onTopNChange,
  onDefaultTopNChange,
  onSetBranchSortMode,
  onSetCustomBranchOrder,
  onSearch,
  isSearching,
  onSetNote,
  onStatusFilterChange,
  onShowShortcuts,
  onExport,
  suggestionQueue,
  onSuggestToFolio,
  onRemoveSuggestion,
  onEditSuggestion,
  onOpenSubmission,
  reviewQueue,
  onFlagForReview,
  onRemoveReview,
  onNavigateToItem,
  searchFilterHashes,
  onMappings,
  onClearSearchFilter,
  loadedItemCount,
  isBatchLoading,
  batchLoadingError,
}: MappingScreenProps) {
  const [showBranchOptions, setShowBranchOptions] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandAllSignal, setExpandAllSignal] = useState(0);
  const [collapseAllSignal, setCollapseAllSignal] = useState(0);
  const [allExpanded, setAllExpanded] = useState(true);
  const [notesNudge, setNotesNudge] = useState(false);
  const [graphTarget, setGraphTarget] = useState<{ iriHash: string; label: string } | null>(null);

  // Clear notes nudge and search query when navigating to a different item
  useEffect(() => { setNotesNudge(false); setSearchQuery(''); }, [currentItemIndex]);

  const currentItem: ItemMappingResult | undefined = mappingResponse.items[currentItemIndex];
  const currentSelections = selections[currentItemIndex] || [];

  // Sort branch groups by selected mode
  const sortedBranchGroups = currentItem
    ? sortBranchGroups(currentItem.branch_groups, branchSortMode, customBranchOrder)
    : [];

  // Ensure mandatory branches always appear (even with 0 candidates from backend)
  const completeBranchGroups = (() => {
    const presentBranches = new Set(sortedBranchGroups.map((g) => g.branch));
    const missingMandatory = allBranches.filter(
      (b) => branchStates[b.name] === 'mandatory' && !presentBranches.has(b.name),
    );
    if (missingMandatory.length === 0) return sortedBranchGroups;
    // Append missing mandatory placeholders, then re-sort so they appear in proper order
    const combined = [
      ...sortedBranchGroups,
      ...missingMandatory.map((b) => ({
        branch: b.name,
        branch_color: b.color,
        candidates: [],
      })),
    ];
    return sortBranchGroups(combined, branchSortMode, customBranchOrder);
  })();

  const safeTopN = topN ?? 5;

  // Compute global threshold for non-mandatory branches
  const effectiveThreshold = computeScoreCutoff(completeBranchGroups, safeTopN, branchStates);

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

  // Collect all visible candidate IRI hashes for current item (hybrid: per-branch for mandatory, threshold for non-mandatory)
  const searchFilterSet = searchFilterHashes ? new Set(searchFilterHashes) : null;
  const showAll = safeTopN >= 50;
  const visibleCandidateHashes: string[] = currentItem
    ? completeBranchGroups
        .filter((g) => {
          if (branchStates[g.branch] === 'excluded') return false;
          // Mandatory branches always visible (even when search filter is active)
          if (branchStates[g.branch] === 'mandatory') return true;
          if (searchFilterSet) return g.candidates.some((c) => searchFilterSet.has(c.iri_hash));
          return true;
        })
        .flatMap((g) => {
          const isMandatory = branchStates[g.branch] === 'mandatory';
          const sorted = [...g.candidates].sort((a, b) => b.score - a.score);
          let candidates: typeof sorted;
          if (showAll) {
            candidates = sorted;
          } else if (isMandatory) {
            const branchLimit = Math.max(safeTopN, 3);
            candidates = sorted.slice(0, branchLimit);
          } else {
            candidates = effectiveThreshold > 0
              ? sorted.filter((c) => c.score >= effectiveThreshold)
              : sorted;
          }
          if (searchFilterSet && !isMandatory) {
            candidates = candidates.filter((c) => searchFilterSet.has(c.iri_hash));
          }
          return candidates.map((c) => c.iri_hash);
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

  const isCurrentSuggested = suggestionQueue.some((s) => s.item_index === currentItemIndex);
  const isCurrentReviewed = reviewQueue.some((r) => r.item_index === currentItemIndex);

  const handleClearAll = () => {
    // Remove all currently selected candidates for this item
    for (const iriHash of currentSelections) {
      onToggleCandidate(iriHash);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
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
        topN={topN}
        defaultTopN={defaultTopN}
        onPrev={onPrev}
        onNext={onNext}
        onSkip={onSkip}
        onGoTo={onOpenGoTo}
        onAcceptAll={onAcceptAll}
        onEdit={onEdit}
        onTopNChange={onTopNChange}
        onDefaultTopNChange={onDefaultTopNChange}
        onShowShortcuts={onShowShortcuts}
        onMappings={onMappings}
        onExport={onExport}
        loadedItemCount={loadedItemCount}
        isBatchLoading={isBatchLoading}
      />

      {currentItem && (
        <div className="flex min-h-0 flex-1">
          {/* Left column: Your Input (sticky) + Candidate Panel */}
          <div className="flex w-1/2 flex-col border-r border-gray-200">
            {/* Sticky "Your Input" header + Select All / Clear / Branch Options */}
            <div className="shrink-0 border-b border-gray-200 bg-white px-4 pt-3 pb-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-blue-600">Your Input</p>
              <div className="rounded-lg border-2 border-blue-200 bg-blue-50 p-3">
                <PrescanDisplay itemText={currentItem.item_text} segments={prescanSegments ?? null} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <form
                  className="flex items-center gap-1"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const q = searchQuery.trim();
                    if (!q || isSearching) return;
                    await onSearch(q);
                  }}
                >
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      // Clear filter when user edits the search term
                      if (searchFilterHashes && onClearSearchFilter) onClearSearchFilter();
                    }}
                    placeholder="Search and filter candidates..."
                    disabled={isSearching}
                    className={`w-44 rounded border px-2 py-1 text-xs placeholder:text-gray-400 focus:border-blue-400 focus:outline-none disabled:opacity-50 ${
                      searchFilterHashes ? 'border-blue-400 bg-blue-50 text-blue-800' : 'border-gray-300'
                    }`}
                  />
                  {searchFilterHashes ? (
                    <button
                      type="button"
                      onClick={() => { onClearSearchFilter?.(); setSearchQuery(''); }}
                      className="flex items-center gap-1 rounded border border-blue-300 bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-200"
                      title="Clear search filter"
                    >
                      <span className="text-blue-500">&times;</span>
                      Clear
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={isSearching || !searchQuery.trim()}
                      className="flex items-center gap-1 rounded border border-blue-300 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-40"
                    >
                      {isSearching ? (
                        <span className="inline-block h-3 w-3 animate-spin rounded-full border border-blue-300 border-t-blue-600" />
                      ) : (
                        <>
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                          Search
                        </>
                      )}
                    </button>
                  )}
                </form>
                {currentSelections.length === 0 ? (
                  <button
                    type="button"
                    onClick={handleSelectAllVisible}
                    className="flex items-center gap-1 rounded border border-gray-300 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Select All
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="flex items-center gap-1 rounded border border-gray-300 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Clear All
                  </button>
                )}
                <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (allExpanded) {
                      setCollapseAllSignal((n) => n + 1);
                    } else {
                      setExpandAllSignal((n) => n + 1);
                    }
                    setAllExpanded((v) => !v);
                  }}
                  className="flex items-center gap-1 rounded border border-gray-300 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {allExpanded ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4h16v4M4 16v4h16v-4" />
                    )}
                  </svg>
                  {allExpanded ? 'Collapse All' : 'Expand All'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowBranchOptions(true)}
                  className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  title="Branch Options"
                  aria-label="Branch options"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
                </div>
                {suggestionQueue.some((s) => s.item_index === currentItemIndex) ? (
                  <button
                    type="button"
                    disabled
                    className="flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-600"
                    title="This item has been suggested for FOLIO"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Suggested
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      onSuggestToFolio();
                      if (!notes[currentItemIndex]) {
                        setNotesNudge(true);
                      }
                    }}
                    className="flex items-center gap-1 rounded bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-600"
                    title="Suggest adding this concept to the FOLIO standard (F)"
                  >
                    <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z" />
                    </svg>
                    Suggest
                  </button>
                )}
                {isCurrentReviewed ? (
                  <button
                    type="button"
                    disabled
                    className="flex items-center gap-1 rounded border border-blue-300 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-600"
                    title="This item is flagged for review"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4l11-11 4 4-11 11H3z" />
                    </svg>
                    Flagged
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      onFlagForReview();
                      if (!notes[currentItemIndex]) {
                        setNotesNudge(true);
                      }
                    }}
                    className="flex items-center gap-1 rounded border border-blue-300 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                    title="Flag for further review (R)"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4l11-11 4 4-11 11H3z" />
                    </svg>
                    Review
                  </button>
                )}
              </div>
            </div>
            {/* Scrollable candidate results */}
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <CandidatePanel
                branchGroups={completeBranchGroups}
                branchStates={branchStates}
                selectedIriHashes={currentSelections}
                selectedCandidateIri={selectedCandidateIri}
                topN={safeTopN}
                threshold={effectiveThreshold}
                onToggleCandidate={(iriHash) => onToggleCandidate(iriHash)}
                onSelectForDetail={(iriHash) => onSelectForDetail(iriHash)}
                expandAllSignal={expandAllSignal}
                collapseAllSignal={collapseAllSignal}
                searchFilterHashes={searchFilterHashes}
                isProcessing={isBatchLoading || isLoadingCandidates}
              />
            </div>
          </div>

          {/* Right column: Selection Tree + Detail Panel */}
          <div className="flex w-1/2 flex-col">
            {/* Top half: Current Selection(s) */}
            <div className="flex min-h-0 flex-1 flex-col border-b border-gray-200">
              <div className="shrink-0 border-b border-gray-300 bg-gray-200 px-4 py-1.5">
                <div className="flex items-center justify-between">
                  <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-600">
                    Current Selection(s)
                  </h2>
                  <span className="text-[11px] text-gray-500">
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
            {/* Bottom half: Candidate Details */}
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="shrink-0 border-b border-gray-300 bg-gray-200">
                <div className="flex">
                  {/* Candidate Details tab — always active */}
                  <div className="flex-1 border-b-2 border-gray-600 bg-white/60 px-4 py-1.5 text-center">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-gray-700">
                      Candidate Details
                    </span>
                  </div>
                  {/* Entity Graph tab — clickable when candidate selected */}
                  <button
                    type="button"
                    disabled={!selectedCandidate}
                    onClick={() => selectedCandidate && setGraphTarget({ iriHash: selectedCandidate.iri_hash, label: selectedCandidate.label })}
                    className={`flex flex-1 items-center justify-center gap-1.5 px-4 py-1.5 text-center transition-colors ${
                      selectedCandidate
                        ? 'cursor-pointer text-gray-500 hover:bg-white/40 hover:text-gray-700'
                        : 'cursor-default text-gray-400'
                    }`}
                    title={selectedCandidate ? 'Open full entity graph' : 'Select a candidate first'}
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <circle cx="6" cy="6" r="2" />
                      <circle cx="18" cy="6" r="2" />
                      <circle cx="12" cy="18" r="2" />
                      <line x1="7.5" y1="7.5" x2="11" y2="16" strokeLinecap="round" />
                      <line x1="16.5" y1="7.5" x2="13" y2="16" strokeLinecap="round" />
                    </svg>
                    <span className="text-[11px] font-bold uppercase tracking-wider">
                      Entity Graph
                    </span>
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <DetailPanel
                  currentItem={currentItem}
                  selectedCandidate={selectedCandidate}
                  onSelectForDetail={(iriHash) => onSelectForDetail(iriHash)}
                  onOpenGraph={(iriHash, label) => setGraphTarget({ iriHash, label })}
                />
              </div>
            </div>
            {/* Notes — amber when current item is in suggestion or review queue */}
            <div className={`shrink-0 border-b border-gray-300 px-4 py-2 ${notesNudge ? 'animate-[nudge-bg_1s_ease-in-out_forwards]' : (isCurrentSuggested || isCurrentReviewed) ? 'bg-amber-50' : 'bg-gray-200'}`}>
              <style dangerouslySetInnerHTML={{ __html: NUDGE_KEYFRAMES }} />
              <div className="mb-1 flex items-center gap-2">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-600" htmlFor="item-note">
                  Notes
                </label>
                {notesNudge && (
                  <span className="text-[10px] font-medium text-amber-600">
                    Add context to strengthen your {isCurrentReviewed && !isCurrentSuggested ? 'review' : 'suggestion'}
                  </span>
                )}
              </div>
              <textarea
                id="item-note"
                value={notes[currentItemIndex] || ''}
                onChange={(e) => { onSetNote(currentItemIndex, e.target.value); if (notesNudge) setNotesNudge(false); }}
                placeholder="Add a note for this item..."
                rows={(isCurrentSuggested || isCurrentReviewed) || notes[currentItemIndex] ? 2 : 1}
                onFocus={(e) => { if (!notes[currentItemIndex]) (e.target as HTMLTextAreaElement).rows = 2; }}
                onBlur={(e) => { if (!notes[currentItemIndex] && !isCurrentSuggested && !isCurrentReviewed) (e.target as HTMLTextAreaElement).rows = 1; }}
                className={`w-full resize-none rounded border bg-white px-2 py-1 text-xs text-gray-700 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none ${(isCurrentSuggested || isCurrentReviewed) ? 'border-amber-300' : 'border-gray-200'}`}
              />
            </div>
            {/* Suggestion Queue */}
            <SuggestionQueuePanel
              queue={suggestionQueue}
              notes={notes}
              currentItemIndex={currentItemIndex}
              onEdit={onEditSuggestion}
              onRemove={onRemoveSuggestion}
              onSubmit={onOpenSubmission}
            />
            {/* Review Queue */}
            <ReviewQueuePanel
              queue={reviewQueue}
              notes={notes}
              currentItemIndex={currentItemIndex}
              onNavigate={onNavigateToItem}
              onRemove={onRemoveReview}
            />
          </div>
        </div>
      )}

      {!currentItem && (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
            <p className="text-sm text-gray-600">
              Loading candidates for item {currentItemIndex + 1}...
            </p>
            {loadedItemCount != null && (
              <p className="mt-1 text-xs text-gray-400">
                {loadedItemCount} of {totalItems} items loaded
              </p>
            )}
            {batchLoadingError && (
              <p className="mt-1 text-xs text-amber-600">{batchLoadingError}</p>
            )}
          </div>
        </div>
      )}

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

      {graphTarget && (
        <EntityGraphModal
          iriHash={graphTarget.iriHash}
          label={graphTarget.label}
          onNavigateToConcept={(iriHash) => {
            onSelectForDetail(iriHash);
            setGraphTarget(null);
          }}
          onClose={() => setGraphTarget(null)}
        />
      )}
    </div>
  );
}
