import { useState, useEffect, useRef, useCallback } from 'react';
import type { ConceptDetail, FolioCandidate, HierarchyPathEntry, ItemMappingResult } from '@folio-mapper/core';
import { fetchConceptDetail } from '@folio-mapper/core';
import { IriDisplay } from './IriDisplay';
import { ConfidenceBadge } from './ConfidenceBadge';

interface DetailPanelProps {
  currentItem: ItemMappingResult;
  selectedCandidate: FolioCandidate | null;
  onSelectForDetail?: (iriHash: string) => void;
}

function ExpandableList<T>({
  items,
  cutoff,
  renderItem,
  selectedIriHash,
}: {
  items: T[];
  cutoff: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  selectedIriHash?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  // Reset when selected candidate changes
  useEffect(() => {
    setExpanded(false);
  }, [selectedIriHash]);

  if (items.length === 0) return null;

  const visible = expanded ? items : items.slice(0, cutoff);
  const remaining = items.length - cutoff;

  return (
    <div>
      <div className="mt-0.5 flex flex-wrap gap-1">
        {visible.map((item, i) => renderItem(item, i))}
      </div>
      {remaining > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="mt-1 text-xs text-blue-600 hover:text-blue-800"
        >
          {expanded ? 'Show less' : `See more... (${remaining} more)`}
        </button>
      )}
    </div>
  );
}

export function DetailPanel({ currentItem, selectedCandidate, onSelectForDetail }: DetailPanelProps) {
  const [detail, setDetail] = useState<ConceptDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [showTranslations, setShowTranslations] = useState(true);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const optionsRef = useRef<HTMLDivElement>(null);

  // Fetch extended detail when candidate changes
  useEffect(() => {
    if (!selectedCandidate) {
      setDetail(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setDetail(null);

    fetchConceptDetail(selectedCandidate.iri_hash)
      .then((d) => {
        if (!cancelled) {
          setDetail(d);
          // Default: all available languages selected
          setSelectedLanguages(Object.keys(d.translations));
        }
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [selectedCandidate?.iri_hash]);

  // Close options popover on click outside
  useEffect(() => {
    if (!showOptions) return;
    function handleClick(e: MouseEvent) {
      if (optionsRef.current && !optionsRef.current.contains(e.target as Node)) {
        setShowOptions(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showOptions]);

  const toggleLanguage = useCallback((lang: string) => {
    setSelectedLanguages((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang],
    );
  }, []);

  const renderClickablePill = useCallback(
    (entry: HierarchyPathEntry, index: number) => (
      <span
        key={`${entry.iri_hash}-${index}`}
        onClick={() => onSelectForDetail?.(entry.iri_hash)}
        className={`rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700 ${onSelectForDetail ? 'cursor-pointer hover:bg-blue-200 hover:text-blue-900' : ''}`}
      >
        {entry.label}
      </span>
    ),
    [onSelectForDetail],
  );

  if (!selectedCandidate) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-gray-400">Click a candidate to see details</p>
        </div>
      </div>
    );
  }

  const availableLanguages = detail ? Object.keys(detail.translations) : [];
  const filteredTranslations = detail
    ? Object.entries(detail.translations).filter(([lang]) => selectedLanguages.includes(lang))
    : [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto">
        {/* Header: Label + Score + Branch + Options */}
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900">{selectedCandidate.label}</h3>
            {selectedCandidate.score >= 0 && <ConfidenceBadge score={selectedCandidate.score} />}
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
            {/* Options button */}
            <div className="relative" ref={optionsRef}>
              <button
                type="button"
                onClick={() => setShowOptions(!showOptions)}
                className="rounded border border-gray-200 p-1 text-gray-400 hover:bg-gray-50 hover:text-gray-600"
                aria-label="Detail options"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
              {showOptions && (
                <div className="absolute left-0 top-full z-10 mt-1 w-48 rounded-md border border-gray-200 bg-white p-2 shadow-lg">
                  <label className="flex items-center gap-2 text-xs text-gray-700">
                    <input
                      type="checkbox"
                      checked={showTranslations}
                      onChange={() => setShowTranslations(!showTranslations)}
                      className="rounded border-gray-300"
                    />
                    Show translations
                  </label>
                  {showTranslations && availableLanguages.length > 0 && (
                    <div className="mt-2 space-y-1 border-t border-gray-100 pt-2">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Languages</p>
                      {availableLanguages.map((lang) => (
                        <label key={lang} className="flex items-center gap-2 text-xs text-gray-600">
                          <input
                            type="checkbox"
                            checked={selectedLanguages.includes(lang)}
                            onChange={() => toggleLanguage(lang)}
                            className="rounded border-gray-300"
                          />
                          {lang}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* IRI */}
        {selectedCandidate.iri && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">IRI</p>
            <IriDisplay iri={selectedCandidate.iri} iriHash={selectedCandidate.iri_hash} />
          </div>
        )}

        {/* Definition */}
        {selectedCandidate.definition && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Definition</p>
            <p className="mt-0.5 text-sm text-gray-700">{selectedCandidate.definition}</p>
          </div>
        )}

        {/* Synonyms (immediate, no loading needed) */}
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

        {/* Extended detail sections (loaded lazily) */}
        {isLoading && (
          <div className="flex items-center gap-2 py-2">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border border-gray-300 border-t-blue-600" />
            <span className="text-xs text-gray-400">Loading details...</span>
          </div>
        )}

        {detail && (
          <>
            {/* Translations */}
            {showTranslations && filteredTranslations.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Translations</p>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {filteredTranslations.map(([lang, text]) => (
                    <span
                      key={lang}
                      className="rounded bg-purple-50 px-1.5 py-0.5 text-xs text-purple-700"
                    >
                      <span className="font-medium">{lang}:</span> {text}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Parents (hierarchy breadcrumb) */}
            {detail.hierarchy_path.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Parents</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs">
                  {detail.hierarchy_path.map((entry, i) => (
                    <span key={i} className="flex items-center gap-1">
                      {i > 0 && <span className="text-blue-300">&rsaquo;</span>}
                      <span
                        onClick={() => onSelectForDetail?.(entry.iri_hash)}
                        className={`rounded px-1.5 py-0.5 font-medium ${i === detail.hierarchy_path.length - 1 ? 'bg-blue-200 text-blue-900' : 'bg-blue-50 text-blue-600'} ${onSelectForDetail ? 'cursor-pointer hover:bg-blue-200 hover:text-blue-900' : ''}`}
                      >
                        {entry.label}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Children */}
            {detail.children.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Children ({detail.children.length})
                </p>
                <ExpandableList
                  items={detail.children}
                  cutoff={5}
                  renderItem={renderClickablePill}
                  selectedIriHash={selectedCandidate.iri_hash}
                />
              </div>
            )}

            {/* Siblings */}
            {detail.siblings.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Siblings ({detail.siblings.length})
                </p>
                <ExpandableList
                  items={detail.siblings}
                  cutoff={5}
                  renderItem={renderClickablePill}
                  selectedIriHash={selectedCandidate.iri_hash}
                />
              </div>
            )}

            {/* Relationships (see_also) */}
            {detail.related.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Relationships ({detail.related.length})
                </p>
                <ExpandableList
                  items={detail.related}
                  cutoff={5}
                  renderItem={renderClickablePill}
                  selectedIriHash={selectedCandidate.iri_hash}
                />
              </div>
            )}

            {/* Examples */}
            {detail.examples.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Examples ({detail.examples.length})
                </p>
                <ExpandableList
                  items={detail.examples}
                  cutoff={3}
                  renderItem={(example, i) => (
                    <p key={i} className="text-xs text-gray-600">{example}</p>
                  )}
                  selectedIriHash={selectedCandidate.iri_hash}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
