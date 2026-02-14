import { create } from 'zustand';
import type {
  FolioCandidate,
  FolioStatus,
  MappingResponse,
  NodeStatus,
  PipelineItemMetadata,
} from '@folio-mapper/core';

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
  threshold: number; // default 45
  enabledBranches: Set<string>;

  // Detail panel
  selectedCandidateIri: string | null;

  // Pipeline metadata (from LLM-enhanced path)
  pipelineMetadata: PipelineItemMetadata[] | null;

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
  setThreshold: (threshold: number) => void;
  toggleBranch: (branchName: string) => void;
  selectCandidateForDetail: (iriHash: string | null) => void;
  setPipelineMetadata: (metadata: PipelineItemMetadata[] | null) => void;
  setFolioStatus: (status: FolioStatus) => void;
  setLoadingCandidates: (loading: boolean) => void;
  setError: (error: string | null) => void;
  startMapping: (response: MappingResponse, threshold: number) => void;
  resetMapping: () => void;
}

function getAboveThresholdCandidates(
  response: MappingResponse,
  itemIndex: number,
  threshold: number,
): string[] {
  const item = response.items[itemIndex];
  if (!item) return [];

  const iriHashes: string[] = [];
  for (const group of item.branch_groups) {
    for (const candidate of group.candidates) {
      if (candidate.score >= threshold) {
        iriHashes.push(candidate.iri_hash);
      }
    }
  }
  return iriHashes;
}

export const useMappingStore = create<MappingState>((set, get) => ({
  mappingResponse: null,
  currentItemIndex: 0,
  totalItems: 0,
  selections: {},
  nodeStatuses: {},
  threshold: 45,
  enabledBranches: new Set<string>(),
  selectedCandidateIri: null,
  pipelineMetadata: null,
  folioStatus: { loaded: false, concept_count: 0, loading: false, error: null },
  isLoadingCandidates: false,
  error: null,

  setMappingResponse: (response) =>
    set({
      mappingResponse: response,
      totalItems: response.total_items,
    }),

  nextItem: () => {
    const { currentItemIndex, totalItems, nodeStatuses } = get();
    // Mark current as completed if pending
    const currentStatus = nodeStatuses[currentItemIndex];
    const updatedStatuses = { ...nodeStatuses };
    if (!currentStatus || currentStatus === 'pending') {
      updatedStatuses[currentItemIndex] = 'completed';
    }

    const nextIndex = Math.min(currentItemIndex + 1, totalItems - 1);
    set({
      nodeStatuses: updatedStatuses,
      currentItemIndex: nextIndex,
      selectedCandidateIri: null,
    });
  },

  prevItem: () => {
    const { currentItemIndex } = get();
    set({
      currentItemIndex: Math.max(currentItemIndex - 1, 0),
      selectedCandidateIri: null,
    });
  },

  skipItem: () => {
    const { currentItemIndex, totalItems, nodeStatuses } = get();
    const updatedStatuses = { ...nodeStatuses };
    updatedStatuses[currentItemIndex] = 'skipped';

    const nextIndex = Math.min(currentItemIndex + 1, totalItems - 1);
    set({
      nodeStatuses: updatedStatuses,
      currentItemIndex: nextIndex,
      selectedCandidateIri: null,
    });
  },

  goToItem: (index) => {
    const { totalItems } = get();
    if (index >= 0 && index < totalItems) {
      set({ currentItemIndex: index, selectedCandidateIri: null });
    }
  },

  acceptAllDefaults: () => {
    const { mappingResponse, threshold, selections, nodeStatuses } = get();
    if (!mappingResponse) return;

    const updatedSelections = { ...selections };
    const updatedStatuses = { ...nodeStatuses };

    for (let i = 0; i < mappingResponse.items.length; i++) {
      // Only auto-select for items that haven't been completed
      if (updatedStatuses[i] === 'completed') continue;

      const defaults = getAboveThresholdCandidates(mappingResponse, i, threshold);
      updatedSelections[i] = defaults;
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

  setThreshold: (threshold) => set({ threshold }),

  toggleBranch: (branchName) => {
    const { enabledBranches } = get();
    const updated = new Set(enabledBranches);
    if (updated.has(branchName)) {
      updated.delete(branchName);
    } else {
      updated.add(branchName);
    }
    set({ enabledBranches: updated });
  },

  selectCandidateForDetail: (iriHash) => set({ selectedCandidateIri: iriHash }),

  setPipelineMetadata: (metadata) => set({ pipelineMetadata: metadata }),

  setFolioStatus: (status) => set({ folioStatus: status }),

  setLoadingCandidates: (loading) => set({ isLoadingCandidates: loading }),

  setError: (error) => set({ error, isLoadingCandidates: false }),

  startMapping: (response, threshold) => {
    // Initialize selections with above-threshold candidates pre-checked
    const selections: Record<number, string[]> = {};
    const nodeStatuses: Record<number, NodeStatus> = {};

    // Enable all branches that have candidates
    const branchNames = new Set<string>();
    for (const item of response.items) {
      nodeStatuses[item.item_index] = 'pending';
      selections[item.item_index] = getAboveThresholdCandidates(
        response,
        item.item_index,
        threshold,
      );
      for (const group of item.branch_groups) {
        branchNames.add(group.branch);
      }
    }

    set({
      mappingResponse: response,
      totalItems: response.total_items,
      currentItemIndex: 0,
      selections,
      nodeStatuses,
      threshold,
      enabledBranches: branchNames,
      selectedCandidateIri: null,
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
      threshold: 45,
      enabledBranches: new Set<string>(),
      selectedCandidateIri: null,
      pipelineMetadata: null,
      isLoadingCandidates: false,
      error: null,
    }),
}));
