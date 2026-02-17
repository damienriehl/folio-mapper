import { useState, useCallback, useEffect } from 'react';
import type { ExportTreeBranch, ExportTreeConcept } from '@folio-mapper/core';
import { ConfidenceBadge } from '../mapping/ConfidenceBadge';

// --- Hierarchy tree data structure ---

interface HierarchyNode {
  label: string;
  iriHash: string | null;
  concept: ExportTreeConcept | null;
  children: HierarchyNode[];
}

function buildHierarchyTree(concepts: ExportTreeConcept[]): HierarchyNode[] {
  const roots: HierarchyNode[] = [];

  for (const concept of concepts) {
    // Skip the first entry (branch root — already shown as section header)
    const segments = concept.hierarchy_path_entries.slice(1);
    if (segments.length === 0) {
      roots.push({
        label: concept.label,
        iriHash: concept.iri_hash,
        concept,
        children: [],
      });
      continue;
    }

    let siblings = roots;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      let node = siblings.find((n) => n.label === seg.label);
      if (!node) {
        node = { label: seg.label, iriHash: seg.iri_hash, concept: null, children: [] };
        siblings.push(node);
      }
      if (i === segments.length - 1) {
        node.concept = concept;
      }
      siblings = node.children;
    }
  }

  return roots;
}

// --- Component props ---

interface ExportTreeProps {
  branches: ExportTreeBranch[];
  selectedIriHash: string | null;
  onSelectForDetail: (iriHash: string) => void;
}

export function ExportTree({
  branches,
  selectedIriHash,
  onSelectForDetail,
}: ExportTreeProps) {
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());
  const [expandAllSignal, setExpandAllSignal] = useState(0);
  const [collapseAllSignal, setCollapseAllSignal] = useState(0);

  useEffect(() => {
    if (expandAllSignal > 0) {
      setCollapsedNodes(new Set());
    }
  }, [expandAllSignal]);

  useEffect(() => {
    if (collapseAllSignal > 0) {
      const allKeys = new Set<string>();
      for (const b of branches) {
        allKeys.add(b.branch);
      }
      setCollapsedNodes(allKeys);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapseAllSignal]);

  const toggleCollapse = useCallback((key: string) => {
    setCollapsedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  if (branches.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-gray-400">
        No concepts to display
      </p>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Controls */}
      <div className="mb-2 flex gap-2 px-1">
        <button
          type="button"
          onClick={() => setExpandAllSignal((s) => s + 1)}
          className="rounded border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50"
        >
          Expand All
        </button>
        <button
          type="button"
          onClick={() => setCollapseAllSignal((s) => s + 1)}
          className="rounded border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50"
        >
          Collapse All
        </button>
      </div>

      {/* Tree */}
      <div className="flex-1 space-y-2 overflow-y-auto">
        {branches.map((branch) => {
          const branchKey = branch.branch;
          const isBranchCollapsed = collapsedNodes.has(branchKey);
          const tree = buildHierarchyTree(branch.concepts);

          return (
            <div key={branch.branch}>
              {/* Branch header */}
              <div
                className="flex w-full items-center gap-2 rounded-md border-l-4 px-3 py-1.5 text-left text-xs font-bold tracking-wide uppercase"
                style={{
                  borderLeftColor: branch.branch_color,
                  backgroundColor: branch.branch_color + '15',
                  color: branch.branch_color,
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleCollapse(branchKey)}
                  className="shrink-0"
                  style={{ color: branch.branch_color + '90' }}
                  aria-label={isBranchCollapsed ? 'Expand branch' : 'Collapse branch'}
                >
                  {isBranchCollapsed ? '\u25B6' : '\u25BC'}
                </button>
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: branch.branch_color }}
                />
                <span>{branch.branch}</span>
                <span style={{ color: branch.branch_color + '80' }}>({branch.concepts.length})</span>
              </div>

              {!isBranchCollapsed && (
                <div className="ml-4 border-l border-gray-100 pl-1">
                  {tree.length === 0 ? (
                    <p className="py-1 text-xs text-gray-400">No concepts in this branch</p>
                  ) : (
                    tree.map((node) => (
                      <ExportTreeNode
                        key={node.label}
                        node={node}
                        pathKey={`${branchKey}::${node.label}`}
                        depth={0}
                        collapsedNodes={collapsedNodes}
                        toggleCollapse={toggleCollapse}
                        selectedIriHash={selectedIriHash}
                        onSelectForDetail={onSelectForDetail}
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Recursive tree node renderer ---

interface ExportTreeNodeProps {
  node: HierarchyNode;
  pathKey: string;
  depth: number;
  collapsedNodes: Set<string>;
  toggleCollapse: (key: string) => void;
  selectedIriHash: string | null;
  onSelectForDetail: (iriHash: string) => void;
}

function ExportTreeNode({
  node,
  pathKey,
  depth,
  collapsedNodes,
  toggleCollapse,
  selectedIriHash,
  onSelectForDetail,
}: ExportTreeNodeProps) {
  const hasChildren = node.children.length > 0;
  const isCandidate = node.concept !== null;
  const isCollapsed = collapsedNodes.has(pathKey);
  const isDetailTarget = isCandidate && selectedIriHash === node.concept!.iri_hash;
  const isMapped = isCandidate && node.concept!.is_mapped;

  // Candidate leaf (no children)
  if (isCandidate && !hasChildren) {
    return (
      <div
        className={`flex cursor-pointer items-center gap-1.5 rounded py-1 pr-2 text-sm ${
          isDetailTarget
            ? 'bg-blue-50 ring-2 ring-blue-400'
            : isMapped
              ? 'text-gray-800 hover:bg-gray-50'
              : 'text-gray-500 hover:bg-gray-50'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelectForDetail(node.concept!.iri_hash)}
      >
        <span className={`text-xs ${isMapped ? 'text-gray-500' : 'text-gray-300'}`}>{'\u25CF'}</span>
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className={`truncate ${isMapped ? 'font-medium' : ''}`}>{node.label}</span>
          {node.concept!.score > 0 && <ConfidenceBadge score={node.concept!.score} />}
        </span>
      </div>
    );
  }

  // Candidate + parent (collapsible row with badge)
  if (isCandidate && hasChildren) {
    return (
      <div>
        <div
          className={`flex cursor-pointer items-center gap-1.5 rounded py-1 pr-2 text-sm ${
            isDetailTarget
              ? 'bg-blue-50 ring-2 ring-blue-400'
              : isMapped
                ? 'text-gray-800 hover:bg-gray-50'
                : 'text-gray-500 hover:bg-gray-50'
          }`}
          style={{ paddingLeft: `${depth * 16 + 4}px` }}
          onClick={() => onSelectForDetail(node.concept!.iri_hash)}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); toggleCollapse(pathKey); }}
            className="shrink-0 text-xs text-gray-400"
          >
            {isCollapsed ? '\u25B6' : '\u25BC'}
          </button>
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className={`truncate ${isMapped ? 'font-medium' : ''}`}>{node.label}</span>
            {node.concept!.score > 0 && <ConfidenceBadge score={node.concept!.score} />}
          </span>
        </div>
        {!isCollapsed && (
          <div className="ml-2">
            {node.children.map((child) => (
              <ExportTreeNode
                key={child.label}
                node={child}
                pathKey={`${pathKey}::${child.label}`}
                depth={depth + 1}
                collapsedNodes={collapsedNodes}
                toggleCollapse={toggleCollapse}
                selectedIriHash={selectedIriHash}
                onSelectForDetail={onSelectForDetail}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Structural node
  return (
    <div>
      <div
        className={`flex items-center gap-1.5 rounded py-1 text-sm text-gray-600 ${node.iriHash ? 'cursor-pointer hover:bg-gray-50' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
        onClick={() => node.iriHash && onSelectForDetail(node.iriHash)}
      >
        {hasChildren && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); toggleCollapse(pathKey); }}
            className="shrink-0 text-xs text-gray-400"
          >
            {isCollapsed ? '\u25B6' : '\u25BC'}
          </button>
        )}
        <span className="min-w-0 flex-1 text-left">{node.label}</span>
      </div>
      {hasChildren && !isCollapsed && (
        <div className="ml-2">
          {node.children.map((child) => (
            <ExportTreeNode
              key={child.label}
              node={child}
              pathKey={`${pathKey}::${child.label}`}
              depth={depth + 1}
              collapsedNodes={collapsedNodes}
              toggleCollapse={toggleCollapse}
              selectedIriHash={selectedIriHash}
              onSelectForDetail={onSelectForDetail}
            />
          ))}
        </div>
      )}
    </div>
  );
}
