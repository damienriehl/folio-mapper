"""Synthetic data generation router."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request

from app.models.synthetic_models import SyntheticRequest, SyntheticResponse
from app.rate_limit import limiter
from app.services.auth import extract_api_key
from app.services.synthetic_generator import generate_synthetic_data

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/synthetic", tags=["synthetic"])


@router.post("/generate", response_model=SyntheticResponse)
@limiter.limit("10/minute")
async def synthetic_generate(
    body: SyntheticRequest,
    request: Request,
    api_key: str | None = Depends(extract_api_key),
) -> SyntheticResponse:
    """Generate synthetic legal taxonomy data for debugging and demos."""
    try:
        return await generate_synthetic_data(
            count=body.count,
            llm_config=body.llm_config,
            api_key=api_key,
        )
    except Exception as exc:
        logger.exception("Synthetic generation failed")
        raise HTTPException(status_code=500, detail="Synthetic generation failed") from exc
