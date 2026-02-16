from __future__ import annotations

from pydantic import BaseModel


class TextRequest(BaseModel):
    text: str


class ParseItem(BaseModel):
    text: str
    index: int
    ancestry: list[str] = []


class HierarchyNode(BaseModel):
    label: str
    depth: int
    children: list[HierarchyNode] = []


class ParseResult(BaseModel):
    format: str  # "flat" | "hierarchical" | "text_single" | "text_multi"
    items: list[ParseItem]
    hierarchy: list[HierarchyNode] | None = None
    total_items: int
    headers: list[str] | None = None
    source_filename: str | None = None
    raw_preview: list[list[str]] | None = None
