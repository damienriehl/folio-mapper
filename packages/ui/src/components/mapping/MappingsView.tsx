import { useState, useRef, useEffect, useCallback } from 'react';
import type {
  MappingResponse,
  BranchState,
  InputHierarchyNode,
  FolioCandidate,
  ItemMappingResult,
} from '@folio-mapper/core';
import { DetailPanel } from './DetailPanel';
import { EntityGraphModal } from './EntityGraphModal';

interface MappingsViewProps {
  inputHierarchy: InputHierarchyNode[] | null;
  mappingResponse: MappingResponse;
  selections: Record<number, string[]>;
  branchStates: Record<string, BranchState>;
  onClose: () => void;
}

interface MappedConcept {
  iri: string;
  iri_hash: string;
  label: string;
  branch: string;
  branch_color: string;
  score: number;
  definition: string | null;
  synonyms: string[];
  hierarchy_path: { label: string; iri_hash: string }[];
}

function collectMappedConcepts(
  itemIndex: number,
  mappingResponse: MappingResponse,
  selections: Record<number, string[]>,
): MappedConcept[] {
  const selectedHashes = selections[itemIndex] || [];
  if (selectedHashes.length === 0) return [];
  const item = mappingResponse.items.find((i) => i.item_index === itemIndex);
  if (!item) return [];
  const concepts: MappedConcept[] = [];
  for (const group of item.branch_groups) {
    for (const c of group.candidates) {
      if (selectedHashes.includes(c.iri_hash)) {
        concepts.push({
          iri: c.iri,
          iri_hash: c.iri_hash,
          label: c.label,
          branch: c.branch,
          branch_color: c.branch_color,
          score: c.score,
          definition: c.definition,
          synonyms: c.synonyms,
          hierarchy_path: c.hierarchy_path,
        });
      }
    }
  }
  return concepts;
}

function groupByBranch(concepts: MappedConcept[]): Record<string, MappedConcept[]> {
  const grouped: Record<string, MappedConcept[]> = {};
  for (const c of concepts) {
    (grouped[c.branch] ??= []).push(c);
  }
  return grouped;
}

// --- Hierarchy tree for middle pane ---

interface OutputTreeNode {
  label: string;
  iriHash: string | null;
  concept: MappedConcept | null; // non-null for leaf/mapped concepts
  children: OutputTreeNode[];
}

function buildOutputTree(concepts: MappedConcept[]): OutputTreeNode[] {
  const roots: OutputTreeNode[] = [];
  for (const c of concepts) {
    // Skip the first element (branch root — already shown as branch header)
    const segments = c.hierarchy_path.slice(1);
    if (segments.length === 0) continue;

    let siblings = roots;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      let node = siblings.find((n) => n.label === seg.label);
      if (!node) {
        node = { label: seg.label, iriHash: seg.iri_hash, concept: null, children: [] };
        siblings.push(node);
      }
      if (i === segments.length - 1) {
        node.concept = c;
      }
      siblings = node.children;
    }
  }
  return roots;
}

function OutputNodeComponent({
  node,
  depth,
  selectedConceptIri,
  onSelectConcept,
}: {
  node: OutputTreeNode;
  depth: number;
  selectedConceptIri: string | null;
  onSelectConcept: (iri: string, label?: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const isMapped = node.concept !== null;
  const isSelected = isMapped && node.concept!.iri_hash === selectedConceptIri;

  // Leaf concept node (no children)
  if (isMapped && !hasChildren) {
    return (
      <div
        className={`flex cursor-pointer items-center gap-1.5 rounded py-1 pr-2 text-sm ${
          isSelected ? 'bg-blue-100 ring-1 ring-blue-400' : 'text-gray-800 hover:bg-gray-50'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelectConcept(node.concept!.iri_hash, node.label)}
      >
        <span data-iri={node.concept!.iri_hash} className="text-xs text-gray-300">{'\u25CF'}</span>
        <span className="min-w-0 flex-1 truncate font-medium">{node.label}</span>
      </div>
    );
  }

  // Mapped concept that also has children
  if (isMapped && hasChildren) {
    return (
      <div>
        <div
          className={`flex cursor-pointer items-center gap-1.5 rounded py-1 pr-2 text-sm ${
            isSelected ? 'bg-blue-100 ring-1 ring-blue-400' : 'text-gray-800 hover:bg-gray-50'
          }`}
          style={{ paddingLeft: `${depth * 16 + 4}px` }}
          onClick={() => onSelectConcept(node.concept!.iri_hash, node.label)}
        >
          <button
            data-iri={node.concept!.iri_hash}
            type="button"
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            className="shrink-0 text-xs text-gray-400"
          >
            {expanded ? '\u25BC' : '\u25B6'}
          </button>
          <span className="min-w-0 flex-1 truncate font-medium">{node.label}</span>
        </div>
        {expanded && (
          <div className="ml-2">
            {node.children.map((child) => (
              <OutputNodeComponent
                key={child.label}
                node={child}
                depth={depth + 1}
                selectedConceptIri={selectedConceptIri}
                onSelectConcept={onSelectConcept}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Structural (non-mapped) node — clickable to show details
  const isStructuralSelected = node.iriHash === selectedConceptIri;
  return (
    <div>
      <div
        className={`flex items-center gap-1.5 rounded py-1 text-sm ${
          isStructuralSelected ? 'bg-blue-100 text-gray-700 ring-1 ring-blue-400' : 'cursor-pointer text-gray-500 hover:bg-gray-50'
        }`}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
        onClick={() => node.iriHash && onSelectConcept(node.iriHash, node.label)}
      >
        {hasChildren && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            className="shrink-0 text-xs text-gray-400"
          >
            {expanded ? '\u25BC' : '\u25B6'}
          </button>
        )}
        <span className="min-w-0 flex-1 text-left">{node.label}</span>
      </div>
      {hasChildren && expanded && (
        <div className="ml-2">
          {node.children.map((child) => (
            <OutputNodeComponent
              key={child.label}
              node={child}
              depth={depth + 1}
              selectedConceptIri={selectedConceptIri}
              onSelectConcept={onSelectConcept}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function InputTreeNode({
  node,
  selectedIndex,
  onSelect,
  mappingResponse,
  selections,
}: {
  node: InputHierarchyNode;
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  mappingResponse: MappingResponse;
  selections: Record<number, string[]>;
}) {
  const [expanded, setExpanded] = useState(true);
  const isLeaf = node.item_index !== null;
  const isSelected = isLeaf && node.item_index === selectedIndex;
  const conceptCount = isLeaf
    ? (selections[node.item_index!] || []).length
    : 0;

  return (
    <div style={{ paddingLeft: node.depth > 0 ? 16 : 0 }}>
      <div
        className={`flex items-center gap-1.5 rounded px-2 py-1 text-sm ${
          isSelected
            ? 'bg-blue-100 font-semibold text-blue-800'
            : isLeaf
              ? 'cursor-pointer text-gray-800 hover:bg-gray-100'
              : 'font-medium text-gray-500'
        }`}
        data-item-index={node.item_index}
        onClick={() => {
          if (isLeaf) onSelect(node.item_index!);
          else if (node.children.length > 0) setExpanded(!expanded);
        }}
      >
        {node.children.length > 0 && (
          <button
            type="button"
            className="text-xs text-gray-400"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            {expanded ? '\u25BC' : '\u25B6'}
          </button>
        )}
        <span className="truncate">{node.label}</span>
        {isLeaf && conceptCount > 0 && (
          <span className="ml-auto shrink-0 rounded-full bg-blue-200 px-1.5 text-[10px] font-medium text-blue-700">
            {conceptCount} concept{conceptCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      {expanded &&
        node.children.map((child, i) => (
          <InputTreeNode
            key={i}
            node={child}
            selectedIndex={selectedIndex}
            onSelect={onSelect}
            mappingResponse={mappingResponse}
            selections={selections}
          />
        ))}
    </div>
  );
}

export function MappingsView({
  inputHierarchy,
  mappingResponse,
  selections,
  branchStates,
  onClose,
}: MappingsViewProps) {
  const [selectedItemIndex, setSelectedItemIndex] = useState<number | null>(null);
  const [selectedConceptIri, setSelectedConceptIri] = useState<string | null>(null);
  const [detailConcept, setDetailConcept] = useState<FolioCandidate | null>(null);
  const [graphTarget, setGraphTarget] = useState<{ iriHash: string; label: string } | null>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const middleRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // All mapped concepts for selected input item
  const selectedConcepts = selectedItemIndex !== null
    ? collectMappedConcepts(selectedItemIndex, mappingResponse, selections)
    : [];
  const branchGroups = groupByBranch(selectedConcepts);

  // Select a concept for detail — works for both mapped and structural nodes
  const selectConcept = useCallback((iriHash: string, label?: string) => {
    setSelectedConceptIri(iriHash);
    const mapped = selectedConcepts.find((c) => c.iri_hash === iriHash);
    if (mapped) {
      setDetailConcept(mapped as FolioCandidate);
    } else {
      // Structural node — create a stub; DetailPanel will fetch full details
      setDetailConcept({
        label: label || iriHash,
        iri: '',
        iri_hash: iriHash,
        definition: null,
        synonyms: [],
        branch: '',
        branch_color: '#6b7280',
        hierarchy_path: [],
        score: -1,
      });
    }
  }, [selectedConcepts]);

  // Auto-select the first input item on mount
  useEffect(() => {
    if (selectedItemIndex !== null) return;
    // Find the first leaf node (with an item_index)
    const findFirstLeaf = (nodes: { item_index: number | null; children: any[] }[]): number | null => {
      for (const node of nodes) {
        if (node.item_index !== null) return node.item_index;
        if (node.children?.length) {
          const found = findFirstLeaf(node.children);
          if (found !== null) return found;
        }
      }
      return null;
    };
    const firstIndex = findFirstLeaf(inputHierarchy);
    if (firstIndex !== null) {
      setSelectedItemIndex(firstIndex);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-select the first mapped concept when switching input items
  useEffect(() => {
    if (selectedConcepts.length > 0 && !selectedConceptIri) {
      const first = selectedConcepts[0];
      setSelectedConceptIri(first.iri_hash);
      setDetailConcept(first as FolioCandidate);
    }
  }, [selectedItemIndex, selectedConcepts.length]);

  // Current item for DetailPanel
  const currentItem: ItemMappingResult | undefined = selectedItemIndex !== null
    ? mappingResponse.items.find((i) => i.item_index === selectedItemIndex)
    : undefined;

  // Draw SVG lines
  const drawLines = useCallback(() => {
    const svg = svgRef.current;
    if (!svg || selectedItemIndex === null) {
      if (svg) svg.innerHTML = '';
      return;
    }
    const wrapperRect = svg.parentElement?.getBoundingClientRect();
    if (!wrapperRect) return;

    const inputEl = leftRef.current?.querySelector(
      `[data-item-index="${selectedItemIndex}"]`,
    );
    const outputEls = middleRef.current?.querySelectorAll('[data-iri]') ?? [];

    if (!inputEl || outputEls.length === 0) {
      svg.innerHTML = '';
      return;
    }

    const inputRect = inputEl.getBoundingClientRect();
    const startX = inputRect.right - wrapperRect.left;
    const startY = inputRect.top + inputRect.height / 2 - wrapperRect.top;

    let paths = '';
    outputEls.forEach((el) => {
      const iriHash = el.getAttribute('data-iri');
      const concept = selectedConcepts.find((c) => c.iri_hash === iriHash);
      if (!concept) return;
      const rect = el.getBoundingClientRect();
      const endX = rect.left - wrapperRect.left;
      const endY = rect.top + rect.height / 2 - wrapperRect.top;
      const cp1x = startX + (endX - startX) * 0.4;
      const cp2x = startX + (endX - startX) * 0.6;
      paths += `<path d="M${startX},${startY} C${cp1x},${startY} ${cp2x},${endY} ${endX},${endY}" stroke="${concept.branch_color}" stroke-width="1.5" fill="none" opacity="0.5"/>`;
    });
    svg.innerHTML = paths;
  }, [selectedItemIndex, selectedConcepts]);

  useEffect(() => {
    drawLines();
  }, [drawLines]);

  // Redraw on scroll
  useEffect(() => {
    const left = leftRef.current;
    const middle = middleRef.current;
    let raf: number;
    const handler = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(drawLines);
    };
    left?.addEventListener('scroll', handler);
    middle?.addEventListener('scroll', handler);
    return () => {
      left?.removeEventListener('scroll', handler);
      middle?.removeEventListener('scroll', handler);
      cancelAnimationFrame(raf);
    };
  }, [drawLines]);

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const nodes = inputHierarchy || [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Input-to-Output Mappings"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex h-full w-full flex-col overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/10">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-800">
            Input-to-Output Mappings
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm hover:bg-gray-50"
          >
            <span aria-hidden="true">&times;</span>
            Close
            <kbd className="ml-1 rounded border border-gray-200 bg-gray-100 px-1 py-0.5 text-[10px] font-sans text-gray-400">Esc</kbd>
          </button>
        </div>

      {/* 3-panel layout */}
      <div className="relative flex min-h-0 flex-1">
        {/* SVG overlay spanning left pane + gutter + middle pane */}
        <svg
          ref={svgRef}
          className="pointer-events-none absolute inset-0 z-10"
          style={{ width: '100%', height: '100%' }}
        />

        {/* Left pane: Input hierarchy */}
        <div
          ref={leftRef}
          className="w-[280px] shrink-0 overflow-y-auto border-r border-gray-200 bg-gray-50 p-3"
        >
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-600">
            Input Items
          </p>
          {nodes.length === 0 ? (
            <p className="text-xs text-gray-400">No input hierarchy available</p>
          ) : (
            nodes.map((node, i) => (
              <InputTreeNode
                key={i}
                node={node}
                selectedIndex={selectedItemIndex}
                onSelect={(idx) => {
                  setSelectedItemIndex(idx);
                  setSelectedConceptIri(null);
                  setDetailConcept(null);
                }}
                mappingResponse={mappingResponse}
                selections={selections}
              />
            ))
          )}
        </div>

        {/* Gutter for bezier lines */}
        <div className="w-[120px] shrink-0" />

        {/* Middle pane: FOLIO output tree */}
        <div
          ref={middleRef}
          className="w-[340px] shrink-0 overflow-y-auto border-l border-gray-200 p-4"
        >
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-600">
            Mapped FOLIO Concepts
          </p>
          {selectedItemIndex === null ? (
            <p className="mt-8 text-center text-sm text-gray-400">
              Select an input item to see its mapped concepts
            </p>
          ) : selectedConcepts.length === 0 ? (
            <p className="mt-8 text-center text-sm text-gray-400">
              No concepts mapped for this item
            </p>
          ) : (
            Object.entries(branchGroups).map(([branch, concepts]) => {
              const color = concepts[0]?.branch_color || '#6b7280';
              if (branchStates[branch] === 'excluded') return null;
              const tree = buildOutputTree(concepts);
              return (
                <div key={branch} className="mb-3">
                  <div
                    className="mb-1 flex items-center gap-2 rounded-md border-l-4 px-3 py-1.5 text-xs font-bold uppercase tracking-wide"
                    style={{
                      borderLeftColor: color,
                      backgroundColor: `${color}15`,
                      color,
                    }}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span>{branch}</span>
                    <span style={{ color: `${color}80` }}>
                      {concepts.length} concept{concepts.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="ml-4 border-l border-gray-100 pl-1">
                    {tree.map((node) => (
                      <OutputNodeComponent
                        key={node.label}
                        node={node}
                        depth={0}
                        selectedConceptIri={selectedConceptIri}
                        onSelectConcept={selectConcept}
                      />
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right pane: Concept details (reuses main DetailPanel) */}
        <div className="flex min-w-[320px] flex-1 flex-col border-l border-gray-200 bg-gray-50">
          <div className="shrink-0 border-b border-gray-300 bg-gray-200 px-4 py-1.5">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-600">
              Concept Details
            </h2>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {currentItem ? (
              <DetailPanel
                currentItem={currentItem}
                selectedCandidate={detailConcept}
                onOpenGraph={(iriHash, label) => setGraphTarget({ iriHash, label })}
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-xs text-gray-400">Select an input item, then click a concept</p>
              </div>
            )}
          </div>
        </div>
      </div>
      </div>

      {graphTarget && (
        <EntityGraphModal
          iriHash={graphTarget.iriHash}
          label={graphTarget.label}
          onNavigateToConcept={() => setGraphTarget(null)}
          onClose={() => setGraphTarget(null)}
        />
      )}
    </div>
  );
}
