import { useState, useCallback } from 'react';
import type { ExportConcept, ExportOptions, ExportPreviewRow, ExportRow } from '@folio-mapper/core';
import { EXPORT_FORMATS, fetchExport, fetchExportPreview } from '@folio-mapper/core';
import { useInputStore } from '../store/input-store';
import { useMappingStore } from '../store/mapping-store';

function buildExportRows(): ExportRow[] {
  const mapping = useMappingStore.getState();
  const input = useInputStore.getState();
  if (!mapping.mappingResponse) return [];

  const rows: ExportRow[] = [];
  for (const item of mapping.mappingResponse.items) {
    const selectedHashes = mapping.selections[item.item_index] || [];
    const parseItem = input.parseResult?.items[item.item_index];

    const selectedConcepts: ExportConcept[] = [];
    for (const group of item.branch_groups) {
      for (const candidate of group.candidates) {
        if (selectedHashes.includes(candidate.iri_hash)) {
          selectedConcepts.push({
            label: candidate.label,
            iri: candidate.iri,
            iri_hash: candidate.iri_hash,
            branch: candidate.branch,
            score: candidate.score,
            definition: candidate.definition,
            translations: {},
          });
        }
      }
    }

    rows.push({
      item_index: item.item_index,
      source_text: item.item_text,
      ancestry: parseItem?.ancestry || [],
      selected_concepts: selectedConcepts,
      note: mapping.notes[item.item_index] || null,
      status: mapping.nodeStatuses[item.item_index] || 'pending',
    });
  }
  return rows;
}

export function useExport() {
  const [isExporting, setIsExporting] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  const handleExport = useCallback(async (options: ExportOptions) => {
    setIsExporting(true);
    try {
      const rows = buildExportRows();
      const input = useInputStore.getState();
      const blob = await fetchExport({
        rows,
        options,
        source_file: input.parseResult?.source_filename ?? null,
        session_created: null,
      });

      const format = EXPORT_FORMATS.find((f) => f.value === options.format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `folio-mappings${format?.extension || '.txt'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  }, []);

  const handlePreview = useCallback(async (options: ExportOptions): Promise<ExportPreviewRow[]> => {
    const rows = buildExportRows();
    const input = useInputStore.getState();
    return fetchExportPreview({
      rows,
      options,
      source_file: input.parseResult?.source_filename ?? null,
      session_created: null,
    });
  }, []);

  return { showExportModal, setShowExportModal, handleExport, handlePreview, isExporting };
}
