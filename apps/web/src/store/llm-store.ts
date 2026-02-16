import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ConnectionStatus, LLMProviderConfig, LLMProviderType, ModelInfo } from '@folio-mapper/core';
import { PROVIDER_META } from '@folio-mapper/core';

interface LLMState {
  activeProvider: LLMProviderType;
  configs: Record<LLMProviderType, LLMProviderConfig>;
  modelsByProvider: Record<string, ModelInfo[]>;

  setActiveProvider: (provider: LLMProviderType) => void;
  updateConfig: (provider: LLMProviderType, updates: Partial<LLMProviderConfig>) => void;
  setConnectionStatus: (provider: LLMProviderType, status: ConnectionStatus) => void;
  setModelsForProvider: (provider: string, models: ModelInfo[]) => void;
  setAllModels: (models: Record<string, ModelInfo[]>) => void;
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
      modelsByProvider: {},

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

      setModelsForProvider: (provider, models) =>
        set((state) => ({
          modelsByProvider: { ...state.modelsByProvider, [provider]: models },
        })),

      setAllModels: (models) =>
        set({ modelsByProvider: models }),
    }),
    {
      name: 'folio-mapper-llm',
      merge: (persisted, current) => {
        const p = persisted as Partial<LLMState> | undefined;
        return {
          ...current,
          ...p,
          // Deep-merge configs so new providers get defaults
          configs: { ...current.configs, ...(p?.configs ?? {}) },
          // Keep persisted models but let current (empty) be overridden
          modelsByProvider: { ...(p?.modelsByProvider ?? {}) },
        };
      },
    },
  ),
);
