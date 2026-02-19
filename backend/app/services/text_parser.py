from __future__ import annotations

import re

from app.models.parse_models import ParseItem, ParseResult
from app.services.file_parser import parse_tabular
from app.services.hierarchy_detector import detect_hierarchy, parse_hierarchical


def _has_tabs(lines: list[str]) -> bool:
    """Return True if any non-blank line contains a tab character."""
    return any("\t" in line for line in lines if line.strip())


def _is_markdown_table(lines: list[str]) -> bool:
    """Return True if the text looks like a markdown table with a separator row."""
    pipe_lines = [line for line in lines if "|" in line and line.strip()]
    if len(pipe_lines) < 2:
        return False
    # Check for separator row: only |, -, :, spaces
    separator_pattern = re.compile(r"^[\s|:\-]+$")
    return any(separator_pattern.match(line) and "-" in line for line in pipe_lines)


def _parse_tab_delimited(lines: list[str]) -> list[list[str]]:
    """Split tab-delimited lines into rows of cells."""
    rows: list[list[str]] = []
    for line in lines:
        if not line.strip():
            continue
        cells = line.split("\t")
        # Strip each cell but preserve empty strings (they indicate hierarchy)
        rows.append([cell.strip() for cell in cells])
    return rows


def _expand_multi_value_rows(rows: list[list[str]]) -> list[list[str]]:
    """Expand rows where multiple cells are filled into separate rows.

    In hierarchical Excel paste data, a row like ["Parent", "Child"] means
    the parent is at column 0 and the first child is at column 1. We expand
    this into two rows: ["Parent", ""] and ["", "Child"] so that the tree
    builder processes each value at its correct depth.
    """
    expanded: list[list[str]] = []
    for row in rows:
        filled_indices = [i for i, cell in enumerate(row) if cell.strip()]
        if len(filled_indices) <= 1:
            expanded.append(row)
        else:
            for idx in filled_indices:
                new_row = [""] * len(row)
                new_row[idx] = row[idx]
                expanded.append(new_row)
    return expanded


def _parse_markdown_table(lines: list[str]) -> list[list[str]]:
    """Parse markdown table lines into rows of cells."""
    separator_pattern = re.compile(r"^[\s|:\-]+$")
    rows: list[list[str]] = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        # Skip separator rows
        if separator_pattern.match(stripped) and "-" in stripped:
            continue
        if "|" not in stripped:
            continue
        # Split on pipe, strip outer empty cells from leading/trailing pipes
        cells = stripped.split("|")
        # Remove first and last if empty (from leading/trailing |)
        if cells and not cells[0].strip():
            cells = cells[1:]
        if cells and not cells[-1].strip():
            cells = cells[:-1]
        rows.append([cell.strip() for cell in cells])
    return rows


def parse_text(text: str) -> ParseResult:
    """Parse free-form text input into items.

    Detects tab-delimited data and markdown tables and delegates to the
    tabular pipeline (with hierarchy detection). Falls back to one-item-per-line
    for plain text.
    """
    lines = text.splitlines()
    non_blank = [line for line in lines if line.strip()]

    if len(non_blank) == 0:
        return ParseResult(
            format="text_single",
            items=[],
            total_items=0,
        )

    # Tab-delimited detection (highest priority)
    if _has_tabs(non_blank):
        rows = _parse_tab_delimited(lines)
        if rows:
            if detect_hierarchy(rows):
                # Expand rows with multiple filled cells so each value
                # gets its own row at the correct depth, then parse
                # directly (skip header detection — text input has no headers)
                expanded = _expand_multi_value_rows(rows)
                return parse_hierarchical(expanded)
            return parse_tabular(rows)

    # Markdown table detection
    if _is_markdown_table(non_blank):
        rows = _parse_markdown_table(lines)
        if rows:
            if detect_hierarchy(rows):
                expanded = _expand_multi_value_rows(rows)
                return parse_hierarchical(expanded)
            return parse_tabular(rows)

    # Plain text fallback
    stripped = [line.strip() for line in lines if line.strip()]

    if len(stripped) == 1:
        return ParseResult(
            format="text_single",
            items=[ParseItem(text=stripped[0], index=0)],
            total_items=1,
        )

    items = [ParseItem(text=line, index=i) for i, line in enumerate(stripped)]
    return ParseResult(
        format="text_multi",
        items=items,
        total_items=len(items),
    )
