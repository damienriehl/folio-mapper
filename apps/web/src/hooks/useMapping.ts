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
  const { threshold, startMapping, setPipelineMetadata, setLoadingCandidates, setError, mergeFallbackResults } =
    useMappingStore();

  const loadCandidates = useCallback(
    async (items: ParseItem[]) => {
      setLoadingCandidates(true);
      setError(null);

      try {
        const response = await fetchCandidates(items, 0, 10);
        startMapping(response, threshold);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load candidates');
      }
    },
    [threshold, startMapping, setLoadingCandidates, setError],
  );

  const loadPipelineCandidates = useCallback(
    async (items: ParseItem[], llmConfig: PipelineRequestConfig) => {
      setLoadingCandidates(true);
      setError(null);

      try {
        const response = await fetchPipelineCandidates(items, llmConfig, 0, 10);
        startMapping(response.mapping, threshold);
        setPipelineMetadata(response.pipeline_metadata);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Pipeline mapping failed');
      }
    },
    [threshold, startMapping, setPipelineMetadata, setLoadingCandidates, setError],
  );

  const loadMandatoryFallback = useCallback(
    async (
      itemIndex: number,
      itemText: string,
      branchStates: Record<string, BranchState>,
      existingBranchNames: string[],
      llmConfig?: PipelineRequestConfig | null,
    ) => {
      // Find mandatory branches that have no existing candidates for this item
      const mandatoryWithNoCandidates = Object.entries(branchStates)
        .filter(([name, state]) => state === 'mandatory' && !existingBranchNames.includes(name))
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

  return { loadCandidates, loadPipelineCandidates, loadMandatoryFallback };
}
