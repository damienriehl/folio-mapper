from __future__ import annotations

from pydantic import BaseModel

from app.models.parse_models import ParseItem


class CandidateRequest(BaseModel):
    items: list[ParseItem]
    threshold: float = 0.3
    max_per_branch: int = 10


class HierarchyPathEntry(BaseModel):
    label: str
    iri_hash: str


class FolioCandidate(BaseModel):
    label: str
    iri: str
    iri_hash: str
    definition: str | None = None
    synonyms: list[str] = []
    branch: str
    branch_color: str
    hierarchy_path: list[HierarchyPathEntry] = []
    score: float  # 0-100


class ConceptDetail(FolioCandidate):
    all_parents: list[HierarchyPathEntry] = []
    children: list[HierarchyPathEntry] = []
    siblings: list[HierarchyPathEntry] = []
    related: list[HierarchyPathEntry] = []
    examples: list[str] = []
    translations: dict[str, str] = {}


class BranchGroup(BaseModel):
    branch: str
    branch_color: str
    candidates: list[FolioCandidate] = []


class ItemMappingResult(BaseModel):
    item_index: int
    item_text: str
    branch_groups: list[BranchGroup] = []
    total_candidates: int = 0


class BranchInfo(BaseModel):
    name: str
    color: str
    concept_count: int


class MappingResponse(BaseModel):
    items: list[ItemMappingResult]
    total_items: int
    branches_available: list[BranchInfo] = []


class FolioStatus(BaseModel):
    loaded: bool
    concept_count: int = 0
    loading: bool = False
    error: str | None = None
