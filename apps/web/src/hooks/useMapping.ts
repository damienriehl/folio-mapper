import { useCallback } from 'react';
import {
  fetchCandidates,
  fetchMandatoryFallback,
  fetchPipelineCandidates,
} from '@folio-mapper/core';
import type {
  BranchState,
  ParseItem,
  PipelineRequestConfig,
} from '@folio-mapper/core';
import { useMappingStore } from '../store/mapping-store';

/**
 * Hook to trigger candidate fetching and initialize mapping state.
 */
export function useMapping() {
  const { startMapping, setPipelineMetadata, setLoadingCandidates, setError, mergeFallbackResults, mergeSearchResults } =
    useMappingStore();

  const loadCandidates = useCallback(
    async (items: ParseItem[]) => {
      setLoadingCandidates(true);
      setError(null);

      try {
        const response = await fetchCandidates(items, 0, 10);
        startMapping(response);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load candidates');
      }
    },
    [startMapping, setLoadingCandidates, setError],
  );

  const loadPipelineCandidates = useCallback(
    async (items: ParseItem[], llmConfig: PipelineRequestConfig) => {
      setLoadingCandidates(true);
      setError(null);

      try {
        const response = await fetchPipelineCandidates(items, llmConfig, 0, 10);
        startMapping(response.mapping);
        setPipelineMetadata(response.pipeline_metadata);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Pipeline mapping failed');
      }
    },
    [startMapping, setPipelineMetadata, setLoadingCandidates, setError],
  );

  const loadMandatoryFallback = useCallback(
    async (
      itemIndex: number,
      itemText: string,
      branchStates: Record<string, BranchState>,
      branchesWithCandidates: Set<string>,
      llmConfig?: PipelineRequestConfig | null,
    ) => {
      // Find mandatory branches that have no existing candidates for this item
      const mandatoryWithNoCandidates = Object.entries(branchStates)
        .filter(([name, state]) => state === 'mandatory' && !branchesWithCandidates.has(name))
        .map(([name]) => name);

      if (mandatoryWithNoCandidates.length === 0) return;

      try {
        const response = await fetchMandatoryFallback(
          itemText,
          itemIndex,
          mandatoryWithNoCandidates,
          llmConfig,
        );
        mergeFallbackResults(response.item_index, response.fallback_results);
      } catch {
        // Non-fatal: silently fail if backend/LLM unavailable
      }
    },
    [mergeFallbackResults],
  );

  const searchCandidates = useCallback(
    async (query: string, itemIndex: number, llmConfig?: PipelineRequestConfig | null) => {
      const syntheticItem: ParseItem = { text: query, index: 0, ancestry: [] };

      if (llmConfig) {
        const response = await fetchPipelineCandidates([syntheticItem], llmConfig, 0, 10);
        mergeSearchResults(itemIndex, response.mapping);
      } else {
        const response = await fetchCandidates([syntheticItem], 0, 10);
        mergeSearchResults(itemIndex, response);
      }
    },
    [mergeSearchResults],
  );

  return { loadCandidates, loadPipelineCandidates, loadMandatoryFallback, searchCandidates };
}
