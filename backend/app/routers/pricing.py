"""Pricing endpoint — returns per-model cost estimates from LiteLLM data."""

from datetime import datetime, timezone

from fastapi import APIRouter

from app.services.pricing_service import fetch_pricing

router = APIRouter(prefix="/api/llm", tags=["llm"])


@router.get("/pricing")
async def get_pricing() -> dict:
    """Return per-model cost-per-node estimates."""
    prices, fetched_at = await fetch_pricing()
    return {
        "prices": prices,
        "fetched_at": (
            datetime.fromtimestamp(fetched_at, tz=timezone.utc).isoformat()
            if fetched_at
            else None
        ),
    }
