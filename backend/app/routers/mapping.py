from fastapi import APIRouter, BackgroundTasks

from app.models.mapping_models import (
    BranchInfo,
    CandidateRequest,
    FolioStatus,
    MappingResponse,
)
from app.models.pipeline_models import (
    MandatoryFallbackRequest,
    MandatoryFallbackResponse,
)
from app.services.folio_service import (
    get_all_branches,
    get_folio_status,
    search_all_items,
    warmup_folio,
)
from app.services.pipeline.mandatory_fallback import run_mandatory_fallback

router = APIRouter(prefix="/api/mapping", tags=["mapping"])


@router.post("/candidates", response_model=MappingResponse)
async def get_candidates(body: CandidateRequest) -> MappingResponse:
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


@router.post("/mandatory-fallback", response_model=MandatoryFallbackResponse)
async def mandatory_fallback(body: MandatoryFallbackRequest) -> MandatoryFallbackResponse:
    """Find candidates for mandatory branches with no existing results."""
    fallback_results = await run_mandatory_fallback(
        item_text=body.item_text,
        branches=body.branches,
        llm_config=body.llm_config,
    )
    return MandatoryFallbackResponse(
        item_index=body.item_index,
        fallback_results=fallback_results,
    )
