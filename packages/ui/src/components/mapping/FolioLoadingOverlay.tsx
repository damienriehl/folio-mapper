import type { FolioStatus } from '@folio-mapper/core';

interface FolioLoadingOverlayProps {
  status: FolioStatus;
  isLoadingCandidates: boolean;
}

export function FolioLoadingOverlay({ status, isLoadingCandidates }: FolioLoadingOverlayProps) {
  if (status.loaded && !isLoadingCandidates) return null;

  const message = status.error
    ? `Error loading FOLIO: ${status.error}`
    : !status.loaded
      ? 'Loading FOLIO ontology...'
      : 'Searching for candidates...';

  const subMessage = !status.loaded
    ? 'This may take a few seconds on first load'
    : 'Analyzing your input against ~18,000 legal concepts';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80">
      <div className="text-center">
        {!status.error && (
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
        )}
        <p className="text-sm font-medium text-gray-900">{message}</p>
        <p className="mt-1 text-xs text-gray-500">{subMessage}</p>
        {status.loaded && status.concept_count > 0 && (
          <p className="mt-1 text-xs text-gray-400">
            {status.concept_count.toLocaleString()} concepts loaded
          </p>
        )}
      </div>
    </div>
  );
}
