import { useState, useEffect, useRef } from 'react';
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

const POLL_INTERVAL_MS = 1000;

/**
 * Polls the Electron main process for llamafile status.
 * When llamafile becomes ready, auto-configures it in the LLM store.
 */
export function useLlamafile(): LlamafileStatus | null {
  const [status, setStatus] = useState<LlamafileStatus | null>(null);
  const hasAutoConfigured = useRef(false);
  const hasAutoSelected = useRef(false);
  const setActiveProvider = useLLMStore((s) => s.setActiveProvider);
  const updateConfig = useLLMStore((s) => s.updateConfig);
  const setConnectionStatus = useLLMStore((s) => s.setConnectionStatus);

  useEffect(() => {
    const api = window.desktop?.llamafile;
    if (!api) return;

    // Auto-select llamafile as active provider in desktop mode (once)
    if (!hasAutoSelected.current) {
      hasAutoSelected.current = true;
      const { activeProvider, configs } = useLLMStore.getState();
      const activeConfig = configs[activeProvider];
      if (activeConfig.connectionStatus !== 'valid') {
        setActiveProvider('llamafile');
      }
      // Reset stale connection status from previous session
      if (configs.llamafile.connectionStatus === 'invalid') {
        setConnectionStatus('llamafile', 'untested');
      }
    }

    let mounted = true;
    let timer: ReturnType<typeof setInterval>;

    const poll = async () => {
      if (!mounted) return;

      try {
        const newStatus = await api.getStatus();
        setStatus(newStatus);

        // Auto-configure when llamafile becomes ready (once)
        if (newStatus.state === 'ready' && !hasAutoConfigured.current) {
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
                setActiveProvider('llamafile');

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
        if (newStatus.state !== 'ready') {
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

  return status;
}
