import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  BranchFallbackResult,
  BranchSortMode,
  BranchState,
  FolioStatus,
  MappingResponse,
  NodeStatus,
  PipelineItemMetadata,
  StatusFilter,
  SuggestionEntry,
} from '@folio-mapper/core';
import { computeScoreCutoff } from '@folio-mapper/core';
import { createDebouncedStorage } from './session-storage';

interface MappingState {
  // Data
  mappingResponse: MappingResponse | null;
  currentItemIndex: number;
  totalItems: number;

  // Selections: itemIndex -> set of selected IRI hashes
  selections: Record<number, string[]>;

  // Node statuses: itemIndex -> status
  nodeStatuses: Record<number, NodeStatus>;

  // Filters
  topN: number; // transient — resets to defaultTopN on navigation
  defaultTopN: number; // persisted user preference
  branchStates: Record<string, BranchState>;

  // Branch ordering
  branchSortMode: BranchSortMode;
  customBranchOrder: string[];

  // Input-page branch preferences (carry over to mapping)
  inputBranchStates: Record<string, BranchState>;

  // Per-item notes
  notes: Record<number, string>;

  // Status filter
  statusFilter: StatusFilter;

  // Detail panel
  selectedCandidateIri: string | null;

  // Pipeline metadata (from LLM-enhanced path)
  pipelineMetadata: PipelineItemMetadata[] | null;

  // Suggestion queue for ALEA submissions
  suggestionQueue: SuggestionEntry[];

  // Search filter: IRI hashes from last search (null = no filter active)
  searchFilterHashes: string[] | null;

  // FOLIO loading state
  folioStatus: FolioStatus;
  isLoadingCandidates: boolean;
  error: string | null;

  // Actions
  setMappingResponse: (response: MappingResponse) => void;
  nextItem: () => void;
  prevItem: () => void;
  skipItem: () => void;
  goToItem: (index: number) => void;
  acceptAllDefaults: () => void;
  toggleCandidate: (itemIndex: number, iriHash: string) => void;
  setTopN: (n: number) => void;
  setDefaultTopN: (n: number) => void;
  setBranchState: (branchName: string, state: BranchState) => void;
  setInputBranchState: (branchName: string, state: BranchState) => void;
  setBranchSortMode: (mode: BranchSortMode) => void;
  setCustomBranchOrder: (order: string[]) => void;
  mergeFallbackResults: (itemIndex: number, fallbackResults: BranchFallbackResult[]) => void;
  mergeSearchResults: (itemIndex: number, searchResponse: MappingResponse) => void;
  setNote: (itemIndex: number, text: string) => void;
  setStatusFilter: (filter: StatusFilter) => void;
  selectCandidateForDetail: (iriHash: string | null) => void;
  setPipelineMetadata: (metadata: PipelineItemMetadata[] | null) => void;
  setFolioStatus: (status: FolioStatus) => void;
  setLoadingCandidates: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearSearchFilter: () => void;
  addSuggestion: (entry: SuggestionEntry) => void;
  removeSuggestion: (id: string) => void;
  updateSuggestion: (id: string, updates: Partial<SuggestionEntry>) => void;
  clearSuggestionQueue: () => void;
  startMapping: (response: MappingResponse) => void;
  resetMapping: () => void;
}

// High-confidence cutoff for initial auto-selection (distinct from visibility threshold)
const AUTO_SELECT_SCORE = 80;

function getHighConfidenceCandidates(
  response: MappingResponse,
  itemIndex: number,
): string[] {
  const item = response.items[itemIndex];
  if (!item) return [];

  const iriHashes: string[] = [];
  for (const group of item.branch_groups) {
    for (const candidate of group.candidates) {
      if (candidate.score >= AUTO_SELECT_SCORE) {
        iriHashes.push(candidate.iri_hash);
      }
    }
  }
  return iriHashes;
}

function matchesFilter(
  index: number,
  nodeStatuses: Record<number, NodeStatus>,
  selections: Record<number, string[]>,
  filter: StatusFilter,
): boolean {
  if (filter === 'all') return true;
  const status = nodeStatuses[index] || 'pending';
  if (filter === 'pending') return status === 'pending';
  if (filter === 'completed') return status === 'completed';
  if (filter === 'skipped') return status === 'skipped';
  // needs_attention: pending AND zero selections
  return status === 'pending' && (selections[index]?.length ?? 0) === 0;
}

const debouncedStorage = createDebouncedStorage();

export const useMappingStore = create<MappingState>()(
  persist(
    (set, get) => ({
      mappingResponse: null,
      currentItemIndex: 0,
      totalItems: 0,
      selections: {},
      nodeStatuses: {},
      topN: 5,
      defaultTopN: 5,
      branchStates: {},
      branchSortMode: 'default' as BranchSortMode,
      customBranchOrder: [] as string[],
      inputBranchStates: { 'Area of Law': 'mandatory' } as Record<string, BranchState>,
      notes: {} as Record<number, string>,
      statusFilter: 'all' as StatusFilter,
      selectedCandidateIri: null,
      pipelineMetadata: null,
      suggestionQueue: [] as SuggestionEntry[],
      searchFilterHashes: null,
      folioStatus: { loaded: false, concept_count: 0, loading: false, error: null },
      isLoadingCandidates: false,
      error: null,

      setMappingResponse: (response) =>
        set({
          mappingResponse: response,
          totalItems: response.total_items,
        }),

      nextItem: () => {
        const { currentItemIndex, totalItems, nodeStatuses, statusFilter, selections } = get();
        // Mark current as completed if pending
        const currentStatus = nodeStatuses[currentItemIndex];
        const updatedStatuses = { ...nodeStatuses };
        if (!currentStatus || currentStatus === 'pending') {
          updatedStatuses[currentItemIndex] = 'completed';
        }

        // Scan forward for next item matching filter
        let nextIndex = currentItemIndex;
        for (let i = currentItemIndex + 1; i < totalItems; i++) {
          if (matchesFilter(i, updatedStatuses, selections, statusFilter)) {
            nextIndex = i;
            break;
          }
        }
        // If nothing found forward and we're still on the same index, just go to next
        if (nextIndex === currentItemIndex && currentItemIndex < totalItems - 1) {
          nextIndex = Math.min(currentItemIndex + 1, totalItems - 1);
        }

        set({
          nodeStatuses: updatedStatuses,
          currentItemIndex: nextIndex,
          topN: get().defaultTopN,
          selectedCandidateIri: null,
          searchFilterHashes: null,
        });
      },

      prevItem: () => {
        const { currentItemIndex, nodeStatuses, statusFilter, selections } = get();
        // Scan backward for previous item matching filter
        let prevIndex = currentItemIndex;
        for (let i = currentItemIndex - 1; i >= 0; i--) {
          if (matchesFilter(i, nodeStatuses, selections, statusFilter)) {
            prevIndex = i;
            break;
          }
        }
        // If nothing found backward, just go to previous
        if (prevIndex === currentItemIndex && currentItemIndex > 0) {
          prevIndex = Math.max(currentItemIndex - 1, 0);
        }

        set({
          currentItemIndex: prevIndex,
          topN: get().defaultTopN,
          selectedCandidateIri: null,
          searchFilterHashes: null,
        });
      },

      skipItem: () => {
        const { currentItemIndex, totalItems, nodeStatuses, statusFilter, selections } = get();
        const updatedStatuses = { ...nodeStatuses };
        updatedStatuses[currentItemIndex] = 'skipped';

        // Scan forward for next item matching filter
        let nextIndex = currentItemIndex;
        for (let i = currentItemIndex + 1; i < totalItems; i++) {
          if (matchesFilter(i, updatedStatuses, selections, statusFilter)) {
            nextIndex = i;
            break;
          }
        }
        if (nextIndex === currentItemIndex && currentItemIndex < totalItems - 1) {
          nextIndex = Math.min(currentItemIndex + 1, totalItems - 1);
        }

        set({
          nodeStatuses: updatedStatuses,
          currentItemIndex: nextIndex,
          topN: get().defaultTopN,
          selectedCandidateIri: null,
          searchFilterHashes: null,
        });
      },

      goToItem: (index) => {
        const { totalItems } = get();
        if (index >= 0 && index < totalItems) {
          set({ currentItemIndex: index, topN: get().defaultTopN, selectedCandidateIri: null, searchFilterHashes: null });
        }
      },

      acceptAllDefaults: () => {
        const { mappingResponse, defaultTopN, branchStates, selections, nodeStatuses } = get();
        if (!mappingResponse) return;

        const updatedSelections = { ...selections };
        const updatedStatuses = { ...nodeStatuses };

        for (let i = 0; i < mappingResponse.items.length; i++) {
          // Only auto-select for items that haven't been completed
          if (updatedStatuses[i] === 'completed') continue;

          const item = mappingResponse.items[i];
          if (!item) continue;

          const cutoff = computeScoreCutoff(item.branch_groups, defaultTopN, branchStates);
          const visible: string[] = [];
          for (const group of item.branch_groups) {
            const state = branchStates[group.branch];
            if (state === 'excluded') continue;
            const isMandatory = state === 'mandatory';
            for (const candidate of group.candidates) {
              if (isMandatory || candidate.score >= cutoff) {
                visible.push(candidate.iri_hash);
              }
            }
          }
          updatedSelections[i] = visible;
          updatedStatuses[i] = 'completed';
        }

        set({
          selections: updatedSelections,
          nodeStatuses: updatedStatuses,
        });
      },

      toggleCandidate: (itemIndex, iriHash) => {
        const { selections } = get();
        const current = selections[itemIndex] || [];
        const updated = current.includes(iriHash)
          ? current.filter((h) => h !== iriHash)
          : [...current, iriHash];

        set({
          selections: { ...selections, [itemIndex]: updated },
        });
      },

      setTopN: (n) => set({ topN: n }),

      setDefaultTopN: (n) => set({ defaultTopN: n, topN: n }),

      setBranchState: (branchName, state) => {
        const { branchStates } = get();
        set({ branchStates: { ...branchStates, [branchName]: state } });
      },

      setInputBranchState: (branchName, state) => {
        const { inputBranchStates } = get();
        set({ inputBranchStates: { ...inputBranchStates, [branchName]: state } });
      },

      setBranchSortMode: (mode) => {
        const { customBranchOrder, branchStates } = get();
        if (mode === 'custom' && customBranchOrder.length === 0) {
          // Initialize custom order from current branch names
          set({ branchSortMode: mode, customBranchOrder: Object.keys(branchStates) });
        } else {
          set({ branchSortMode: mode });
        }
      },

      setCustomBranchOrder: (order) => set({ customBranchOrder: order }),

      mergeFallbackResults: (itemIndex, fallbackResults) => {
        const { mappingResponse } = get();
        if (!mappingResponse) return;

        const items = [...mappingResponse.items];
        const item = items[itemIndex];
        if (!item) return;

        const updatedGroups = [...item.branch_groups];

        for (const fb of fallbackResults) {
          if (fb.candidates.length === 0) continue;

          const existingGroup = updatedGroups.find((g) => g.branch === fb.branch);
          if (existingGroup) {
            // Merge: add candidates not already present (dedupe by iri_hash)
            const existingHashes = new Set(existingGroup.candidates.map((c) => c.iri_hash));
            const newCandidates = fb.candidates.filter((c) => !existingHashes.has(c.iri_hash));
            if (newCandidates.length > 0) {
              existingGroup.candidates = [...existingGroup.candidates, ...newCandidates];
            }
          } else {
            // Add new branch group
            updatedGroups.push({
              branch: fb.branch,
              branch_color: fb.branch_color,
              candidates: fb.candidates,
            });
          }
        }

        // Keep branch groups sorted alphabetically (matches backend order)
        updatedGroups.sort((a, b) => a.branch.localeCompare(b.branch));

        const updatedItem = {
          ...item,
          branch_groups: updatedGroups,
          total_candidates: updatedGroups.reduce((sum, g) => sum + g.candidates.length, 0),
        };
        items[itemIndex] = updatedItem;

        set({
          mappingResponse: { ...mappingResponse, items },
        });
      },

      mergeSearchResults: (itemIndex, searchResponse) => {
        const { mappingResponse, branchStates } = get();
        if (!mappingResponse) return;

        const searchItem = searchResponse.items[0];
        if (!searchItem) return;

        const items = [...mappingResponse.items];
        const item = items[itemIndex];
        if (!item) return;

        const updatedGroups = [...item.branch_groups];
        const newBranchStates = { ...branchStates };
        const newHashes: string[] = [];

        for (const group of searchItem.branch_groups) {
          if (group.candidates.length === 0) continue;

          const existingGroup = updatedGroups.find((g) => g.branch === group.branch);
          if (existingGroup) {
            const existingHashes = new Set(existingGroup.candidates.map((c) => c.iri_hash));
            const newCandidates = group.candidates.filter((c) => !existingHashes.has(c.iri_hash));
            if (newCandidates.length > 0) {
              existingGroup.candidates = [...existingGroup.candidates, ...newCandidates];
              for (const c of newCandidates) newHashes.push(c.iri_hash);
            }
          } else {
            updatedGroups.push({
              branch: group.branch,
              branch_color: group.branch_color,
              candidates: group.candidates,
            });
            for (const c of group.candidates) newHashes.push(c.iri_hash);
          }

          if (!(group.branch in newBranchStates)) {
            newBranchStates[group.branch] = 'normal';
          }
        }

        updatedGroups.sort((a, b) => a.branch.localeCompare(b.branch));

        const updatedItem = {
          ...item,
          branch_groups: updatedGroups,
          total_candidates: updatedGroups.reduce((sum, g) => sum + g.candidates.length, 0),
        };
        items[itemIndex] = updatedItem;

        set({
          mappingResponse: { ...mappingResponse, items },
          branchStates: newBranchStates,
          searchFilterHashes: newHashes.length > 0 ? newHashes : null,
        });
      },

      setNote: (itemIndex, text) => {
        const { notes } = get();
        set({ notes: { ...notes, [itemIndex]: text } });
      },

      setStatusFilter: (filter) => set({ statusFilter: filter }),

      selectCandidateForDetail: (iriHash) => set({ selectedCandidateIri: iriHash }),

      setPipelineMetadata: (metadata) => set({ pipelineMetadata: metadata }),

      setFolioStatus: (status) => set({ folioStatus: status }),

      setLoadingCandidates: (loading) => set({ isLoadingCandidates: loading }),

      setError: (error) => set({ error, isLoadingCandidates: false }),

      clearSearchFilter: () => set({ searchFilterHashes: null }),

      addSuggestion: (entry) => {
        const { suggestionQueue } = get();
        // Prevent duplicate for same item
        if (suggestionQueue.some((s) => s.item_index === entry.item_index)) return;
        set({ suggestionQueue: [...suggestionQueue, entry] });
      },

      removeSuggestion: (id) => {
        const { suggestionQueue } = get();
        set({ suggestionQueue: suggestionQueue.filter((s) => s.id !== id) });
      },

      updateSuggestion: (id, updates) => {
        const { suggestionQueue } = get();
        set({
          suggestionQueue: suggestionQueue.map((s) =>
            s.id === id ? { ...s, ...updates } : s,
          ),
        });
      },

      clearSuggestionQueue: () => set({ suggestionQueue: [] }),

      startMapping: (response) => {
        const { inputBranchStates, branchSortMode, customBranchOrder, defaultTopN } = get();

        // Initialize selections with high-confidence candidates pre-checked
        const selections: Record<number, string[]> = {};
        const nodeStatuses: Record<number, NodeStatus> = {};

        // Initialize all available branches — apply input-page mandatory prefs
        const branchStates: Record<string, BranchState> = {};
        for (const b of response.branches_available) {
          branchStates[b.name] = inputBranchStates[b.name] === 'mandatory' ? 'mandatory' : 'normal';
        }
        // Also include branches that have candidates but may not be in branches_available
        for (const item of response.items) {
          nodeStatuses[item.item_index] = 'pending';
          selections[item.item_index] = getHighConfidenceCandidates(
            response,
            item.item_index,
          );
          for (const group of item.branch_groups) {
            if (!(group.branch in branchStates)) {
              branchStates[group.branch] = inputBranchStates[group.branch] === 'mandatory' ? 'mandatory' : 'normal';
            }
          }
        }

        set({
          mappingResponse: response,
          totalItems: response.total_items,
          currentItemIndex: 0,
          selections,
          nodeStatuses,
          topN: defaultTopN,
          branchStates,
          // Preserve user's sort preferences from input page
          branchSortMode,
          customBranchOrder,
          selectedCandidateIri: null,
          notes: {},
          statusFilter: 'all' as StatusFilter,
          isLoadingCandidates: false,
          error: null,
        });
      },

      resetMapping: () =>
        set({
          mappingResponse: null,
          currentItemIndex: 0,
          totalItems: 0,
          selections: {},
          nodeStatuses: {},
          topN: 5,
          branchStates: {},
          branchSortMode: 'default' as BranchSortMode,
          customBranchOrder: [],
          inputBranchStates: { 'Area of Law': 'mandatory' },
          selectedCandidateIri: null,
          notes: {},
          statusFilter: 'all' as StatusFilter,
          pipelineMetadata: null,
          suggestionQueue: [],
          searchFilterHashes: null,
          isLoadingCandidates: false,
          error: null,
        }),
    }),
    {
      name: 'folio-mapper-session-mapping',
      storage: createJSONStorage(() => debouncedStorage),
      partialize: (state) => ({
        mappingResponse: state.mappingResponse,
        currentItemIndex: state.currentItemIndex,
        selections: state.selections,
        nodeStatuses: state.nodeStatuses,
        defaultTopN: state.defaultTopN,
        branchStates: state.branchStates,
        branchSortMode: state.branchSortMode,
        customBranchOrder: state.customBranchOrder,
        inputBranchStates: state.inputBranchStates,
        notes: state.notes,
        statusFilter: state.statusFilter,
        pipelineMetadata: state.pipelineMetadata,
        suggestionQueue: state.suggestionQueue,
      }),
      merge: (persisted, current) => {
        const p = persisted as Partial<MappingState> | undefined;
        if (!p) return current;
        return {
          ...current,
          ...p,
          // Re-derive totalItems from mappingResponse
          totalItems: p.mappingResponse?.total_items ?? 0,
          // Init topN from persisted defaultTopN (transient field)
          topN: p.defaultTopN ?? current.defaultTopN,
          // Reset transient fields
          selectedCandidateIri: null,
          folioStatus: { loaded: false, concept_count: 0, loading: false, error: null },
          isLoadingCandidates: false,
          error: null,
        };
      },
    },
  ),
);
