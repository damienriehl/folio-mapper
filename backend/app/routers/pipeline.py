"""Pipeline router: LLM-enhanced mapping endpoint."""

from fastapi import APIRouter, Depends, Request

from app.models.pipeline_models import PipelineRequest, PipelineResponse
from app.rate_limit import limiter
from app.services.auth import extract_api_key
from app.services.pipeline import run_pipeline

router = APIRouter(prefix="/api/pipeline", tags=["pipeline"])


@router.post("/map", response_model=PipelineResponse)
@limiter.limit("20/minute")
async def pipeline_map(
    body: PipelineRequest,
    request: Request,
    api_key: str | None = Depends(extract_api_key),
) -> PipelineResponse:
    """Run the LLM-enhanced mapping pipeline (Stages 0->1->2).

    Falls back gracefully at each stage if LLM calls fail.
    """
    return await run_pipeline(
        items=body.items,
        llm_config=body.llm_config,
        threshold=body.threshold,
        max_per_branch=body.max_per_branch,
        api_key=api_key,
        mandatory_branches=body.mandatory_branches,
    )
