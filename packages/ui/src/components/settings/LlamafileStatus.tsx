import type { LlamafileStatus as LlamafileStatusType } from '@folio-mapper/core';

interface LlamafileStatusProps {
  status: LlamafileStatusType | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function LlamafileStatus({ status }: LlamafileStatusProps) {
  if (!status) return null;

  const { state, progress, runtimeVersion, modelName, error } = status;

  if (state === 'idle') return null;

  if (state === 'downloading-runtime' || state === 'downloading-model') {
    const label = state === 'downloading-runtime' ? 'Downloading runtime' : 'Downloading model';
    const pct = progress && progress.bytesTotal > 0
      ? Math.round((progress.bytesDownloaded / progress.bytesTotal) * 100)
      : null;

    return (
      <div className="mt-2 rounded bg-blue-50 px-3 py-2 text-sm">
        <div className="flex items-center gap-2 text-blue-700">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>
            {label}...
            {pct !== null && progress && (
              <> {pct}% ({formatBytes(progress.bytesDownloaded)} / {formatBytes(progress.bytesTotal)})</>
            )}
          </span>
        </div>
        {pct !== null && (
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-blue-200">
            <div
              className="h-full rounded-full bg-blue-600 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>
    );
  }

  if (state === 'starting') {
    return (
      <div className="mt-2 flex items-center gap-2 rounded bg-yellow-50 px-3 py-2 text-sm text-yellow-700">
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span>Starting local LLM...</span>
      </div>
    );
  }

  if (state === 'ready') {
    return (
      <div className="mt-2 flex items-center gap-2 rounded bg-green-50 px-3 py-2 text-sm text-green-700">
        <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
        <span>
          Running
          {modelName && <> &middot; {modelName}</>}
          {runtimeVersion && <> &middot; v{runtimeVersion}</>}
        </span>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
        {error || 'Failed to start llamafile'}
      </div>
    );
  }

  return null;
}
