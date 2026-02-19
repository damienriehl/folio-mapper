"""LLM provider API endpoints."""

import logging

from fastapi import APIRouter, Depends, Request

from app.models.llm_models import (
    ConnectionTestRequest,
    ConnectionTestResponse,
    ModelInfo,
    ModelListRequest,
)
from app.rate_limit import limiter
from app.services.auth import extract_api_key
from app.services.llm.registry import KNOWN_MODELS, get_provider

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/llm", tags=["llm"])


@router.post("/test-connection", response_model=ConnectionTestResponse)
@limiter.limit("20/minute")
async def test_connection(
    req: ConnectionTestRequest,
    request: Request,
    api_key: str | None = Depends(extract_api_key),
) -> ConnectionTestResponse:
    """Test connectivity and credentials for a given LLM provider."""
    try:
        provider = get_provider(
            provider_type=req.provider,
            api_key=api_key,
            base_url=req.base_url,
            model=req.model,
        )
        success = await provider.test_connection()
        return ConnectionTestResponse(
            success=success,
            message="Connection successful" if success else "Connection failed",
            model=req.model,
        )
    except Exception as exc:
        logger.exception("Connection test failed for provider %s", req.provider)
        return ConnectionTestResponse(
            success=False,
            message="Connection test failed",
        )


@router.get("/known-models")
async def known_models() -> dict[str, list[ModelInfo]]:
    """Return well-known models for every provider (no API key needed)."""
    return {k.value: v for k, v in KNOWN_MODELS.items()}


@router.post("/models", response_model=list[ModelInfo])
@limiter.limit("20/minute")
async def list_models(
    req: ModelListRequest,
    request: Request,
    api_key: str | None = Depends(extract_api_key),
) -> list[ModelInfo]:
    """List available models for a given provider."""
    provider = get_provider(
        provider_type=req.provider,
        api_key=api_key,
        base_url=req.base_url,
    )
    return await provider.list_models()
