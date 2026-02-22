"""Embedding service router: status and warmup endpoints."""

import asyncio

from fastapi import APIRouter, Request

from app.models.embedding_models import EmbeddingStatus
from app.rate_limit import limiter
from app.services.embedding.service import (
    build_embedding_index,
    get_embedding_status,
)

router = APIRouter(prefix="/api/embedding", tags=["embedding"])


@router.get("/status", response_model=EmbeddingStatus)
@limiter.limit("60/minute")
async def embedding_status(request: Request) -> EmbeddingStatus:
    """Return the current embedding service status."""
    return get_embedding_status()


@router.post("/warmup", response_model=EmbeddingStatus)
@limiter.limit("5/minute")
async def embedding_warmup(request: Request) -> EmbeddingStatus:
    """Trigger embedding index build in a background thread.

    Returns immediately with current status. The index builds asynchronously.
    """
    loop = asyncio.get_event_loop()
    try:
        await loop.run_in_executor(None, build_embedding_index)
    except Exception:
        pass  # Error captured in service state
    return get_embedding_status()
