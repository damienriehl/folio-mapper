import { useEffect, useRef, useState } from 'react';
import { fetchEmbeddingStatus, warmupEmbedding } from '@folio-mapper/core';
import type { EmbeddingStatus } from '@folio-mapper/core';

/**
 * Fires warmupEmbedding() on mount, then polls status every 3s until available.
 * Returns a simplified status for the header badge.
 */
export function useEmbeddingStatus() {
  const [status, setStatus] = useState<EmbeddingStatus | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Fire warmup on mount
    warmupEmbedding()
      .then(setStatus)
      .catch(() => {});

    // Poll status every 3s until available
    pollRef.current = setInterval(async () => {
      try {
        const s = await fetchEmbeddingStatus();
        setStatus(s);
        if (s.available && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch {
        // Ignore polling errors
      }
    }, 3000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, []);

  return status;
}
