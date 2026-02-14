import { useState, useCallback, useEffect } from 'react';
import type { ConnectionStatus, LLMProviderConfig, LLMProviderType, ModelInfo } from '@folio-mapper/core';
import { CLOUD_PROVIDERS, LOCAL_PROVIDERS, PROVIDER_META } from '@folio-mapper/core';
import { ProviderCard } from './ProviderCard';

interface LLMSettingsProps {
  activeProvider: LLMProviderType;
  configs: Record<LLMProviderType, LLMProviderConfig>;
  onSetActiveProvider: (provider: LLMProviderType) => void;
  onUpdateConfig: (provider: LLMProviderType, updates: Partial<LLMProviderConfig>) => void;
  onSetConnectionStatus: (provider: LLMProviderType, status: ConnectionStatus) => void;
  onClose: () => void;
  testConnection: (
    provider: LLMProviderType,
    apiKey?: string,
    baseUrl?: string,
    model?: string,
  ) => Promise<{ success: boolean; message: string }>;
  fetchModels: (
    provider: LLMProviderType,
    apiKey?: string,
    baseUrl?: string,
  ) => Promise<ModelInfo[]>;
}

export function LLMSettings({
  activeProvider,
  configs,
  onSetActiveProvider,
  onUpdateConfig,
  onSetConnectionStatus,
  onClose,
  testConnection,
  fetchModels,
}: LLMSettingsProps) {
  const [testingProvider, setTestingProvider] = useState<LLMProviderType | null>(null);
  const [loadingModelsFor, setLoadingModelsFor] = useState<LLMProviderType | null>(null);
  const [modelsByProvider, setModelsByProvider] = useState<Record<string, ModelInfo[]>>({});

  const handleTest = useCallback(
    async (provider: LLMProviderType) => {
      const config = configs[provider];
      setTestingProvider(provider);
      try {
        const result = await testConnection(
          provider,
          config.apiKey || undefined,
          config.baseUrl || undefined,
          config.model || undefined,
        );
        onSetConnectionStatus(provider, result.success ? 'valid' : 'invalid');
      } catch {
        onSetConnectionStatus(provider, 'invalid');
      } finally {
        setTestingProvider(null);
      }
    },
    [configs, testConnection, onSetConnectionStatus],
  );

  const handleRefreshModels = useCallback(
    async (provider: LLMProviderType) => {
      const config = configs[provider];
      setLoadingModelsFor(provider);
      try {
        const models = await fetchModels(
          provider,
          config.apiKey || undefined,
          config.baseUrl || undefined,
        );
        setModelsByProvider((prev) => ({ ...prev, [provider]: models }));
      } catch {
        // Keep existing models on error
      } finally {
        setLoadingModelsFor(null);
      }
    },
    [configs, fetchModels],
  );

  // Auto-fetch models for active provider on open
  useEffect(() => {
    const config = configs[activeProvider];
    const meta = PROVIDER_META[activeProvider];
    if (!meta.requiresApiKey || config.apiKey) {
      handleRefreshModels(activeProvider);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const renderProviderSection = (title: string, providers: LLMProviderType[]) => (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-gray-700">{title}</h3>
      <div className="space-y-2">
        {providers.map((type) => (
          <ProviderCard
            key={type}
            meta={PROVIDER_META[type]}
            config={configs[type]}
            isActive={activeProvider === type}
            models={modelsByProvider[type] || []}
            isLoadingModels={loadingModelsFor === type}
            isTesting={testingProvider === type}
            onSelect={onSetActiveProvider}
            onUpdateConfig={onUpdateConfig}
            onTest={handleTest}
            onRefreshModels={handleRefreshModels}
          />
        ))}
      </div>
    </div>
  );

  // Simple cost estimation based on active provider
  const costEstimate = (() => {
    switch (activeProvider) {
      case 'anthropic':
        return '~$0.003';
      case 'openai':
        return '~$0.002';
      case 'google':
        return '~$0.001';
      case 'ollama':
      case 'lmstudio':
      case 'custom':
        return 'Free (local)';
      default:
        return '~$0.002';
    }
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">LLM Provider Settings</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="space-y-6 px-6 py-4">
          {renderProviderSection('Cloud Providers', CLOUD_PROVIDERS)}
          {renderProviderSection('Local Models', LOCAL_PROVIDERS)}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4">
          <span className="text-sm text-gray-500">
            Estimated cost: {costEstimate} per input node
          </span>
          <button
            onClick={onClose}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Save &amp; Close
          </button>
        </div>
      </div>
    </div>
  );
}
