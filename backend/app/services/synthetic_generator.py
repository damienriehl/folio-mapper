"""Service for generating synthetic legal taxonomy data via LLM."""

from __future__ import annotations

import logging

from app.models.llm_models import LLMConfig
from app.models.synthetic_models import SyntheticResponse
from app.services.llm.registry import get_provider
from app.services.synthetic_prompt import build_synthetic_prompt, sanitize_output

logger = logging.getLogger(__name__)


async def generate_synthetic_data(
    count: int,
    llm_config: LLMConfig,
    api_key: str | None = None,
) -> SyntheticResponse:
    """Generate synthetic legal taxonomy data using the configured LLM."""
    provider = get_provider(
        provider_type=llm_config.provider,
        api_key=api_key,
        base_url=llm_config.base_url,
        model=llm_config.model,
    )

    messages = build_synthetic_prompt(count)

    # Scale max_tokens with count: ~30 tokens per item is generous
    max_tokens = max(512, count * 30)

    raw = await provider.complete(
        messages,
        temperature=0.7,
        max_tokens=max_tokens,
    )

    text = sanitize_output(raw)

    # Truncate to requested count (LLMs often overshoot)
    lines = [line for line in text.splitlines() if line.strip()]
    if len(lines) > count:
        lines = lines[:count]
        text = "\n".join(lines)

    item_count = len(lines)

    return SyntheticResponse(text=text, item_count=item_count)
