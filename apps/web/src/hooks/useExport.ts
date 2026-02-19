import { useState, useCallback } from 'react';
import type { ExportConcept, ExportOptions, ExportPreviewRow, ExportRow, ExportTreeData, InputHierarchyNode } from '@folio-mapper/core';
import type { HierarchyNode, ParseItem } from '@folio-mapper/core';
import { EXPORT_FORMATS, fetchExport, fetchExportPreview, fetchExportTreeData } from '@folio-mapper/core';
import { useInputStore } from '../store/input-store';
import { useMappingStore } from '../store/mapping-store';

function buildInputHierarchy(): InputHierarchyNode[] | null {
  const input = useInputStore.getState();
  if (!input.parseResult) return null;
  const { hierarchy, items } = input.parseResult;

  if (hierarchy) {
    // Convert HierarchyNode[] to InputHierarchyNode[], matching item_index via label
    const itemMap = new Map<string, number>();
    for (const item of items) {
      itemMap.set(item.text, item.index);
    }
    function convert(node: HierarchyNode): InputHierarchyNode {
      return {
        label: node.label,
        depth: node.depth,
        item_index: itemMap.get(node.label) ?? null,
        children: node.children.map(convert),
      };
    }
    return hierarchy.map(convert);
  }

  // Flat input: build flat list of nodes
  return items.map((item: ParseItem) => ({
    label: item.text,
    depth: 0,
    item_index: item.index,
    children: [],
  }));
}

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
      const inputHierarchy = buildInputHierarchy();
      const blob = await fetchExport({
        rows,
        options,
        source_file: input.parseResult?.source_filename ?? null,
        session_created: null,
        input_hierarchy: inputHierarchy,
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
    const inputHierarchy = buildInputHierarchy();
    return fetchExportPreview({
      rows,
      options,
      source_file: input.parseResult?.source_filename ?? null,
      session_created: null,
      input_hierarchy: inputHierarchy,
    });
  }, []);

  const handleFetchTreeData = useCallback(async (options: ExportOptions): Promise<ExportTreeData> => {
    const rows = buildExportRows();
    const input = useInputStore.getState();
    const inputHierarchy = buildInputHierarchy();
    return fetchExportTreeData({
      rows,
      options,
      source_file: input.parseResult?.source_filename ?? null,
      session_created: null,
      input_hierarchy: inputHierarchy,
    });
  }, []);

  return { showExportModal, setShowExportModal, handleExport, handlePreview, handleFetchTreeData, isExporting };
}
