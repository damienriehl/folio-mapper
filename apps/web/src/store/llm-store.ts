import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ConnectionStatus, LLMProviderConfig, LLMProviderType } from '@folio-mapper/core';
import { PROVIDER_META } from '@folio-mapper/core';

interface LLMState {
  activeProvider: LLMProviderType;
  configs: Record<LLMProviderType, LLMProviderConfig>;

  setActiveProvider: (provider: LLMProviderType) => void;
  updateConfig: (provider: LLMProviderType, updates: Partial<LLMProviderConfig>) => void;
  setConnectionStatus: (provider: LLMProviderType, status: ConnectionStatus) => void;
}

function makeDefaultConfigs(): Record<LLMProviderType, LLMProviderConfig> {
  const configs = {} as Record<LLMProviderType, LLMProviderConfig>;
  for (const [key, meta] of Object.entries(PROVIDER_META)) {
    configs[key as LLMProviderType] = {
      apiKey: '',
      baseUrl: meta.defaultBaseUrl,
      model: meta.defaultModel,
      connectionStatus: 'untested',
    };
  }
  return configs;
}

export const useLLMStore = create<LLMState>()(
  persist(
    (set) => ({
      activeProvider: 'anthropic',
      configs: makeDefaultConfigs(),

      setActiveProvider: (provider) => set({ activeProvider: provider }),

      updateConfig: (provider, updates) =>
        set((state) => ({
          configs: {
            ...state.configs,
            [provider]: { ...state.configs[provider], ...updates },
          },
        })),

      setConnectionStatus: (provider, status) =>
        set((state) => ({
          configs: {
            ...state.configs,
            [provider]: { ...state.configs[provider], connectionStatus: status },
          },
        })),
    }),
    {
      name: 'folio-mapper-llm',
    },
  ),
);
