from __future__ import annotations

from pydantic import BaseModel


class HierarchyPathEntryDict(BaseModel):
    label: str
    iri_hash: str


class ExportConcept(BaseModel):
    label: str
    iri: str
    iri_hash: str
    branch: str
    score: float
    definition: str | None = None
    translations: dict[str, str] = {}
    alternative_labels: list[str] = []
    examples: list[str] = []
    hierarchy_path: list[str] = []
    hierarchy_path_entries: list[HierarchyPathEntryDict] = []
    parent_iri_hash: str | None = None
    see_also: list[str] = []
    notes: str | None = None
    deprecated: bool = False
    is_mapped: bool = True
    mapping_source_text: str | None = None
    relationship: str | None = None  # "direct" | "sibling" | "ancestor" | "ontology"


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
    export_scope: str = "mapped_only"  # "mapped_only" | "mapped_with_related" | "full_ontology"
    branch_sort_mode: str = "default"  # "default" | "alphabetical" | "custom"
    custom_branch_order: list[str] = []
    include_tree_section: bool = True  # HTML format only
    include_table_section: bool = True  # HTML format only


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
