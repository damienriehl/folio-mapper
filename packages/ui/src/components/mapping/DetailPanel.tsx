import type { FolioCandidate, ItemMappingResult } from '@folio-mapper/core';
import { IriDisplay } from './IriDisplay';
import { ConfidenceBadge } from './ConfidenceBadge';

interface DetailPanelProps {
  currentItem: ItemMappingResult;
  selectedCandidate: FolioCandidate | null;
}

export function DetailPanel({ currentItem, selectedCandidate }: DetailPanelProps) {
  return (
    <div className="flex h-full flex-col">
      {/* Selected candidate details */}
      {selectedCandidate ? (
        <div className="flex-1 space-y-3 overflow-y-auto">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900">{selectedCandidate.label}</h3>
              <ConfidenceBadge score={selectedCandidate.score} />
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                style={{
                  backgroundColor: selectedCandidate.branch_color + '15',
                  color: selectedCandidate.branch_color,
                }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: selectedCandidate.branch_color }}
                />
                {selectedCandidate.branch}
              </span>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">IRI</p>
            <IriDisplay iri={selectedCandidate.iri} iriHash={selectedCandidate.iri_hash} />
          </div>

          {selectedCandidate.definition && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Definition
              </p>
              <p className="mt-0.5 text-sm text-gray-700">{selectedCandidate.definition}</p>
            </div>
          )}

          {selectedCandidate.synonyms.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Synonyms</p>
              <div className="mt-0.5 flex flex-wrap gap-1">
                {selectedCandidate.synonyms.map((syn) => (
                  <span
                    key={syn}
                    className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600"
                  >
                    {syn}
                  </span>
                ))}
              </div>
            </div>
          )}

          {selectedCandidate.hierarchy_path.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Hierarchy
              </p>
              <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-gray-600">
                {selectedCandidate.hierarchy_path.map((part, i) => (
                  <span key={i} className="flex items-center gap-1">
                    {i > 0 && <span className="text-gray-300">&rsaquo;</span>}
                    <span className={i === selectedCandidate.hierarchy_path.length - 1 ? 'font-medium text-gray-900' : ''}>
                      {part}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-gray-400">Click a candidate to see details</p>
        </div>
      )}
    </div>
  );
}
