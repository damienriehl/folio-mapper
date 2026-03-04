/**
 * Pure utility functions for incremental tree expand/collapse.
 *
 * Keys follow the `branch::child1::child2` convention used by CandidateTree
 * and ExportTree. Depth 0 = branch header, depth 1 = first-level children, etc.
 */

export interface CollapsibleEntry {
  key: string;
  depth: number;
}

/** Walk a labeled-node tree and collect every collapsible key (nodes with children). */
export function collectAllCollapsibleKeys(
  branches: Array<{ branch: string; tree: Array<{ label: string; children: unknown[] }> }>,
): CollapsibleEntry[] {
  const entries: CollapsibleEntry[] = [];

  function walk(
    nodes: Array<{ label: string; children: unknown[] }>,
    prefix: string,
    depth: number,
  ) {
    for (const node of nodes) {
      const children = node.children as Array<{ label: string; children: unknown[] }>;
      if (children.length > 0) {
        const key = `${prefix}::${node.label}`;
        entries.push({ key, depth });
        walk(children, key, depth + 1);
      }
    }
  }

  for (const b of branches) {
    // Branch header itself is always collapsible (depth 0)
    entries.push({ key: b.branch, depth: 0 });
    walk(b.tree, b.branch, 1);
  }

  return entries;
}

/** True if any ancestor prefix of `key` is in `collapsedNodes`. */
export function isAncestorCollapsed(key: string, collapsedNodes: Set<string>): boolean {
  const parts = key.split('::');
  // Check every proper prefix (not the key itself)
  for (let i = 1; i < parts.length; i++) {
    const prefix = parts.slice(0, i).join('::');
    if (collapsedNodes.has(prefix)) return true;
  }
  return false;
}

/**
 * Expand one level: find the shallowest depth that has collapsed keys,
 * and remove those keys from the collapsed set.
 */
export function expandOneLevel(
  collapsedNodes: Set<string>,
  allCollapsible: CollapsibleEntry[],
): Set<string> {
  if (collapsedNodes.size === 0) return collapsedNodes;

  // Find min depth among collapsed keys
  let minDepth = Infinity;
  for (const entry of allCollapsible) {
    if (collapsedNodes.has(entry.key) && entry.depth < minDepth) {
      minDepth = entry.depth;
    }
  }
  if (minDepth === Infinity) return collapsedNodes;

  const next = new Set(collapsedNodes);
  for (const entry of allCollapsible) {
    if (entry.depth === minDepth && next.has(entry.key)) {
      next.delete(entry.key);
    }
  }
  return next;
}

/**
 * Collapse one level: find the deepest depth among *visible* expanded keys,
 * and add those keys to the collapsed set.
 */
export function collapseOneLevel(
  collapsedNodes: Set<string>,
  allCollapsible: CollapsibleEntry[],
): Set<string> {
  // Find max depth among visible, expanded keys
  let maxDepth = -1;
  for (const entry of allCollapsible) {
    if (
      !collapsedNodes.has(entry.key) &&
      !isAncestorCollapsed(entry.key, collapsedNodes) &&
      entry.depth > maxDepth
    ) {
      maxDepth = entry.depth;
    }
  }
  if (maxDepth < 0) return collapsedNodes;

  const next = new Set(collapsedNodes);
  for (const entry of allCollapsible) {
    if (
      entry.depth === maxDepth &&
      !next.has(entry.key) &&
      !isAncestorCollapsed(entry.key, next)
    ) {
      next.add(entry.key);
    }
  }
  return next;
}

/** Collapse all collapsible nodes (returns set of ALL collapsible keys). */
export function collapseAll(allCollapsible: CollapsibleEntry[]): Set<string> {
  return new Set(allCollapsible.map((e) => e.key));
}
