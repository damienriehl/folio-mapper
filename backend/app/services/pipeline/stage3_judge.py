"""Stage 3: Judge validation — adjusts confidence scores to reduce false positives/negatives.

A separate LLM call reviews each ranked candidate from Stage 2 and either
confirms, boosts, penalizes, or rejects it.
"""

from __future__ import annotations

import json
import logging
import re

from app.models.llm_models import LLMConfig
from app.models.pipeline_models import (
    JudgedCandidate,
    PreScanResult,
    RankedCandidate,
    ScopedCandidate,
)
from app.services.llm.registry import get_provider
from app.services.pipeline.prompts import build_judge_prompt

logger = logging.getLogger(__name__)

_VALID_VERDICTS = {"confirmed", "boosted", "penalized", "rejected"}


def _strip_markdown_fences(text: str) -> str:
    """Remove markdown code fences from LLM output."""
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*\n?", "", text)
    text = re.sub(r"\n?```\s*$", "", text)
    return text.strip()


def _parse_judge_json(
    raw: str,
    ranked_lookup: dict[str, RankedCandidate],
) -> list[JudgedCandidate] | None:
    """Parse LLM judge JSON output.

    Validates iri_hash against known candidates and enforces verdict rules.
    Returns None on parse failure.
    """
    cleaned = _strip_markdown_fences(raw)

    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        logger.warning("Stage 3: Failed to parse JSON. Raw: %s", raw[:200])
        return None

    judged_data = data.get("judged", [])
    if not isinstance(judged_data, list):
        logger.warning("Stage 3: 'judged' is not a list.")
        return None

    results = []
    for entry in judged_data:
        if not isinstance(entry, dict):
            continue

        iri_hash = entry.get("iri_hash", "")
        if iri_hash not in ranked_lookup:
            logger.debug("Stage 3: Dropping unknown iri_hash: %s", iri_hash)
            continue

        adjusted_score = entry.get("adjusted_score", 0)
        if not isinstance(adjusted_score, (int, float)):
            continue
        adjusted_score = max(0.0, min(100.0, float(adjusted_score)))

        verdict = entry.get("verdict", "confirmed")
        if verdict not in _VALID_VERDICTS:
            verdict = "confirmed"

        original_score = ranked_lookup[iri_hash].score

        # Enforce verdict consistency
        if verdict == "rejected":
            adjusted_score = 0.0
        # For confirmed/boosted/penalized, trust the judge's adjusted_score.
        # The verdict is metadata; the adjusted_score is the real output.

        results.append(JudgedCandidate(
            iri_hash=iri_hash,
            original_score=original_score,
            adjusted_score=adjusted_score,
            verdict=verdict,
            reasoning=entry.get("reasoning", ""),
        ))

    return results if results else None


def _fallback_judging(ranked: list[RankedCandidate]) -> list[JudgedCandidate]:
    """Fallback: pass through Stage 2 scores unchanged as 'confirmed'."""
    return [
        JudgedCandidate(
            iri_hash=r.iri_hash,
            original_score=r.score,
            adjusted_score=r.score,
            verdict="confirmed",
            reasoning="judge unavailable — score unchanged",
        )
        for r in ranked
    ]


async def run_stage3(
    text: str,
    prescan: PreScanResult,
    ranked: list[RankedCandidate],
    scoped_lookup: dict[str, ScopedCandidate],
    llm_config: LLMConfig,
) -> list[JudgedCandidate]:
    """Run Stage 3: Judge validation.

    Reviews each ranked candidate and adjusts confidence scores to reduce
    false positives and false negatives.

    Args:
        text: Original input text for the item.
        prescan: Stage 0 output with segments and branch tags.
        ranked: Stage 2 output — ranked candidates.
        scoped_lookup: Stage 1 candidates by iri_hash for definitions/context.
        llm_config: LLM provider configuration.

    Returns:
        List of JudgedCandidate sorted by adjusted_score descending.
    """
    if not ranked:
        return []

    messages = build_judge_prompt(text, prescan, ranked, scoped_lookup)
    ranked_lookup = {r.iri_hash: r for r in ranked}

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
            max_tokens=2048,
        )
    except Exception as e:
        logger.error("Stage 3: LLM call failed: %s", e)
        return _fallback_judging(ranked)

    judged = _parse_judge_json(raw_response, ranked_lookup)
    if judged is None:
        logger.warning("Stage 3: Parse failed, using fallback (scores unchanged).")
        return _fallback_judging(ranked)

    # Any ranked candidates not mentioned by the judge get passed through
    judged_hashes = {j.iri_hash for j in judged}
    for r in ranked:
        if r.iri_hash not in judged_hashes:
            judged.append(JudgedCandidate(
                iri_hash=r.iri_hash,
                original_score=r.score,
                adjusted_score=r.score,
                verdict="confirmed",
                reasoning="not reviewed by judge — score unchanged",
            ))

    # Filter out rejected candidates and sort by adjusted score
    judged = [j for j in judged if j.verdict != "rejected"]
    judged.sort(key=lambda j: j.adjusted_score, reverse=True)

    return judged
