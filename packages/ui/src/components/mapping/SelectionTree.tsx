import { useState, useCallback } from 'react';
import type { BranchGroup, FolioCandidate } from '@folio-mapper/core';
import { ConfidenceBadge } from './ConfidenceBadge';

// --- Hierarchy tree data structure (same as CandidateTree) ---

interface HierarchyNode {
  label: string;
  iriHash: string | null;
  candidate: FolioCandidate | null;
  children: HierarchyNode[];
}

function buildHierarchyTree(candidates: FolioCandidate[]): HierarchyNode[] {
  const roots: HierarchyNode[] = [];

  for (const candidate of candidates) {
    // Skip the first element (branch root — already shown as the section header)
    const segments = candidate.hierarchy_path.slice(1);
    if (segments.length === 0) continue;

    let siblings = roots;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      let node = siblings.find((n) => n.label === seg.label);
      if (!node) {
        node = { label: seg.label, iriHash: seg.iri_hash, candidate: null, children: [] };
        siblings.push(node);
      }
      // Last segment → attach candidate
      if (i === segments.length - 1) {
        node.candidate = candidate;
      }
      siblings = node.children;
    }
  }

  return roots;
}

/** Keep only subtrees that contain at least one selected node. */
function pruneTree(nodes: HierarchyNode[], selectedSet: Set<string>): HierarchyNode[] {
  const result: HierarchyNode[] = [];
  for (const node of nodes) {
    const prunedChildren = pruneTree(node.children, selectedSet);
    const isSelected = node.iriHash !== null && selectedSet.has(node.iriHash);
    if (isSelected || prunedChildren.length > 0) {
      result.push({ ...node, children: prunedChildren });
    }
  }
  return result;
}

/** Count nodes whose iriHash is in the selected set. */
function countSelected(nodes: HierarchyNode[], selectedSet: Set<string>): number {
  let count = 0;
  for (const node of nodes) {
    if (node.iriHash && selectedSet.has(node.iriHash)) count++;
    count += countSelected(node.children, selectedSet);
  }
  return count;
}

// --- Component props ---

interface SelectionTreeProps {
  branchGroups: BranchGroup[];
  selectedIriHashes: string[];
  selectedCandidateIri: string | null;
  onSelectForDetail: (iriHash: string) => void;
}

export function SelectionTree({
  branchGroups,
  selectedIriHashes,
  selectedCandidateIri,
  onSelectForDetail,
}: SelectionTreeProps) {
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());

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

  const selectedSet = new Set(selectedIriHashes);

  // Build full tree from ALL candidates, then prune to selected branches
  const filteredGroups = branchGroups
    .map((group) => {
      const fullTree = buildHierarchyTree(group.candidates);
      const prunedTree = pruneTree(fullTree, selectedSet);
      const selectedCount = countSelected(prunedTree, selectedSet);
      return { branch: group.branch, branch_color: group.branch_color, prunedTree, selectedCount };
    })
    .filter((group) => group.prunedTree.length > 0);

  if (filteredGroups.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-gray-400">
        No candidates selected
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {filteredGroups.map((group) => {
        const branchKey = `sel::${group.branch}`;
        const isBranchCollapsed = collapsedNodes.has(branchKey);

        return (
          <div key={group.branch}>
            {/* Branch header */}
            <div
              className="flex w-full items-center gap-2 rounded-md border-l-4 px-3 py-1.5 text-left text-xs font-bold tracking-wide uppercase"
              style={{
                borderLeftColor: group.branch_color,
                backgroundColor: group.branch_color + '15',
                color: group.branch_color,
              }}
            >
              <button
                type="button"
                onClick={() => toggleCollapse(branchKey)}
                className="shrink-0"
                style={{ color: group.branch_color + '90' }}
                aria-label={isBranchCollapsed ? 'Expand branch' : 'Collapse branch'}
              >
                {isBranchCollapsed ? '\u25B6' : '\u25BC'}
              </button>
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: group.branch_color }}
              />
              <span>{group.branch}</span>
              <span style={{ color: group.branch_color + '80' }}>({group.selectedCount})</span>
            </div>

            {!isBranchCollapsed && (
              <div className="ml-4 border-l border-gray-100 pl-1">
                {group.prunedTree.map((node) => (
                  <SelectionNodeComponent
                    key={node.label}
                    node={node}
                    pathKey={`${branchKey}::${node.label}`}
                    depth={0}
                    collapsedNodes={collapsedNodes}
                    toggleCollapse={toggleCollapse}
                    selectedSet={selectedSet}
                    selectedCandidateIri={selectedCandidateIri}
                    onSelectForDetail={onSelectForDetail}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// --- Recursive tree node renderer (read-only, no checkboxes) ---

interface SelectionNodeComponentProps {
  node: HierarchyNode;
  pathKey: string;
  depth: number;
  collapsedNodes: Set<string>;
  toggleCollapse: (key: string) => void;
  selectedSet: Set<string>;
  selectedCandidateIri: string | null;
  onSelectForDetail: (iriHash: string) => void;
}

function SelectionNodeComponent({
  node,
  pathKey,
  depth,
  collapsedNodes,
  toggleCollapse,
  selectedSet,
  selectedCandidateIri,
  onSelectForDetail,
}: SelectionNodeComponentProps) {
  const hasChildren = node.children.length > 0;
  const isCandidate = node.candidate !== null;
  const isCollapsed = collapsedNodes.has(pathKey);
  const isSelected = node.iriHash !== null && selectedSet.has(node.iriHash);
  const isDetailTarget = isCandidate && selectedCandidateIri === node.candidate!.iri_hash;

  // Selected candidate leaf (no children) — bullet point + badge
  if (isCandidate && !hasChildren) {
    return (
      <div
        className={`flex cursor-pointer items-center gap-1.5 rounded py-1 pr-2 text-sm ${
          isDetailTarget ? 'bg-blue-100 ring-2 ring-blue-400' : 'text-gray-800 hover:bg-gray-50'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelectForDetail(node.candidate!.iri_hash)}
      >
        <span className="text-xs text-gray-400">{'\u25CF'}</span>
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate font-medium">{node.label}</span>
          <ConfidenceBadge score={node.candidate!.score} />
        </span>
      </div>
    );
  }

  // Candidate + parent — collapsible row with badge
  if (isCandidate && hasChildren) {
    return (
      <div>
        <div
          className={`flex cursor-pointer items-center gap-1.5 rounded py-1 pr-2 text-sm ${
            isDetailTarget ? 'bg-blue-100 ring-2 ring-blue-400' : 'text-gray-800 hover:bg-gray-50'
          }`}
          style={{ paddingLeft: `${depth * 16 + 4}px` }}
          onClick={() => onSelectForDetail(node.candidate!.iri_hash)}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); toggleCollapse(pathKey); }}
            className="shrink-0 text-xs text-gray-400"
          >
            {isCollapsed ? '\u25B6' : '\u25BC'}
          </button>
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className="truncate font-medium">{node.label}</span>
            <ConfidenceBadge score={node.candidate!.score} />
          </span>
        </div>
        {!isCollapsed && (
          <div className="ml-2">
            {node.children.map((child) => (
              <SelectionNodeComponent
                key={child.label}
                node={child}
                pathKey={`${pathKey}::${child.label}`}
                depth={depth + 1}
                collapsedNodes={collapsedNodes}
                toggleCollapse={toggleCollapse}
                selectedSet={selectedSet}
                selectedCandidateIri={selectedCandidateIri}
                onSelectForDetail={onSelectForDetail}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Structural node — all nodes with iriHash are clickable for detail
  return (
    <div>
      <div
        className={`flex items-center gap-1.5 rounded py-1 text-sm ${
          isSelected
            ? 'font-medium text-gray-900 bg-slate-100'
            : 'text-gray-500'
        } ${node.iriHash ? 'cursor-pointer hover:bg-gray-50' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
        onClick={() => node.iriHash ? onSelectForDetail(node.iriHash) : undefined}
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
        {!hasChildren && <span className="text-xs text-gray-400">{isSelected ? '\u25CF' : ''}</span>}
        <span className="min-w-0 flex-1 text-left">{node.label}</span>
      </div>
      {hasChildren && !isCollapsed && (
        <div className="ml-2">
          {node.children.map((child) => (
            <SelectionNodeComponent
              key={child.label}
              node={child}
              pathKey={`${pathKey}::${child.label}`}
              depth={depth + 1}
              collapsedNodes={collapsedNodes}
              toggleCollapse={toggleCollapse}
              selectedSet={selectedSet}
              selectedCandidateIri={selectedCandidateIri}
              onSelectForDetail={onSelectForDetail}
            />
          ))}
        </div>
      )}
    </div>
  );
}
