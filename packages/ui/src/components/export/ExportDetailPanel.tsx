import { useState, useEffect } from 'react';
import type { ExportTreeConcept, ConceptDetail } from '@folio-mapper/core';
import { fetchConceptDetail } from '@folio-mapper/core';
import { ConfidenceBadge } from '../mapping/ConfidenceBadge';
import { IriDisplay } from '../mapping/IriDisplay';

interface ExportDetailPanelProps {
  concept: ExportTreeConcept | null;
}

export function ExportDetailPanel({ concept }: ExportDetailPanelProps) {
  const [detail, setDetail] = useState<ConceptDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!concept) {
      setDetail(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setDetail(null);

    fetchConceptDetail(concept.iri_hash)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [concept?.iri_hash]);

  if (!concept) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-gray-400">Click a concept to see details</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="space-y-3">
        {/* Header: Label + Score */}
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900">{concept.label}</h3>
            {concept.score > 0 && <ConfidenceBadge score={concept.score} />}
          </div>
          {concept.branch && (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
              {concept.branch}
            </span>
          )}
          {!concept.is_mapped && (
            <span className="ml-1 inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-600">
              {concept.relationship || 'unmapped'}
            </span>
          )}
        </div>

        {/* IRI */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">IRI</p>
          <IriDisplay iri={concept.iri} iriHash={concept.iri_hash} />
        </div>

        {/* Definition */}
        {concept.definition && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Definition</p>
            <p className="mt-0.5 text-sm text-gray-700">{concept.definition}</p>
          </div>
        )}

        {/* Synonyms */}
        {concept.alternative_labels.length > 0 && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Synonyms</p>
            <div className="mt-0.5 flex flex-wrap gap-1">
              {concept.alternative_labels.map((syn) => (
                <span key={syn} className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                  {syn}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Translations */}
        {Object.keys(concept.translations).length > 0 && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Translations</p>
            <div className="mt-0.5 flex flex-wrap gap-1">
              {Object.entries(concept.translations).map(([lang, text]) => (
                <span key={lang} className="rounded bg-purple-50 px-1.5 py-0.5 text-xs text-purple-700">
                  <span className="font-medium">{lang}:</span> {text}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Hierarchy breadcrumb */}
        {concept.hierarchy_path_entries.length > 0 && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Hierarchy</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs">
              {concept.hierarchy_path_entries.map((entry, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <span className="text-blue-300">&rsaquo;</span>}
                  <span
                    className={`rounded px-1.5 py-0.5 font-medium ${
                      i === concept.hierarchy_path_entries.length - 1
                        ? 'bg-blue-200 text-blue-900'
                        : 'bg-blue-50 text-blue-600'
                    }`}
                  >
                    {entry.label}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Loading indicator for extended detail */}
        {isLoading && (
          <div className="flex items-center gap-2 py-2">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border border-gray-300 border-t-blue-600" />
            <span className="text-xs text-gray-400">Loading details...</span>
          </div>
        )}

        {/* Extended detail from lazy load */}
        {detail && (
          <>
            {detail.children.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Children ({detail.children.length})
                </p>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {detail.children.slice(0, 10).map((entry) => (
                    <span
                      key={entry.iri_hash}
                      className="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700"
                    >
                      {entry.label}
                    </span>
                  ))}
                  {detail.children.length > 10 && (
                    <span className="text-xs text-gray-400">+{detail.children.length - 10} more</span>
                  )}
                </div>
              </div>
            )}

            {detail.examples.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Examples ({detail.examples.length})
                </p>
                <div className="mt-0.5 space-y-0.5">
                  {detail.examples.slice(0, 5).map((ex, i) => (
                    <p key={i} className="text-xs text-gray-600">{ex}</p>
                  ))}
                  {detail.examples.length > 5 && (
                    <span className="text-xs text-gray-400">+{detail.examples.length - 5} more</span>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* Notes */}
        {concept.notes && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Notes</p>
            <p className="mt-0.5 text-xs text-gray-600">{concept.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
