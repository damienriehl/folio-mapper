import { useCallback, useRef } from 'react';
import {
  fetchCandidates,
  fetchMandatoryFallback,
  fetchPipelineCandidates,
} from '@folio-mapper/core';
import type {
  BranchState,
  LLMProviderType,
  ParseItem,
  PipelineRequestConfig,
} from '@folio-mapper/core';
import { useMappingStore } from '../store/mapping-store';
import { useLLMStore } from '../store/llm-store';

const BATCH_SIZE = 10;

/**
 * Hook to trigger candidate fetching and initialize mapping state.
 * Loads the first item immediately, then remaining items in background batches.
 */
export function useMapping() {
  const {
    startMapping,
    appendMappingItems,
    setBatchLoading,
    setPipelineMetadata,
    setLoadingCandidates,
    setError,
    mergeFallbackResults,
    mergeSearchResults,
  } = useMappingStore();

  const abortRef = useRef<AbortController | null>(null);

  const cancelBatchLoading = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setBatchLoading(false);
  }, [setBatchLoading]);

  const loadCandidates = useCallback(
    async (items: ParseItem[]) => {
      // Cancel any in-flight batches from a previous run
      cancelBatchLoading();

      setLoadingCandidates(true);
      setError(null);

      try {
        // Batch 1: first item only — show mapping screen immediately
        const firstBatch = items.slice(0, 1);
        const response = await fetchCandidates(firstBatch, 0, 10);
        startMapping(response, items.length);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load candidates');
        setLoadingCandidates(false);
        return;
      }

      // Remaining items in background batches
      if (items.length <= 1) {
        setBatchLoading(false);
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      const remaining = items.slice(1);

      for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
        if (controller.signal.aborted) break;

        const batch = remaining.slice(i, i + BATCH_SIZE);
        try {
          const response = await fetchCandidates(batch, 0, 10);
          if (controller.signal.aborted) break;
          appendMappingItems(response.items);
        } catch (err) {
          if (controller.signal.aborted) break;
          // Non-fatal: log and continue with next batch
          console.warn('Batch loading error:', err);
          setBatchLoading(true, err instanceof Error ? err.message : 'Batch loading error');
        }
      }

      if (!controller.signal.aborted) {
        setBatchLoading(false);
      }
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    },
    [startMapping, appendMappingItems, setBatchLoading, setLoadingCandidates, setError, cancelBatchLoading],
  );

  const loadPipelineCandidates = useCallback(
    async (items: ParseItem[], llmConfig: PipelineRequestConfig) => {
      // Cancel any in-flight batches from a previous run
      cancelBatchLoading();

      setLoadingCandidates(true);
      setError(null);

      try {
        // Batch 1: first item only — show mapping screen immediately
        const firstBatch = items.slice(0, 1);
        const response = await fetchPipelineCandidates(firstBatch, llmConfig, 0, 10);
        startMapping(response.mapping, items.length);
        setPipelineMetadata(response.pipeline_metadata);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Pipeline mapping failed');
        setLoadingCandidates(false);
        // Mark provider as invalid so the header badge reflects disconnection
        useLLMStore.getState().setConnectionStatus(llmConfig.provider as LLMProviderType, 'invalid');
        return;
      }

      // Remaining items in background batches
      if (items.length <= 1) {
        setBatchLoading(false);
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      const remaining = items.slice(1);

      for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
        if (controller.signal.aborted) break;

        const batch = remaining.slice(i, i + BATCH_SIZE);
        try {
          const response = await fetchPipelineCandidates(batch, llmConfig, 0, 10);
          if (controller.signal.aborted) break;
          appendMappingItems(response.mapping.items, response.pipeline_metadata);
        } catch (err) {
          if (controller.signal.aborted) break;
          // Non-fatal: log and continue with next batch
          console.warn('Pipeline batch loading error:', err);
          setBatchLoading(true, err instanceof Error ? err.message : 'Batch loading error');
        }
      }

      if (!controller.signal.aborted) {
        setBatchLoading(false);
      }
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    },
    [startMapping, appendMappingItems, setBatchLoading, setPipelineMetadata, setLoadingCandidates, setError, cancelBatchLoading],
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

  return { loadCandidates, loadPipelineCandidates, loadMandatoryFallback, searchCandidates, cancelBatchLoading };
}
