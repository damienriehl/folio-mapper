"""Stage 0: Branch pre-scan via LLM.

Segments input text and tags each segment with likely FOLIO branches.
"""

from __future__ import annotations

import json
import logging
import re

from app.models.llm_models import LLMConfig
from app.models.pipeline_models import PreScanResult, PreScanSegment
from app.services.branch_config import BRANCH_CONFIG, EXCLUDED_BRANCHES
from app.services.llm.registry import get_provider
from app.services.pipeline.prompts import build_prescan_prompt

logger = logging.getLogger(__name__)

# Set of valid branch display names for validation
_VALID_BRANCHES: set[str] = {
    cfg["name"] for cfg in BRANCH_CONFIG.values()
    if cfg["name"] not in EXCLUDED_BRANCHES
}


def _strip_markdown_fences(text: str) -> str:
    """Remove markdown code fences (```json ... ```) from LLM output."""
    text = text.strip()
    # Remove leading ```json or ```
    text = re.sub(r"^```(?:json)?\s*\n?", "", text)
    # Remove trailing ```
    text = re.sub(r"\n?```\s*$", "", text)
    return text.strip()


def _parse_prescan_json(raw: str, original_text: str) -> PreScanResult:
    """Parse LLM JSON output into PreScanResult with validation.

    Falls back to a single segment with full text on parse failure.
    """
    cleaned = _strip_markdown_fences(raw)

    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        logger.warning("Stage 0: Failed to parse JSON, using fallback. Raw: %s", raw[:200])
        return _fallback_result(original_text)

    segments_data = data.get("segments", [])
    if not isinstance(segments_data, list) or not segments_data:
        logger.warning("Stage 0: No segments in response, using fallback.")
        return _fallback_result(original_text)

    segments = []
    for seg in segments_data:
        if not isinstance(seg, dict):
            continue
        text = seg.get("text", "").strip()
        if not text:
            continue

        # Validate branch names against known set
        raw_branches = seg.get("branches", [])
        if not isinstance(raw_branches, list):
            raw_branches = []
        valid_branches = [b for b in raw_branches if b in _VALID_BRANCHES]

        segments.append(PreScanSegment(
            text=text,
            branches=valid_branches,
            reasoning=seg.get("reasoning", ""),
        ))

    if not segments:
        logger.warning("Stage 0: All segments invalid, using fallback.")
        return _fallback_result(original_text)

    return PreScanResult(segments=segments, raw_text=original_text)


def _fallback_result(text: str) -> PreScanResult:
    """Fallback: single segment with full input text, no branch tags."""
    return PreScanResult(
        segments=[PreScanSegment(text=text, branches=[], reasoning="fallback")],
        raw_text=text,
    )


async def run_stage0(text: str, llm_config: LLMConfig) -> PreScanResult:
    """Run Stage 0: LLM-based branch pre-scan.

    Args:
        text: The input text to segment and tag.
        llm_config: LLM provider configuration.

    Returns:
        PreScanResult with segments and branch tags.
    """
    messages = build_prescan_prompt(text)

    provider = get_provider(
        provider_type=llm_config.provider,
        api_key=llm_config.api_key,
        base_url=llm_config.base_url,
        model=llm_config.model,
    )

    try:
        raw_response = await provider.complete(
            messages=messages,
            temperature=0.1,
            max_tokens=1024,
        )
    except Exception as e:
        logger.error("Stage 0: LLM call failed: %s", e)
        return _fallback_result(text)

    return _parse_prescan_json(raw_response, text)
