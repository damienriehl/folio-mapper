import { useCallback } from 'react';
import { fetchCandidates, fetchPipelineCandidates } from '@folio-mapper/core';
import type { ParseItem, PipelineRequestConfig } from '@folio-mapper/core';
import { useMappingStore } from '../store/mapping-store';

/**
 * Hook to trigger candidate fetching and initialize mapping state.
 */
export function useMapping() {
  const { threshold, startMapping, setPipelineMetadata, setLoadingCandidates, setError } =
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

  return { loadCandidates, loadPipelineCandidates };
}
