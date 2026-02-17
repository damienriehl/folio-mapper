import { useEffect, useRef } from 'react';
import type { LlamafileStatus } from '@folio-mapper/core';
import { testConnection } from '@folio-mapper/core';
import { useLLMStore } from '../store/llm-store';

declare global {
  interface Window {
    desktop?: {
      isDesktop: boolean;
      llamafile?: {
        getStatus: () => Promise<LlamafileStatus>;
        getPort: () => Promise<number | null>;
      };
    };
  }
}

const POLL_INTERVAL_MS = 2000;

/**
 * Polls the Electron main process for llamafile status.
 * When llamafile becomes ready, auto-configures it in the LLM store.
 */
export function useLlamafile(): LlamafileStatus | null {
  const statusRef = useRef<LlamafileStatus | null>(null);
  const hasAutoConfigured = useRef(false);
  const setActiveProvider = useLLMStore((s) => s.setActiveProvider);
  const updateConfig = useLLMStore((s) => s.updateConfig);
  const setConnectionStatus = useLLMStore((s) => s.setConnectionStatus);

  useEffect(() => {
    const api = window.desktop?.llamafile;
    if (!api) return;

    let mounted = true;
    let timer: ReturnType<typeof setInterval>;

    const poll = async () => {
      if (!mounted) return;

      try {
        const status = await api.getStatus();
        statusRef.current = status;

        // Auto-configure when llamafile becomes ready (once)
        if (status.state === 'ready' && !hasAutoConfigured.current) {
          hasAutoConfigured.current = true;

          const port = await api.getPort();
          if (port) {
            const baseUrl = `http://127.0.0.1:${port}/v1`;
            updateConfig('llamafile', { baseUrl });

            // Test connection
            try {
              const result = await testConnection('llamafile', undefined, baseUrl);
              if (result.success) {
                setConnectionStatus('llamafile', 'valid');

                // Auto-activate if no other provider is configured and valid
                const configs = useLLMStore.getState().configs;
                const activeProvider = useLLMStore.getState().activeProvider;
                const activeConfig = configs[activeProvider];
                if (activeConfig.connectionStatus !== 'valid') {
                  setActiveProvider('llamafile');
                }

                // If model name was returned, set it
                if (result.model) {
                  updateConfig('llamafile', { model: result.model });
                }
              }
            } catch {
              // Connection test failed — user can still manually configure
            }
          }
        }

        // Reset auto-configure flag if llamafile stops being ready
        if (status.state !== 'ready') {
          hasAutoConfigured.current = false;
        }
      } catch {
        // IPC call failed — likely window closing
      }
    };

    // Initial poll
    poll();
    timer = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [setActiveProvider, updateConfig, setConnectionStatus]);

  return statusRef.current;
}
