"""LLM provider API endpoints."""

import logging

from fastapi import APIRouter

logger = logging.getLogger(__name__)

from app.models.llm_models import (
    ConnectionTestRequest,
    ConnectionTestResponse,
    ModelInfo,
    ModelListRequest,
)
from app.services.llm.registry import KNOWN_MODELS, get_provider

router = APIRouter(prefix="/api/llm", tags=["llm"])


@router.post("/test-connection", response_model=ConnectionTestResponse)
async def test_connection(req: ConnectionTestRequest) -> ConnectionTestResponse:
    """Test connectivity and credentials for a given LLM provider."""
    try:
        provider = get_provider(
            provider_type=req.provider,
            api_key=req.api_key,
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
            message="Connection test failed. Check your API key and provider settings.",
        )


@router.get("/known-models")
async def known_models() -> dict[str, list[ModelInfo]]:
    """Return well-known models for every provider (no API key needed)."""
    return {k.value: v for k, v in KNOWN_MODELS.items()}


@router.post("/models", response_model=list[ModelInfo])
async def list_models(req: ModelListRequest) -> list[ModelInfo]:
    """List available models for a given provider."""
    provider = get_provider(
        provider_type=req.provider,
        api_key=req.api_key,
        base_url=req.base_url,
    )
    return await provider.list_models()
