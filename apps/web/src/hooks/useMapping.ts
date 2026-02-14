import { useCallback } from 'react';
import { fetchCandidates } from '@folio-mapper/core';
import type { ParseItem } from '@folio-mapper/core';
import { useMappingStore } from '../store/mapping-store';

/**
 * Hook to trigger candidate fetching and initialize mapping state.
 */
export function useMapping() {
  const { threshold, startMapping, setLoadingCandidates, setError } = useMappingStore();

  const loadCandidates = useCallback(
    async (items: ParseItem[]) => {
      setLoadingCandidates(true);
      setError(null);

      try {
        const response = await fetchCandidates(items, 0.3, 10);
        startMapping(response, threshold);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load candidates');
      }
    },
    [threshold, startMapping, setLoadingCandidates, setError],
  );

  return { loadCandidates };
}
