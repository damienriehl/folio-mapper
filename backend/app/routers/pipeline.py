"""Pipeline router: LLM-enhanced mapping endpoint."""

from fastapi import APIRouter

from app.models.pipeline_models import PipelineRequest, PipelineResponse
from app.services.pipeline import run_pipeline

router = APIRouter(prefix="/api/pipeline", tags=["pipeline"])


@router.post("/map", response_model=PipelineResponse)
async def pipeline_map(request: PipelineRequest) -> PipelineResponse:
    """Run the LLM-enhanced mapping pipeline (Stages 0→1→2).

    Falls back gracefully at each stage if LLM calls fail.
    """
    return await run_pipeline(
        items=request.items,
        llm_config=request.llm_config,
        threshold=request.threshold,
        max_per_branch=request.max_per_branch,
    )
