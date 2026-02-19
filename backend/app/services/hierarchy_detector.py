from __future__ import annotations

from app.models.parse_models import HierarchyNode, ParseItem, ParseResult


def _indent_level(row: list[str]) -> int:
    """Return the index of the first non-empty cell."""
    for i, cell in enumerate(row):
        if cell.strip():
            return i
    return len(row)


def _non_empty_count(row: list[str]) -> int:
    return sum(1 for c in row if c.strip())


def detect_hierarchy(rows: list[list[str]]) -> bool:
    """Determine if tabular data represents a hierarchical structure.

    Criteria (from PRD FR-3.1.2):
    - Multiple columns exist (>1)
    - >=3 rows have indent level > 0
    - >=60% of rows have exactly one non-empty cell
    - >=2 distinct indent levels
    """
    if not rows:
        return False

    max_cols = max(len(r) for r in rows)
    if max_cols <= 1:
        return False

    # Filter out completely blank rows
    non_blank = [r for r in rows if any(c.strip() for c in r)]
    if len(non_blank) < 2:
        return False

    # Scan first 20 non-blank rows
    sample = non_blank[:20]

    indent_levels: set[int] = set()
    rows_with_indent = 0
    rows_single_value = 0

    for row in sample:
        level = _indent_level(row)
        indent_levels.add(level)
        if level > 0:
            rows_with_indent += 1
        if _non_empty_count(row) == 1:
            rows_single_value += 1

    single_value_ratio = rows_single_value / len(sample) if sample else 0

    return (
        rows_with_indent >= 3
        and single_value_ratio >= 0.6
        and len(indent_levels) >= 2
    )


def build_tree(rows: list[list[str]]) -> list[HierarchyNode]:
    """Build a tree from hierarchical tabular data using a stack-based approach."""
    # Virtual root
    root_children: list[HierarchyNode] = []
    # Stack of (depth, node) — we track root implicitly
    stack: list[tuple[int, HierarchyNode]] = []

    for row in rows:
        if not any(c.strip() for c in row):
            continue  # skip blank rows

        depth = _indent_level(row)
        # Get the label: first non-empty cell
        label = ""
        for cell in row:
            if cell.strip():
                label = cell.strip()
                break

        if not label:
            continue

        node = HierarchyNode(label=label, depth=depth)

        # Pop stack until we find a parent with depth < current
        while stack and stack[-1][0] >= depth:
            stack.pop()

        if stack:
            stack[-1][1].children.append(node)
        else:
            root_children.append(node)

        stack.append((depth, node))

    return root_children


def _collect_all_nodes(
    nodes: list[HierarchyNode], ancestry: list[str]
) -> list[ParseItem]:
    """Recursively collect all nodes (parents and leaves) with their ancestry paths."""
    items: list[ParseItem] = []
    for node in nodes:
        items.append(
            ParseItem(
                text=node.label,
                index=0,  # will be re-indexed
                ancestry=ancestry,
            )
        )
        if node.children:
            items.extend(_collect_all_nodes(node.children, ancestry + [node.label]))
    return items


def parse_hierarchical(
    rows: list[list[str]],
    headers: list[str] | None = None,
    filename: str | None = None,
) -> ParseResult:
    """Parse tabular data detected as hierarchical into a tree + all items."""
    tree = build_tree(rows)
    all_items = _collect_all_nodes(tree, [])
    # Re-index
    for i, item in enumerate(all_items):
        item.index = i

    raw_preview = rows[:5] if rows else None

    return ParseResult(
        format="hierarchical",
        items=all_items,
        hierarchy=tree,
        total_items=len(all_items),
        headers=headers,
        source_filename=filename,
        raw_preview=raw_preview,
    )
