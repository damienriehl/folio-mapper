from __future__ import annotations

from pydantic import BaseModel


class ExportConcept(BaseModel):
    label: str
    iri: str
    iri_hash: str
    branch: str
    score: float
    definition: str | None = None
    translations: dict[str, str] = {}


class ExportRow(BaseModel):
    item_index: int
    source_text: str
    ancestry: list[str] = []
    selected_concepts: list[ExportConcept] = []
    note: str | None = None
    status: str = "pending"


class ExportOptions(BaseModel):
    format: str  # csv, excel, json, rdf_turtle, json_ld, markdown, html, pdf
    include_confidence: bool = True
    include_notes: bool = True
    include_reasoning: bool = False
    iri_format: str = "hash"  # hash, full_url, both
    languages: list[str] = []
    include_hierarchy: bool = True


class ExportRequest(BaseModel):
    rows: list[ExportRow]
    options: ExportOptions
    source_file: str | None = None
    session_created: str | None = None
    preview_rows: int | None = None


class ExportPreviewRow(BaseModel):
    source: str
    label: str
    iri: str
    branch: str
    confidence: float | None = None
    note: str | None = None
    translations: dict[str, str] = {}


class TranslationRequest(BaseModel):
    iri_hashes: list[str]
    languages: list[str]
