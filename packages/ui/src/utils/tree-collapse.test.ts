import { describe, it, expect } from 'vitest';
import {
  collectAllCollapsibleKeys,
  isAncestorCollapsed,
  expandOneLevel,
  collapseOneLevel,
  collapseAll,
} from './tree-collapse';

// Helper to build a simple tree node
function node(label: string, children: Array<{ label: string; children: unknown[] }> = []) {
  return { label, children };
}

describe('collectAllCollapsibleKeys', () => {
  it('returns empty for empty input', () => {
    expect(collectAllCollapsibleKeys([])).toEqual([]);
  });

  it('returns branch key for a branch with no sub-children', () => {
    const result = collectAllCollapsibleKeys([
      { branch: 'Criminal', tree: [node('Theft')] },
    ]);
    // Branch header is collapsible; leaf "Theft" has no children, so not collapsible
    expect(result).toEqual([{ key: 'Criminal', depth: 0 }]);
  });

  it('collects nested collapsible keys with correct depths', () => {
    const result = collectAllCollapsibleKeys([
      {
        branch: 'Civil',
        tree: [
          node('Torts', [
            node('Negligence', [node('Medical')]),
          ]),
        ],
      },
    ]);
    expect(result).toEqual([
      { key: 'Civil', depth: 0 },
      { key: 'Civil::Torts', depth: 1 },
      { key: 'Civil::Torts::Negligence', depth: 2 },
    ]);
  });

  it('handles multiple branches', () => {
    const result = collectAllCollapsibleKeys([
      { branch: 'A', tree: [node('A1', [node('A1a')])] },
      { branch: 'B', tree: [node('B1')] },
    ]);
    const keys = result.map((e) => e.key);
    expect(keys).toContain('A');
    expect(keys).toContain('A::A1');
    expect(keys).toContain('B');
    expect(keys).not.toContain('A::A1::A1a'); // leaf, not collapsible
    expect(keys).not.toContain('B::B1'); // leaf, not collapsible
  });
});

describe('isAncestorCollapsed', () => {
  it('returns false for top-level key', () => {
    expect(isAncestorCollapsed('Criminal', new Set(['Criminal']))).toBe(false);
  });

  it('returns true if parent is collapsed', () => {
    expect(isAncestorCollapsed('Criminal::Theft', new Set(['Criminal']))).toBe(true);
  });

  it('returns true if grandparent is collapsed', () => {
    expect(isAncestorCollapsed('A::B::C', new Set(['A']))).toBe(true);
  });

  it('returns false if only sibling is collapsed', () => {
    expect(isAncestorCollapsed('A::B', new Set(['A::C']))).toBe(false);
  });
});

describe('expandOneLevel', () => {
  it('is no-op when nothing is collapsed', () => {
    const all = [{ key: 'A', depth: 0 }, { key: 'A::B', depth: 1 }];
    const result = expandOneLevel(new Set(), all);
    expect(result.size).toBe(0);
  });

  it('expands shallowest collapsed depth', () => {
    const all = [
      { key: 'A', depth: 0 },
      { key: 'B', depth: 0 },
      { key: 'A::X', depth: 1 },
    ];
    const collapsed = new Set(['A', 'B', 'A::X']);
    const result = expandOneLevel(collapsed, all);
    // depth 0 keys removed
    expect(result.has('A')).toBe(false);
    expect(result.has('B')).toBe(false);
    // depth 1 still collapsed
    expect(result.has('A::X')).toBe(true);
  });
});

describe('collapseOneLevel', () => {
  it('is no-op when everything is collapsed', () => {
    const all = [{ key: 'A', depth: 0 }];
    const result = collapseOneLevel(new Set(['A']), all);
    expect(result).toEqual(new Set(['A']));
  });

  it('collapses deepest visible expanded depth', () => {
    const all = [
      { key: 'A', depth: 0 },
      { key: 'A::B', depth: 1 },
      { key: 'A::B::C', depth: 2 },
    ];
    const result = collapseOneLevel(new Set(), all);
    // depth 2 should be collapsed
    expect(result.has('A::B::C')).toBe(true);
    expect(result.has('A')).toBe(false);
    expect(result.has('A::B')).toBe(false);
  });

  it('skips nodes hidden under collapsed parents', () => {
    const all = [
      { key: 'A', depth: 0 },
      { key: 'A::B', depth: 1 },
      { key: 'A::B::C', depth: 2 },
      { key: 'X', depth: 0 },
    ];
    // A is collapsed, so A::B and A::B::C are invisible
    const collapsed = new Set(['A']);
    const result = collapseOneLevel(collapsed, all);
    // X is the only visible expanded key at depth 0
    expect(result.has('X')).toBe(true);
    expect(result.has('A')).toBe(true);
  });
});

describe('collapseAll', () => {
  it('returns set of all collapsible keys', () => {
    const all = [
      { key: 'A', depth: 0 },
      { key: 'A::B', depth: 1 },
      { key: 'C', depth: 0 },
    ];
    const result = collapseAll(all);
    expect(result).toEqual(new Set(['A', 'A::B', 'C']));
  });

  it('returns empty set for empty input', () => {
    expect(collapseAll([])).toEqual(new Set());
  });
});

describe('round-trip: collapse-all then expand-one-level repeatedly', () => {
  it('fully expands after enough one-level expansions', () => {
    const all = [
      { key: 'A', depth: 0 },
      { key: 'A::B', depth: 1 },
      { key: 'A::B::C', depth: 2 },
      { key: 'X', depth: 0 },
    ];
    let collapsed = collapseAll(all);
    expect(collapsed.size).toBe(4);

    // Expand one level at a time
    collapsed = expandOneLevel(collapsed, all); // removes depth 0
    expect(collapsed.has('A')).toBe(false);
    expect(collapsed.has('X')).toBe(false);
    expect(collapsed.size).toBe(2); // A::B, A::B::C

    collapsed = expandOneLevel(collapsed, all); // removes depth 1
    expect(collapsed.has('A::B')).toBe(false);
    expect(collapsed.size).toBe(1); // A::B::C

    collapsed = expandOneLevel(collapsed, all); // removes depth 2
    expect(collapsed.size).toBe(0); // fully expanded
  });
});
