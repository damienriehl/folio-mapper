import { useState, useCallback } from 'react';
import type { ConnectionStatus, LLMProviderConfig, LLMProviderType, LlamafileStatus as LlamafileStatusType, ModelInfo } from '@folio-mapper/core';
import { CLOUD_PROVIDERS, LOCAL_PROVIDERS, PROVIDER_META } from '@folio-mapper/core';
import { ProviderCard } from '../settings/ProviderCard';
import { LlamafileStatus } from '../settings/LlamafileStatus';

type Tab = 'local' | 'online' | 'none';

interface ModelChooserProps {
  activeProvider: LLMProviderType;
  configs: Record<LLMProviderType, LLMProviderConfig>;
  modelsByProvider: Record<string, ModelInfo[]>;
  llamafileStatus?: LlamafileStatusType | null;
  onSetActiveProvider: (provider: LLMProviderType) => void;
  onUpdateConfig: (provider: LLMProviderType, updates: Partial<LLMProviderConfig>) => void;
  onSetConnectionStatus: (provider: LLMProviderType, status: ConnectionStatus) => void;
  onModelsLoaded: (provider: string, models: ModelInfo[]) => void;
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

export function ModelChooser({
  activeProvider,
  configs,
  modelsByProvider,
  llamafileStatus,
  onSetActiveProvider,
  onUpdateConfig,
  onSetConnectionStatus,
  onModelsLoaded,
  testConnection,
  fetchModels,
}: ModelChooserProps) {
  // Determine initial tab from active provider
  const isLocalProvider = LOCAL_PROVIDERS.includes(activeProvider);
  const activeConfig = configs[activeProvider];
  const hasValidConnection = activeConfig?.connectionStatus === 'valid';
  const initialTab: Tab = hasValidConnection
    ? isLocalProvider ? 'local' : 'online'
    : llamafileStatus ? 'local' : 'none';

  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [testingProvider, setTestingProvider] = useState<LLMProviderType | null>(null);
  const [loadingModelsFor, setLoadingModelsFor] = useState<Set<LLMProviderType>>(new Set());

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
      setLoadingModelsFor((prev) => new Set(prev).add(provider));
      try {
        const models = await fetchModels(
          provider,
          config.apiKey || undefined,
          config.baseUrl || undefined,
        );
        onModelsLoaded(provider, models);
      } catch {
        // Keep existing models on error
      } finally {
        setLoadingModelsFor((prev) => {
          const next = new Set(prev);
          next.delete(provider);
          return next;
        });
      }
    },
    [configs, fetchModels, onModelsLoaded],
  );

  const tabs: { key: Tab; label: string }[] = [
    { key: 'online', label: 'Online' },
    { key: 'local', label: 'Local' },
    { key: 'none', label: 'No LLM' },
  ];

  const providers = activeTab === 'local' ? LOCAL_PROVIDERS : CLOUD_PROVIDERS;

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      {/* Tab bar */}
      <div className="flex border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-4">
        {activeTab === 'none' ? (
          <div className="space-y-3 text-sm text-gray-600">
            <p className="font-medium text-gray-900">Local fuzzy matching only</p>
            <p>
              FOLIO Mapper works without an LLM using local fuzzy text matching against
              the FOLIO ontology. Results may be less accurate without LLM-powered ranking
              and validation, but no API key or external service is required.
            </p>
            <p>
              You can configure an LLM later via the settings icon in the header.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {providers.map((type) => (
              <div key={type}>
                <ProviderCard
                  meta={PROVIDER_META[type]}
                  config={configs[type]}
                  isActive={activeProvider === type}
                  models={modelsByProvider[type] || []}
                  isLoadingModels={loadingModelsFor.has(type)}
                  isTesting={testingProvider === type}
                  onSelect={onSetActiveProvider}
                  onUpdateConfig={onUpdateConfig}
                  onTest={handleTest}
                  onRefreshModels={handleRefreshModels}
                />
                {type === 'llamafile' && <LlamafileStatus status={llamafileStatus ?? null} />}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Security notice — always visible */}
      <div className="border-t border-gray-100 px-4 py-3">
        <p className="text-xs leading-relaxed text-gray-400">
          <span className="font-medium text-gray-500">Security:</span>{' '}
          Your API keys are stored only in your browser&apos;s localStorage and are sent
          directly to your chosen provider&apos;s API. They are never stored on or
          transmitted through our servers. The backend proxies requests solely to avoid
          CORS restrictions — keys pass through in-memory only and are never logged or
          persisted.
        </p>
      </div>
    </div>
  );
}
