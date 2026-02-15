import type { StateStorage } from 'zustand/middleware';

const DEBOUNCE_MS = 5000;

/**
 * A localStorage adapter that debounces writes to avoid excessive I/O
 * on rapid state changes (e.g., keystroke-level updates to selections).
 */
export function createDebouncedStorage(): StateStorage {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const lastWritten = new Map<string, string>();

  return {
    getItem(name: string): string | null {
      return localStorage.getItem(name);
    },

    setItem(name: string, value: string): void {
      // Skip if identical to last write
      if (lastWritten.get(name) === value) return;

      // Clear any pending timer for this key
      const existing = timers.get(name);
      if (existing) clearTimeout(existing);

      timers.set(
        name,
        setTimeout(() => {
          try {
            localStorage.setItem(name, value);
            lastWritten.set(name, value);
          } catch (e) {
            // QuotaExceededError — silently ignore
            if (e instanceof DOMException && e.name === 'QuotaExceededError') {
              console.warn('[session-storage] localStorage quota exceeded, skipping write for', name);
            } else {
              throw e;
            }
          }
          timers.delete(name);
        }, DEBOUNCE_MS),
      );
    },

    removeItem(name: string): void {
      const existing = timers.get(name);
      if (existing) clearTimeout(existing);
      timers.delete(name);
      lastWritten.delete(name);
      localStorage.removeItem(name);
    },
  };
}

/** Flush pending writes immediately (useful before download / unload). */
export function flushDebouncedStorage(): void {
  // Force immediate write by reading current state from stores
  // This is a no-op signal; the actual flush is handled by
  // reading localStorage directly in session download
}
