"""Stage 2: LLM-based candidate ranking.

Presents candidates to the LLM for scoring and ranking.
"""

from __future__ import annotations

import json
import logging
import re

from app.models.llm_models import LLMConfig
from app.models.pipeline_models import PreScanResult, RankedCandidate, ScopedCandidate
from app.services.llm.registry import get_provider
from app.services.pipeline.prompts import build_ranking_prompt

logger = logging.getLogger(__name__)


def _strip_markdown_fences(text: str) -> str:
    """Remove markdown code fences from LLM output."""
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*\n?", "", text)
    text = re.sub(r"\n?```\s*$", "", text)
    return text.strip()


def _repair_truncated_json(text: str) -> str | None:
    """Attempt to repair JSON truncated by token limits.

    If the LLM ran out of tokens mid-array, find the last complete object
    and close the JSON structure.
    """
    # Find the last complete object in the array (ends with "}")
    last_brace = text.rfind("}")
    if last_brace < 0:
        return None
    # Truncate after the last complete object and close the structure
    truncated = text[: last_brace + 1]
    # Count unclosed brackets/braces and close them
    open_brackets = truncated.count("[") - truncated.count("]")
    open_braces = truncated.count("{") - truncated.count("}")
    truncated += "]" * open_brackets + "}" * open_braces
    try:
        json.loads(truncated)
        return truncated
    except json.JSONDecodeError:
        return None


def _parse_ranking_json(
    raw: str,
    known_hashes: set[str],
) -> list[RankedCandidate] | None:
    """Parse LLM ranking JSON output.

    Silently drops unknown iri_hash values (hallucination guard).
    Returns None on parse failure.
    """
    cleaned = _strip_markdown_fences(raw)

    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        # Try to recover from truncated JSON (token limit hit)
        repaired = _repair_truncated_json(cleaned)
        if repaired:
            logger.info("Stage 2: Recovered truncated JSON response.")
            data = json.loads(repaired)
        else:
            logger.warning("Stage 2: Failed to parse JSON. Raw: %s", raw[:200])
            return None

    ranked_data = data.get("ranked", [])
    if not isinstance(ranked_data, list):
        logger.warning("Stage 2: 'ranked' is not a list.")
        return None

    results = []
    for entry in ranked_data:
        if not isinstance(entry, dict):
            continue
        iri_hash = entry.get("iri_hash", "")
        if iri_hash not in known_hashes:
            logger.debug("Stage 2: Dropping unknown iri_hash: %s", iri_hash)
            continue

        score = entry.get("score", 0)
        if not isinstance(score, (int, float)):
            continue
        score = max(0.0, min(100.0, float(score)))

        results.append(RankedCandidate(
            iri_hash=iri_hash,
            score=score,
            reasoning=entry.get("reasoning", ""),
        ))

    return results if results else None


def _fallback_ranking(candidates: list[ScopedCandidate]) -> list[RankedCandidate]:
    """Fallback: convert Stage 1 candidates to ranked candidates by local score."""
    return [
        RankedCandidate(
            iri_hash=c.iri_hash,
            score=c.score,
            reasoning="local score (LLM ranking unavailable)",
        )
        for c in candidates[:20]
    ]


async def run_stage2(
    text: str,
    prescan: PreScanResult,
    candidates: list[ScopedCandidate],
    llm_config: LLMConfig,
) -> list[RankedCandidate]:
    """Run Stage 2: LLM-based candidate ranking.

    Args:
        text: Original input text for the item.
        prescan: Stage 0 output with segments and branch tags.
        candidates: Stage 1 output — scoped candidates.
        llm_config: LLM provider configuration.

    Returns:
        List of RankedCandidate sorted by score descending.
    """
    if not candidates:
        return []

    messages = build_ranking_prompt(text, prescan, candidates)
    known_hashes = {c.iri_hash for c in candidates}

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
            max_tokens=4096,
        )
    except Exception as e:
        logger.error("Stage 2: LLM call failed: %s", e)
        return _fallback_ranking(candidates)

    ranked = _parse_ranking_json(raw_response, known_hashes)
    if ranked is None:
        logger.warning("Stage 2: Parse failed, using fallback ranking.")
        return _fallback_ranking(candidates)

    # Sort by score descending
    ranked.sort(key=lambda r: r.score, reverse=True)
    return ranked
