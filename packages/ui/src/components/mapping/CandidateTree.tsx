import { useState, useCallback } from 'react';
import type { BranchGroup, BranchState, FolioCandidate } from '@folio-mapper/core';
import { ConfidenceBadge } from './ConfidenceBadge';

// --- Hierarchy tree data structure ---

interface HierarchyNode {
  label: string;
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
      let node = siblings.find((n) => n.label === seg);
      if (!node) {
        node = { label: seg, candidate: null, children: [] };
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

// --- Component props ---

interface CandidateTreeProps {
  branchGroups: BranchGroup[];
  branchStates: Record<string, BranchState>;
  selectedIriHashes: string[];
  selectedCandidateIri: string | null;
  threshold: number;
  onToggleCandidate: (iriHash: string) => void;
  onSelectForDetail: (iriHash: string) => void;
}

export function CandidateTree({
  branchGroups,
  branchStates,
  selectedIriHashes,
  selectedCandidateIri,
  threshold,
  onToggleCandidate,
  onSelectForDetail,
}: CandidateTreeProps) {
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

  const visibleGroups = branchGroups.filter((g) => branchStates[g.branch] !== 'excluded');

  if (visibleGroups.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-gray-400">
        No candidates match the current filters
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {visibleGroups.map((group) => {
        const branchKey = group.branch;
        const isBranchCollapsed = collapsedNodes.has(branchKey);
        const visibleCandidates = group.candidates.filter((c) => c.score >= threshold);
        const tree = buildHierarchyTree(visibleCandidates);

        return (
          <div key={group.branch}>
            {/* Branch header */}
            <button
              type="button"
              onClick={() => toggleCollapse(branchKey)}
              className="flex w-full items-center gap-2 rounded-md border-l-4 px-3 py-1.5 text-left text-xs font-bold tracking-wide uppercase"
              style={{
                borderLeftColor: group.branch_color,
                backgroundColor: group.branch_color + '15',
                color: group.branch_color,
              }}
            >
              <span style={{ color: group.branch_color + '90' }}>
                {isBranchCollapsed ? '\u25B6' : '\u25BC'}
              </span>
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: group.branch_color }}
              />
              <span>{group.branch}</span>
              <span style={{ color: group.branch_color + '80' }}>({visibleCandidates.length})</span>
            </button>

            {!isBranchCollapsed && (
              <div className="ml-4 border-l border-gray-100 pl-1">
                {tree.length === 0 ? (
                  <p className="py-1 text-xs text-gray-400">
                    No candidates above threshold ({threshold})
                  </p>
                ) : (
                  tree.map((node) => (
                    <HierarchyNodeComponent
                      key={node.label}
                      node={node}
                      pathKey={`${branchKey}::${node.label}`}
                      depth={0}
                      collapsedNodes={collapsedNodes}
                      toggleCollapse={toggleCollapse}
                      selectedIriHashes={selectedIriHashes}
                      selectedCandidateIri={selectedCandidateIri}
                      onToggleCandidate={onToggleCandidate}
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
  );
}

// --- Recursive tree node renderer ---

interface HierarchyNodeComponentProps {
  node: HierarchyNode;
  pathKey: string;
  depth: number;
  collapsedNodes: Set<string>;
  toggleCollapse: (key: string) => void;
  selectedIriHashes: string[];
  selectedCandidateIri: string | null;
  onToggleCandidate: (iriHash: string) => void;
  onSelectForDetail: (iriHash: string) => void;
}

function HierarchyNodeComponent({
  node,
  pathKey,
  depth,
  collapsedNodes,
  toggleCollapse,
  selectedIriHashes,
  selectedCandidateIri,
  onToggleCandidate,
  onSelectForDetail,
}: HierarchyNodeComponentProps) {
  const hasChildren = node.children.length > 0;
  const isCandidate = node.candidate !== null;
  const isCollapsed = collapsedNodes.has(pathKey);

  const isSelected = isCandidate && selectedIriHashes.includes(node.candidate!.iri_hash);
  const isDetailTarget = isCandidate && selectedCandidateIri === node.candidate!.iri_hash;

  // Candidate leaf (no children) — bullet point
  if (isCandidate && !hasChildren) {
    return (
      <CandidateLeaf
        node={node}
        depth={depth}
        isSelected={isSelected}
        isDetailTarget={isDetailTarget}
        onToggleCandidate={onToggleCandidate}
        onSelectForDetail={onSelectForDetail}
      />
    );
  }

  // Candidate + parent — collapsible row with checkbox and badge
  if (isCandidate && hasChildren) {
    return (
      <div>
        <div
          className={`flex items-center gap-1.5 rounded py-1 pr-2 text-sm ${
            isSelected
              ? 'bg-slate-700 text-white'
              : 'bg-gray-200 text-gray-800'
          } ${isDetailTarget ? 'ring-2 ring-blue-400' : ''}`}
          style={{ paddingLeft: `${depth * 4 + 4}px` }}
        >
          <button
            type="button"
            onClick={() => toggleCollapse(pathKey)}
            className={`shrink-0 text-xs ${isSelected ? 'text-gray-300' : 'text-gray-500'}`}
          >
            {isCollapsed ? '\u25B6' : '\u25BC'}
          </button>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleCandidate(node.candidate!.iri_hash)}
            className="h-3.5 w-3.5 shrink-0 rounded border-gray-300"
          />
          <button
            type="button"
            onClick={() => onSelectForDetail(node.candidate!.iri_hash)}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            <span className="truncate font-medium">{node.label}</span>
            <ConfidenceBadge score={node.candidate!.score} />
          </button>
        </div>
        {!isCollapsed && (
          <div className="ml-2">
            {node.children.map((child) => (
              <HierarchyNodeComponent
                key={child.label}
                node={child}
                pathKey={`${pathKey}::${child.label}`}
                depth={depth + 1}
                collapsedNodes={collapsedNodes}
                toggleCollapse={toggleCollapse}
                selectedIriHashes={selectedIriHashes}
                selectedCandidateIri={selectedCandidateIri}
                onToggleCandidate={onToggleCandidate}
                onSelectForDetail={onSelectForDetail}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Structural node (not a candidate, has children) — disclosure triangle, plain text
  return (
    <div>
      <button
        type="button"
        onClick={() => toggleCollapse(pathKey)}
        className="flex w-full items-center gap-1.5 rounded py-1 text-left text-sm text-gray-600 hover:bg-gray-50"
        style={{ paddingLeft: `${depth * 4 + 4}px` }}
      >
        <span className="text-xs text-gray-400">{isCollapsed ? '\u25B6' : '\u25BC'}</span>
        <span>{node.label}</span>
      </button>
      {!isCollapsed && (
        <div className="ml-2">
          {node.children.map((child) => (
            <HierarchyNodeComponent
              key={child.label}
              node={child}
              pathKey={`${pathKey}::${child.label}`}
              depth={depth + 1}
              collapsedNodes={collapsedNodes}
              toggleCollapse={toggleCollapse}
              selectedIriHashes={selectedIriHashes}
              selectedCandidateIri={selectedCandidateIri}
              onToggleCandidate={onToggleCandidate}
              onSelectForDetail={onSelectForDetail}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// --- Candidate leaf row ---

interface CandidateLeafProps {
  node: HierarchyNode;
  depth: number;
  isSelected: boolean;
  isDetailTarget: boolean;
  onToggleCandidate: (iriHash: string) => void;
  onSelectForDetail: (iriHash: string) => void;
}

function CandidateLeaf({
  node,
  depth,
  isSelected,
  isDetailTarget,
  onToggleCandidate,
  onSelectForDetail,
}: CandidateLeafProps) {
  const candidate = node.candidate!;

  return (
    <div
      className={`flex items-center gap-1.5 rounded py-1 pr-2 text-sm ${
        isSelected
          ? 'bg-slate-700 text-white'
          : 'bg-gray-200 text-gray-800'
      } ${isDetailTarget ? 'ring-2 ring-blue-400' : ''}`}
      style={{ paddingLeft: `${depth * 4 + 8}px` }}
    >
      <span className={`text-xs ${isSelected ? 'text-gray-300' : 'text-gray-500'}`}>●</span>
      <input
        type="checkbox"
        checked={isSelected}
        onChange={() => onToggleCandidate(candidate.iri_hash)}
        className="h-3.5 w-3.5 shrink-0 rounded border-gray-300"
      />
      <button
        type="button"
        onClick={() => onSelectForDetail(candidate.iri_hash)}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <span className="truncate font-medium">{candidate.label}</span>
        <ConfidenceBadge score={candidate.score} />
      </button>
    </div>
  );
}
