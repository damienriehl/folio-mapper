import { useState, useCallback, useEffect } from 'react';
import type { ConnectionStatus, LLMProviderConfig, LLMProviderType, LlamafileStatus as LlamafileStatusType, ModelInfo, ModelStatus } from '@folio-mapper/core';
import { CLOUD_PROVIDERS, LOCAL_PROVIDERS, PROVIDER_META } from '@folio-mapper/core';
import { ProviderCard } from './ProviderCard';
import { LlamafileStatus } from './LlamafileStatus';
import { LlamafileModelPicker } from './LlamafileModelPicker';

interface LLMSettingsProps {
  activeProvider: LLMProviderType;
  configs: Record<LLMProviderType, LLMProviderConfig>;
  modelsByProvider: Record<string, ModelInfo[]>;
  onSetActiveProvider: (provider: LLMProviderType) => void;
  onUpdateConfig: (provider: LLMProviderType, updates: Partial<LLMProviderConfig>) => void;
  onSetConnectionStatus: (provider: LLMProviderType, status: ConnectionStatus) => void;
  onModelsLoaded: (provider: string, models: ModelInfo[]) => void;
  llamafileStatus?: LlamafileStatusType | null;
  llamafileModels?: ModelStatus[];
  onDownloadModel?: (modelId: string) => void;
  onDeleteModel?: (modelId: string) => void;
  onSetActiveModel?: (modelId: string) => void;
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
  modelsByProvider,
  onSetActiveProvider,
  onUpdateConfig,
  onSetConnectionStatus,
  llamafileStatus,
  llamafileModels,
  onDownloadModel,
  onDeleteModel,
  onSetActiveModel,
  onModelsLoaded,
  onClose,
  testConnection,
  fetchModels,
}: LLMSettingsProps) {
  const [testingProvider, setTestingProvider] = useState<LLMProviderType | null>(null);
  const [loadingModelsFor, setLoadingModelsFor] = useState<Set<LLMProviderType>>(new Set());
  const [prices, setPrices] = useState<Record<string, number>>({});

  useEffect(() => {
    fetch('/api/llm/pricing')
      .then((r) => r.json())
      .then((data) => {
        if (data.prices) setPrices(data.prices);
      })
      .catch(() => {});
  }, []);

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

  const renderProviderSection = (title: string, providers: LLMProviderType[]) => (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-gray-700">{title}</h3>
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
              prices={prices}
            />
            {type === 'llamafile' && (
              <>
                <LlamafileStatus status={llamafileStatus ?? null} />
                {llamafileModels && llamafileModels.length > 0 && onDownloadModel && onDeleteModel && onSetActiveModel && (
                  <LlamafileModelPicker
                    models={llamafileModels}
                    onDownload={onDownloadModel}
                    onDelete={onDeleteModel}
                    onSetActive={onSetActiveModel}
                  />
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">LLM Provider Settings</h2>
          <button
            onClick={onClose}
            className="text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            Save &amp; Close
          </button>
        </div>

        {/* Body */}
        <div className="space-y-6 px-6 py-4">
          {renderProviderSection('Cloud Providers', CLOUD_PROVIDERS)}
          {renderProviderSection('Local Models', LOCAL_PROVIDERS)}
        </div>
      </div>
    </div>
  );
}
