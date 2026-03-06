import { useEffect, useRef } from 'react';
import { fetchFolioStatus, warmupFolio } from '@folio-mapper/core';
import { useMappingStore } from '../store/mapping-store';

/**
 * Fires warmupFolio() on mount (for the confirmation screen),
 * then polls status every 2s until the store shows loaded.
 */
export function useFolioWarmup() {
  const setFolioStatus = useMappingStore((s) => s.setFolioStatus);
  const folioStatus = useMappingStore((s) => s.folioStatus);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Fire warmup on mount
    warmupFolio()
      .then(setFolioStatus)
      .catch(() => {});

    // Poll status every 2s until the *store* shows loaded
    // (don't stop based on API response alone — persist rehydration
    // can overwrite the store back to loaded:false after we set it)
    pollRef.current = setInterval(async () => {
      try {
        const status = await fetchFolioStatus();
        setFolioStatus(status);
        if (status.loaded && useMappingStore.getState().folioStatus.loaded && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch {
        // Ignore polling errors
      }
    }, 2000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [setFolioStatus]);

  return folioStatus;
}
