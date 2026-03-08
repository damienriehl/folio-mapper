import { useEffect, useRef, useState } from 'react';
import { fetchOWLUpdateStatus } from '@folio-mapper/core';
import type { OWLUpdateStatus } from '@folio-mapper/core';

/**
 * Polls OWL update status every 30s. Returns raw status object.
 */
export function useOWLUpdateStatus() {
  const [status, setStatus] = useState<OWLUpdateStatus | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Fetch immediately on mount
    fetchOWLUpdateStatus()
      .then(setStatus)
      .catch(() => {});

    // Poll every 30s
    pollRef.current = setInterval(async () => {
      try {
        const s = await fetchOWLUpdateStatus();
        setStatus(s);
      } catch {
        // Ignore polling errors
      }
    }, 30000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, []);

  return status;
}
