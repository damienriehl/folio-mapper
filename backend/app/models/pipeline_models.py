"""Pydantic models for the LLM-powered mapping pipeline (Stages 0-3)."""

from __future__ import annotations

from pydantic import BaseModel

from app.models.llm_models import LLMConfig
from app.models.mapping_models import FolioCandidate, MappingResponse
from app.models.parse_models import ParseItem


# --- Stage 0: Pre-Scan ---

class PreScanSegment(BaseModel):
    text: str
    branches: list[str] = []
    reasoning: str = ""


class PreScanResult(BaseModel):
    segments: list[PreScanSegment]
    raw_text: str


# --- Stage 1: Scoped Candidates ---

class ScopedCandidate(BaseModel):
    iri_hash: str
    label: str
    definition: str | None = None
    synonyms: list[str] = []
    branch: str
    score: float  # 0-100 local relevance score
    source_branches: list[str] = []  # branches that surfaced this candidate


# --- Stage 2: Ranked Candidates ---

class RankedCandidate(BaseModel):
    iri_hash: str
    score: float  # 0-100 LLM ranking score
    reasoning: str = ""


# --- Stage 3: Judge Validation ---

class JudgedCandidate(BaseModel):
    iri_hash: str
    original_score: float  # score from Stage 2
    adjusted_score: float  # score after judge validation
    verdict: str  # "confirmed", "boosted", "penalized", "rejected"
    reasoning: str = ""


# --- Pipeline metadata (per item) ---

class PipelineItemMetadata(BaseModel):
    item_index: int
    item_text: str
    prescan: PreScanResult
    stage1_candidate_count: int
    stage2_candidate_count: int
    stage3_judged_count: int = 0
    stage3_boosted: int = 0
    stage3_penalized: int = 0
    stage3_rejected: int = 0


# --- Request / Response ---

class PipelineRequest(BaseModel):
    items: list[ParseItem]
    llm_config: LLMConfig
    threshold: float = 0.3
    max_per_branch: int = 10


class PipelineResponse(BaseModel):
    mapping: MappingResponse
    pipeline_metadata: list[PipelineItemMetadata]


# --- Mandatory Fallback ---

class MandatoryFallbackRequest(BaseModel):
    item_text: str
    item_index: int
    branches: list[str]
    llm_config: LLMConfig | None = None


class BranchFallbackResult(BaseModel):
    branch: str
    branch_color: str
    candidates: list[FolioCandidate] = []


class MandatoryFallbackResponse(BaseModel):
    item_index: int
    fallback_results: list[BranchFallbackResult]
