import { Suspense, lazy, useCallback, useEffect } from 'react';

const EntityGraph = lazy(() =>
  import('./graph/EntityGraph').then((m) => ({ default: m.EntityGraph })),
);

interface EntityGraphModalProps {
  iriHash: string;
  label: string;
  onNavigateToConcept: (iriHash: string) => void;
  onClose: () => void;
}

export function EntityGraphModal({
  iriHash,
  label,
  onNavigateToConcept,
  onClose,
}: EntityGraphModalProps) {
  // Escape key closes modal
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleNavigate = useCallback(
    (nodeIriHash: string) => {
      onNavigateToConcept(nodeIriHash);
      onClose();
    },
    [onNavigateToConcept, onClose],
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
      <div className="flex h-[97vh] w-[98vw] flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-100 px-4 py-2.5">
          <div className="flex items-center gap-3">
            <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="6" cy="6" r="2.5" />
              <circle cx="18" cy="6" r="2.5" />
              <circle cx="12" cy="18" r="2.5" />
              <line x1="8" y1="7" x2="11" y2="16" strokeLinecap="round" />
              <line x1="16" y1="7" x2="13" y2="16" strokeLinecap="round" />
            </svg>
            <h2 className="text-lg font-bold text-gray-900">
              <span className="text-gray-400 font-medium">Entity Graph</span>
              <span className="mx-2 text-gray-300">|</span>
              <span className="text-blue-700">{label}</span>
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 hover:text-gray-900 active:bg-gray-100"
          >
            Close
            <kbd className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono text-gray-500">
              Esc
            </kbd>
          </button>
        </div>

        {/* Body: lazy-loaded graph */}
        <div className="flex-1 overflow-hidden">
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
                  <span className="text-sm text-gray-500">Loading graph viewer...</span>
                </div>
              </div>
            }
          >
            <EntityGraph
              iriHash={iriHash}
              label={label}
              onNavigateToConcept={handleNavigate}
            />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
