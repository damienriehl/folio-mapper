import type { ModelStatus } from '@folio-mapper/core';

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

interface LlamafileModelPickerProps {
  models: ModelStatus[];
  onDownload: (modelId: string) => void;
  onDelete: (modelId: string) => void;
  onSetActive: (modelId: string) => void;
}

export function LlamafileModelPicker({
  models,
  onDownload,
  onDelete,
  onSetActive,
}: LlamafileModelPickerProps) {
  if (models.length === 0) return null;

  const installedCount = models.filter((m) => m.downloaded).length;

  return (
    <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-medium text-gray-700">Available Models</h4>
        <span className="text-xs text-gray-500">{installedCount} installed</span>
      </div>

      <div className="space-y-2">
        {models.map((model) => (
          <ModelCard
            key={model.id}
            model={model}
            onDownload={onDownload}
            onDelete={onDelete}
            onSetActive={onSetActive}
          />
        ))}
      </div>
    </div>
  );
}

function ModelCard({
  model,
  onDownload,
  onDelete,
  onSetActive,
}: {
  model: ModelStatus;
  onDownload: (id: string) => void;
  onDelete: (id: string) => void;
  onSetActive: (id: string) => void;
}) {
  const isDownloading = model.downloadState === 'downloading';
  const pct = model.downloadProgress
    ? Math.round((model.downloadProgress.bytesDownloaded / model.downloadProgress.bytesTotal) * 100)
    : null;

  return (
    <div
      className={`rounded-lg border bg-white p-3 ${
        model.active ? 'border-blue-300 ring-1 ring-blue-100' : 'border-gray-200'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {model.active && (
              <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
            )}
            <span className="text-sm font-medium text-gray-900">{model.name}</span>
            {model.recommended && (
              <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                Recommended
              </span>
            )}
            {model.active && (
              <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
                Active
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-gray-500">{model.description}</p>
          <p className="mt-0.5 text-xs text-gray-400">{formatSize(model.sizeBytes)}</p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {model.downloaded && !model.active && (
            <>
              <button
                onClick={() => onSetActive(model.id)}
                className="rounded bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
              >
                Use
              </button>
              <button
                onClick={() => onDelete(model.id)}
                className="rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-100"
                aria-label={`Delete ${model.name}`}
              >
                Delete
              </button>
            </>
          )}
          {!model.downloaded && !isDownloading && (
            <button
              onClick={() => onDownload(model.id)}
              className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
            >
              Download
            </button>
          )}
          {isDownloading && pct !== null && (
            <span className="text-xs text-blue-600">{pct}%</span>
          )}
        </div>
      </div>

      {isDownloading && (
        <div className="mt-2">
          <div className="h-1.5 overflow-hidden rounded-full bg-blue-100">
            <div
              className="h-full rounded-full bg-blue-500 transition-all"
              style={{ width: `${pct ?? 0}%` }}
            />
          </div>
          {model.downloadProgress && (
            <p className="mt-1 text-[10px] text-gray-400">
              {formatSize(model.downloadProgress.bytesDownloaded)} / {formatSize(model.downloadProgress.bytesTotal)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
