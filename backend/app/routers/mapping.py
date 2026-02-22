from fastapi import APIRouter, Depends, HTTPException, Request

from app.rate_limit import limiter

from app.models.graph_models import EntityGraphResponse
from app.models.mapping_models import (
    BranchInfo,
    CandidateRequest,
    ConceptDetail,
    FolioCandidate,
    FolioStatus,
    MappingResponse,
)
from app.models.pipeline_models import (
    MandatoryFallbackRequest,
    MandatoryFallbackResponse,
)
from app.services.auth import extract_api_key
from app.services.folio_service import (
    build_entity_graph,
    get_all_branches,
    get_folio_status,
    lookup_concept,
    lookup_concept_detail,
    search_all_items,
    warmup_folio,
)
from app.services.pipeline.mandatory_fallback import run_mandatory_fallback

router = APIRouter(prefix="/api/mapping", tags=["mapping"])


@router.post("/candidates", response_model=MappingResponse)
@limiter.limit("60/minute")
async def get_candidates(request: Request, body: CandidateRequest) -> MappingResponse:
    """Search FOLIO for candidate mappings for all items."""
    item_results = search_all_items(
        items=body.items,
        threshold=body.threshold,
        max_per_branch=body.max_per_branch,
    )
    branches = get_all_branches()

    return MappingResponse(
        items=item_results,
        total_items=len(body.items),
        branches_available=branches,
    )


@router.get("/status", response_model=FolioStatus)
async def folio_status() -> FolioStatus:
    """Check whether the FOLIO ontology is loaded."""
    return get_folio_status()


@router.post("/warmup", response_model=FolioStatus)
async def folio_warmup() -> FolioStatus:
    """Trigger FOLIO ontology loading in background."""
    return await warmup_folio()


@router.get("/branches", response_model=list[BranchInfo])
async def list_branches() -> list[BranchInfo]:
    """List all FOLIO branches with colors and concept counts."""
    return get_all_branches()


@router.get("/concept/{iri_hash}", response_model=FolioCandidate)
async def get_concept(iri_hash: str) -> FolioCandidate:
    """Look up a single FOLIO concept by IRI hash."""
    result = lookup_concept(iri_hash)
    if result is None:
        raise HTTPException(status_code=404, detail="Concept not found")
    return result


@router.get("/concept/{iri_hash}/detail", response_model=ConceptDetail)
async def get_concept_detail(iri_hash: str) -> ConceptDetail:
    """Look up a single FOLIO concept with extended detail (children, siblings, related, etc.)."""
    result = lookup_concept_detail(iri_hash)
    if result is None:
        raise HTTPException(status_code=404, detail="Concept not found")
    return result


@router.get("/concept/{iri_hash}/graph", response_model=EntityGraphResponse)
@limiter.limit("30/minute")
async def get_concept_graph(
    request: Request,
    iri_hash: str,
    ancestors_depth: int = 2,
    descendants_depth: int = 2,
    max_nodes: int = 200,
    include_see_also: bool = True,
) -> EntityGraphResponse:
    """Build a multi-hop entity graph around a FOLIO concept."""
    result = build_entity_graph(
        iri_hash,
        ancestors_depth=min(ancestors_depth, 5),
        descendants_depth=min(descendants_depth, 5),
        max_nodes=min(max_nodes, 500),
        include_see_also=include_see_also,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Concept not found")
    return result


@router.post("/mandatory-fallback", response_model=MandatoryFallbackResponse)
@limiter.limit("20/minute")
async def mandatory_fallback(
    body: MandatoryFallbackRequest,
    request: Request,
    api_key: str | None = Depends(extract_api_key),
) -> MandatoryFallbackResponse:
    """Find candidates for mandatory branches with no existing results."""
    fallback_results = await run_mandatory_fallback(
        item_text=body.item_text,
        branches=body.branches,
        llm_config=body.llm_config,
        api_key=api_key,
    )
    return MandatoryFallbackResponse(
        item_index=body.item_index,
        fallback_results=fallback_results,
    )
