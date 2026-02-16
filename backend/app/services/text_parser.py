from __future__ import annotations

from app.models.parse_models import ParseItem, ParseResult


def parse_text(text: str) -> ParseResult:
    """Parse free-form text input into items (one per non-blank line)."""
    lines = [line.strip() for line in text.splitlines() if line.strip()]

    if len(lines) == 0:
        return ParseResult(
            format="text_single",
            items=[],
            total_items=0,
        )

    if len(lines) == 1:
        return ParseResult(
            format="text_single",
            items=[ParseItem(text=lines[0], index=0)],
            total_items=1,
        )

    items = [ParseItem(text=line, index=i) for i, line in enumerate(lines)]
    return ParseResult(
        format="text_multi",
        items=items,
        total_items=len(items),
    )
