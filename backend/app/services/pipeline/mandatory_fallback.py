"""Mandatory branch fallback: find candidates for branches with no results.

For each mandatory branch:
1. Permissive local FOLIO search scoped to the branch (low threshold)
2. If <3 local candidates AND llm_config provided: LLM suggests concept labels,
   then searches FOLIO for those labels scoped to the branch
3. Merge, dedupe, return top 3 per branch
"""

from __future__ import annotations

import json
import logging

from app.models.llm_models import LLMConfig
from app.models.mapping_models import FolioCandidate
from app.models.pipeline_models import BranchFallbackResult
from app.services.branch_config import get_branch_color
from app.services.folio_service import (
    _build_hierarchy_path,
    _compute_relevance_score,
    _content_words,
    _extract_iri_hash,
    get_branch_for_class,
    get_folio,
)
from app.services.pipeline.stage1_filter import (
    _resolve_branch_children,
    _search_within_branch,
)

logger = logging.getLogger(__name__)

_MAX_PER_BRANCH = 3


def _build_llm_prompt(item_text: str, branch_name: str) -> str:
    return (
        f"You are a legal ontology expert. Given the input text and a FOLIO ontology branch, "
        f"suggest the top 5 concept labels that would exist in that branch and relate to the input.\n\n"
        f"Input text: {item_text}\n"
        f"FOLIO branch: {branch_name}\n\n"
        f"Return ONLY a JSON array of strings, e.g.:\n"
        f'["Concept Label 1", "Concept Label 2", "Concept Label 3", "Concept Label 4", "Concept Label 5"]\n\n'
        f"No explanation, just the JSON array."
    )


def _parse_llm_suggestions(text: str) -> list[str]:
    """Parse LLM response into a list of concept label strings."""
    text = text.strip()
    # Strip markdown fences
    if text.startswith("```"):
        lines = text.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines).strip()

    try:
        result = json.loads(text)
        if isinstance(result, list):
            return [s for s in result if isinstance(s, str)]
    except json.JSONDecodeError:
        pass

    return []


async def _llm_suggest_labels(
    item_text: str, branch_name: str, llm_config: LLMConfig
) -> list[str]:
    """Ask LLM to suggest concept labels for a branch."""
    try:
        from app.services.llm.registry import get_provider

        provider = get_provider(
            llm_config.provider,
            api_key=llm_config.api_key,
            base_url=llm_config.base_url,
            model=llm_config.model,
        )

        prompt = _build_llm_prompt(item_text, branch_name)
        response = await provider.complete(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=512,
        )
        return _parse_llm_suggestions(response)
    except Exception as e:
        logger.warning("Mandatory fallback LLM call failed for branch %s: %s", branch_name, e)
        return []


def _build_candidate(
    folio, iri_hash: str, owl_class, score: float, branch_name: str
) -> FolioCandidate:
    """Build a FolioCandidate from raw FOLIO data."""
    return FolioCandidate(
        label=owl_class.label or iri_hash,
        iri=owl_class.iri,
        iri_hash=iri_hash,
        definition=owl_class.definition,
        synonyms=owl_class.alternative_labels or [],
        branch=branch_name,
        branch_color=get_branch_color(branch_name),
        hierarchy_path=_build_hierarchy_path(folio, iri_hash),
        score=round(score, 1),
    )


async def run_mandatory_fallback(
    item_text: str,
    branches: list[str],
    llm_config: LLMConfig | None = None,
) -> list[BranchFallbackResult]:
    """Run mandatory fallback for the given branches.

    For each branch:
    1. Permissive local search (threshold=0.1)
    2. If <3 results and LLM available, get LLM suggestions and search for those
    3. Merge, dedupe, return top 3
    """
    folio = get_folio()
    results: list[BranchFallbackResult] = []

    for branch_name in branches:
        branch_hashes = _resolve_branch_children(folio, branch_name)
        if branch_hashes is None:
            logger.warning("Mandatory fallback: cannot resolve branch '%s'", branch_name)
            results.append(BranchFallbackResult(
                branch=branch_name,
                branch_color=get_branch_color(branch_name),
                candidates=[],
            ))
            continue

        # Step 1: Permissive local search
        local_results = _search_within_branch(folio, item_text, branch_hashes, threshold=0.1)
        seen: dict[str, tuple[object, float]] = {}
        for iri_hash, owl_class, score in local_results:
            if iri_hash not in seen or score > seen[iri_hash][1]:
                seen[iri_hash] = (owl_class, score)

        # Step 2: LLM fallback if needed
        if len(seen) < _MAX_PER_BRANCH and llm_config is not None:
            suggested_labels = await _llm_suggest_labels(item_text, branch_name, llm_config)
            for label in suggested_labels:
                llm_results = _search_within_branch(folio, label, branch_hashes, threshold=0.1)
                for iri_hash, owl_class, score in llm_results:
                    # Re-score against original item_text for consistency
                    content_words = _content_words(item_text)
                    if not content_words:
                        from app.services.folio_service import _tokenize
                        content_words = set(_tokenize(item_text))
                    rescore = _compute_relevance_score(
                        content_words,
                        item_text,
                        owl_class.label or iri_hash,
                        owl_class.definition,
                        owl_class.alternative_labels or [],
                    )
                    # Use max of search score and rescore
                    best_score = max(score, rescore)
                    if iri_hash not in seen or best_score > seen[iri_hash][1]:
                        seen[iri_hash] = (owl_class, best_score)

        # Step 3: Build top candidates
        sorted_candidates = sorted(seen.items(), key=lambda x: x[1][1], reverse=True)
        candidates = [
            _build_candidate(folio, iri_hash, owl_class, score, branch_name)
            for iri_hash, (owl_class, score) in sorted_candidates[:_MAX_PER_BRANCH]
        ]

        results.append(BranchFallbackResult(
            branch=branch_name,
            branch_color=get_branch_color(branch_name),
            candidates=candidates,
        ))

    return results
