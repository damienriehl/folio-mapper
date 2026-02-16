import type { ConnectionStatus, LLMProviderConfig, LLMProviderType, ModelInfo, ProviderMeta } from '@folio-mapper/core';

interface ProviderCardProps {
  meta: ProviderMeta;
  config: LLMProviderConfig;
  isActive: boolean;
  models: ModelInfo[];
  isLoadingModels: boolean;
  isTesting: boolean;
  onSelect: (provider: LLMProviderType) => void;
  onUpdateConfig: (provider: LLMProviderType, updates: Partial<LLMProviderConfig>) => void;
  onTest: (provider: LLMProviderType) => void;
  onRefreshModels: (provider: LLMProviderType) => void;
}

function maskKey(key: string): string {
  if (!key || key.length < 8) return key ? '••••••••' : '';
  return key.slice(0, 3) + '••••' + key.slice(-4);
}

function statusIndicator(status: ConnectionStatus) {
  switch (status) {
    case 'valid':
      return <span className="text-green-600 text-sm font-medium">&#10003; Valid</span>;
    case 'invalid':
      return <span className="text-red-600 text-sm font-medium">&#10007; Invalid</span>;
    default:
      return null;
  }
}

export function ProviderCard({
  meta,
  config,
  isActive,
  models,
  isLoadingModels,
  isTesting,
  onSelect,
  onUpdateConfig,
  onTest,
  onRefreshModels,
}: ProviderCardProps) {
  const showKeyInput = meta.requiresApiKey;
  const showUrlInput = meta.isLocal || meta.type === 'custom';

  return (
    <div
      className={`rounded-lg border p-3 transition-colors ${
        isActive ? 'border-blue-300 bg-blue-50/50' : 'border-gray-200 bg-white'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Radio button */}
        <label className="mt-0.5 flex cursor-pointer items-center">
          <input
            type="radio"
            name="llm-provider"
            checked={isActive}
            onChange={() => onSelect(meta.type)}
            className="h-4 w-4 text-blue-600"
          />
        </label>

        <div className="min-w-0 flex-1">
          {/* Provider name + test button + status */}
          <div className="flex items-center gap-3">
            <span className="font-medium text-gray-900">{meta.displayName}</span>
            <button
              onClick={() => onTest(meta.type)}
              disabled={isTesting || (meta.requiresApiKey && !config.apiKey)}
              className="rounded bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isTesting ? 'Testing...' : 'Test'}
            </button>
            {statusIndicator(config.connectionStatus)}
          </div>

          {/* API key input */}
          {showKeyInput && (
            <div className="mt-2 flex items-center gap-2">
              <label className="w-10 shrink-0 text-xs text-gray-500">Key:</label>
              <input
                type="password"
                value={config.apiKey || ''}
                onChange={(e) =>
                  onUpdateConfig(meta.type, {
                    apiKey: e.target.value,
                    connectionStatus: 'untested',
                  })
                }
                placeholder={`Enter ${meta.displayName} API key`}
                className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-400 focus:outline-none"
              />
              {config.apiKey && (
                <span className="shrink-0 text-xs text-gray-400">{maskKey(config.apiKey)}</span>
              )}
            </div>
          )}

          {/* Base URL input (local / custom) */}
          {showUrlInput && (
            <div className="mt-2 flex items-center gap-2">
              <label className="w-10 shrink-0 text-xs text-gray-500">URL:</label>
              <input
                type="text"
                value={config.baseUrl || ''}
                onChange={(e) =>
                  onUpdateConfig(meta.type, {
                    baseUrl: e.target.value,
                    connectionStatus: 'untested',
                  })
                }
                placeholder={meta.defaultBaseUrl}
                className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-400 focus:outline-none"
              />
            </div>
          )}

          {/* Model dropdown */}
          <div className="mt-2 flex items-center gap-2">
            <label className="w-10 shrink-0 text-xs text-gray-500">Model:</label>
            <select
              value={config.model || ''}
              onChange={(e) => onUpdateConfig(meta.type, { model: e.target.value })}
              className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-400 focus:outline-none"
            >
              {config.model && models.length === 0 && (
                <option value={config.model}>{config.model}</option>
              )}
              {!config.model && <option value="">Select a model...</option>}
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.context_window ? ` (${Math.round(m.context_window / 1000)}K)` : ''}
                </option>
              ))}
            </select>
            <button
              onClick={() => onRefreshModels(meta.type)}
              disabled={isLoadingModels}
              className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
              title="Refresh models"
            >
              {isLoadingModels ? '...' : '↻'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
