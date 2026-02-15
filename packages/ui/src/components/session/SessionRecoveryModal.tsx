interface SessionRecoveryModalProps {
  created: string;
  totalNodes: number;
  completedCount: number;
  skippedCount: number;
  onResume: () => void;
  onStartFresh: () => void;
  onDownload: () => void;
}

export function SessionRecoveryModal({
  created,
  totalNodes,
  completedCount,
  skippedCount,
  onResume,
  onStartFresh,
  onDownload,
}: SessionRecoveryModalProps) {
  const pct = totalNodes > 0 ? Math.round((completedCount / totalNodes) * 100) : 0;
  const formattedDate = formatDate(created);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Session Recovery</h2>
        <p className="mb-1 text-sm text-gray-600">
          Found saved session from: <span className="font-medium text-gray-800">{formattedDate}</span>
        </p>
        <p className="mb-1 text-sm text-gray-600">
          Progress: <span className="font-medium text-gray-800">{completedCount} of {totalNodes} nodes ({pct}%)</span>
        </p>
        {skippedCount > 0 && (
          <p className="mb-1 text-sm text-gray-600">
            Skipped: <span className="font-medium text-gray-800">{skippedCount}</span>
          </p>
        )}

        <div className="mt-6 flex gap-3">
          <button
            onClick={onResume}
            className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Resume
          </button>
          <button
            onClick={onStartFresh}
            className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Start Fresh
          </button>
          <button
            onClick={() => { onDownload(); onStartFresh(); }}
            className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Download & Start Fresh
          </button>
        </div>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
