import { useState, useEffect, useCallback } from 'react';
import type {
  ExportFormat,
  ExportOptions,
  ExportScope,
  ExportTreeData,
  ExportTreeConcept,
  LanguageCode,
} from '@folio-mapper/core';
import { EXPORT_FORMATS } from '@folio-mapper/core';
import { ExportOptionsBar } from './ExportOptionsBar';
import { ExportTree } from './ExportTree';
import { ExportDetailPanel } from './ExportDetailPanel';

interface ExportViewProps {
  totalItems: number;
  completedCount: number;
  onExport: (options: ExportOptions) => Promise<void>;
  onFetchTreeData: (options: ExportOptions) => Promise<ExportTreeData>;
  onClose: () => void;
  isExporting: boolean;
  branchSortMode: string;
  customBranchOrder: string[];
}

export function ExportView({
  totalItems,
  completedCount,
  onExport,
  onFetchTreeData,
  onClose,
  isExporting,
  branchSortMode,
  customBranchOrder,
}: ExportViewProps) {
  const [format, setFormat] = useState<ExportFormat>('html');
  const [exportScope, setExportScope] = useState<ExportScope>('mapped_only');
  const [includeConfidence, setIncludeConfidence] = useState(true);
  const [includeNotes, setIncludeNotes] = useState(true);
  const [iriFormat, setIriFormat] = useState<'hash' | 'full_url' | 'both'>('hash');
  const [languages, setLanguages] = useState<LanguageCode[]>([]);
  const [includeTreeSection, setIncludeTreeSection] = useState(true);
  const [includeTableSection, setIncludeTableSection] = useState(true);

  const [treeData, setTreeData] = useState<ExportTreeData | null>(null);
  const [selectedIriHash, setSelectedIriHash] = useState<string | null>(null);
  const [isLoadingTree, setIsLoadingTree] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildOptions = useCallback((): ExportOptions => ({
    format,
    include_confidence: includeConfidence,
    include_notes: includeNotes,
    include_reasoning: false,
    iri_format: iriFormat,
    languages,
    include_hierarchy: true,
    export_scope: exportScope,
    branch_sort_mode: branchSortMode as 'default' | 'alphabetical' | 'custom',
    custom_branch_order: customBranchOrder,
    include_tree_section: includeTreeSection,
    include_table_section: includeTableSection,
  }), [format, includeConfidence, includeNotes, iriFormat, languages, exportScope, branchSortMode, customBranchOrder, includeTreeSection, includeTableSection]);

  // Fetch tree data on mount and when scope changes
  useEffect(() => {
    let cancelled = false;
    setIsLoadingTree(true);
    setError(null);
    setSelectedIriHash(null);

    onFetchTreeData(buildOptions())
      .then((data) => {
        if (!cancelled) setTreeData(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load tree data');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingTree(false);
      });

    return () => { cancelled = true; };
  }, [exportScope, branchSortMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleExport = async () => {
    setError(null);
    try {
      await onExport(buildOptions());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    }
  };

  // Find selected concept across all branches, falling back to ancestor metadata
  const selectedConcept: ExportTreeConcept | null = (() => {
    if (!treeData || !selectedIriHash) return null;
    for (const branch of treeData.branches) {
      const found = branch.concepts.find((c) => c.iri_hash === selectedIriHash);
      if (found) return found;
    }
    // Fallback: ancestor metadata (structural nodes in the tree)
    const ancestor = treeData.ancestor_metadata?.[selectedIriHash];
    if (ancestor) return ancestor;
    return null;
  })();

  const formatLabel = EXPORT_FORMATS.find((f) => f.value === format)?.label || format;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Export Mappings</h1>
          <p className="text-sm text-gray-500">
            {completedCount} of {totalItems} items completed
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isExporting ? 'Exporting...' : `Export as ${formatLabel}`}
          </button>
        </div>
      </div>

      {/* Options bar */}
      <ExportOptionsBar
        format={format}
        exportScope={exportScope}
        includeConfidence={includeConfidence}
        includeNotes={includeNotes}
        iriFormat={iriFormat}
        languages={languages}
        includeTreeSection={includeTreeSection}
        includeTableSection={includeTableSection}
        onFormatChange={setFormat}
        onScopeChange={setExportScope}
        onIncludeConfidenceChange={setIncludeConfidence}
        onIncludeNotesChange={setIncludeNotes}
        onIriFormatChange={setIriFormat}
        onLanguagesChange={setLanguages}
        onIncludeTreeSectionChange={setIncludeTreeSection}
        onIncludeTableSectionChange={setIncludeTableSection}
        totalConcepts={treeData?.total_concepts ?? 0}
        branchCount={treeData?.branches.length ?? 0}
      />

      {/* Scope warning */}
      {exportScope === 'full_ontology' && (
        <div className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-sm text-amber-700">
          Full ontology export includes ~18,323 concepts and may take several seconds.
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="border-b border-red-200 bg-red-50 px-6 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Main content: Tree + Detail */}
      <div className="flex min-h-0 flex-1">
        {/* Tree panel */}
        <div className="flex-1 overflow-y-auto border-r border-gray-200 p-4">
          {isLoadingTree ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
                <p className="text-sm text-gray-500">Loading tree data...</p>
              </div>
            </div>
          ) : treeData ? (
            <ExportTree
              branches={treeData.branches}
              selectedIriHash={selectedIriHash}
              onSelectForDetail={setSelectedIriHash}
            />
          ) : null}
        </div>

        {/* Detail panel */}
        <div className="w-80 shrink-0 overflow-y-auto p-4">
          <ExportDetailPanel concept={selectedConcept} />
        </div>
      </div>

    </div>
  );
}
