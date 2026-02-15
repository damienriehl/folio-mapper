import type { FolioStatus } from '@folio-mapper/core';

const PIPELINE_STAGES = ['Pre-scan', 'Search', 'Ranking', 'Validation'];

interface FolioLoadingOverlayProps {
  status: FolioStatus;
  isLoadingCandidates: boolean;
  isPipeline?: boolean;
  pipelineItemCount?: number;
}

export function FolioLoadingOverlay({
  status,
  isLoadingCandidates,
  isPipeline,
  pipelineItemCount,
}: FolioLoadingOverlayProps) {
  if (status.loaded && !isLoadingCandidates) return null;

  const isPipelineLoading = isPipeline && isLoadingCandidates && status.loaded;

  const message = status.error
    ? `Error loading FOLIO: ${status.error}`
    : !status.loaded
      ? 'Loading FOLIO ontology...'
      : isPipelineLoading
        ? `Processing ${pipelineItemCount ?? 0} item${(pipelineItemCount ?? 0) !== 1 ? 's' : ''} with LLM pipeline...`
        : 'Searching for candidates...';

  const subMessage = !status.loaded
    ? 'This may take a few seconds on first load'
    : isPipelineLoading
      ? 'Each item goes through pre-scan, search, ranking, and validation'
      : 'Analyzing your input against ~18,000 legal concepts';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80">
      <div className="text-center">
        {!status.error && (
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
        )}
        <p className="text-sm font-medium text-gray-900">{message}</p>
        <p className="mt-1 text-xs text-gray-500">{subMessage}</p>
        {isPipelineLoading && (
          <div className="mt-3 flex justify-center gap-2">
            {PIPELINE_STAGES.map((stage) => (
              <span
                key={stage}
                className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700"
              >
                {stage}
              </span>
            ))}
          </div>
        )}
        {status.loaded && status.concept_count > 0 && !isPipelineLoading && (
          <p className="mt-1 text-xs text-gray-400">
            {status.concept_count.toLocaleString()} concepts loaded
          </p>
        )}
      </div>
    </div>
  );
}
