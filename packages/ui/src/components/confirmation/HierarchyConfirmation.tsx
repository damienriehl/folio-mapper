import { useState } from 'react';
import type { HierarchyNode } from '@folio-mapper/core';

interface HierarchyConfirmationProps {
  hierarchy: HierarchyNode[];
  totalItems: number;
  onTreatAsFlat: () => void;
}

function TreeNode({ node, depth }: { node: HierarchyNode; depth: number }) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div
        className="flex items-center gap-1 rounded px-1 py-0.5 text-sm hover:bg-gray-50"
        style={{ paddingLeft: `${depth * 20}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-200 hover:text-gray-600"
            onClick={() => setExpanded(!expanded)}
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? '\u25BC' : '\u25B6'}
          </button>
        ) : (
          <span className="inline-block h-5 w-5 shrink-0" />
        )}
        <span className={hasChildren ? 'font-medium text-gray-700' : 'text-gray-800'}>
          {node.label}
        </span>
      </div>
      {hasChildren && expanded && (
        <div>
          {node.children.map((child, i) => (
            <TreeNode key={`${child.label}-${i}`} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function HierarchyConfirmation({
  hierarchy,
  totalItems,
  onTreatAsFlat,
}: HierarchyConfirmationProps) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {totalItems} leaf item{totalItems !== 1 ? 's' : ''} detected (hierarchical)
        </p>
        <button
          type="button"
          className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
          onClick={onTreatAsFlat}
        >
          Treat as flat list instead
        </button>
      </div>
      <div className="rounded-lg border border-gray-200 p-3">
        {hierarchy.map((node, i) => (
          <TreeNode key={`${node.label}-${i}`} node={node} depth={0} />
        ))}
      </div>
    </div>
  );
}
