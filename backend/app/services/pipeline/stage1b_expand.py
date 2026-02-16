"""Stage 1.5: LLM-assisted candidate expansion for underrepresented branches.

After Stage 1's local search, some prescan-tagged branches may have few or no
candidates (e.g., "DUI/DWI Defense" → Area of Law finds nothing because FOLIO
has no keyword overlap with "Criminal Law").

This stage:
1. Identifies branches tagged by prescan that have poor Stage 1 coverage
2. Asks the LLM to suggest concept labels for those branches
3. Searches FOLIO for those labels within the branch
4. Merges new candidates into the Stage 1 pool before Stage 2 ranking
"""

from __future__ import annotations

import json
import logging

from app.models.llm_models import LLMConfig
from app.models.pipeline_models import PreScanResult, ScopedCandidate
from app.services.folio_service import (
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

# Branches with fewer than this many candidates trigger expansion
_MIN_CANDIDATES_THRESHOLD = 3

# Max candidates to add per branch during expansion
_MAX_EXPAND_PER_BRANCH = 5


def _build_expansion_prompt(item_text: str, branch_name: str) -> str:
    """Build prompt asking LLM to suggest concept labels for a branch."""
    return (
        "You are a legal ontology expert. Given the input text and a FOLIO ontology branch, "
        "suggest the top 5 concept labels that would exist in that branch and semantically "
        "relate to the input.\n\n"
        "Think about:\n"
        "- What broader legal category does this input fall under?\n"
        "- What specific legal concepts in this branch would a lawyer associate with this input?\n"
        "- Consider synonyms, parent categories, and related legal domains.\n\n"
        f"Input text: {item_text}\n"
        f"FOLIO branch: {branch_name}\n\n"
        "Return ONLY a JSON array of strings, e.g.:\n"
        '["Concept Label 1", "Concept Label 2", "Concept Label 3", "Concept Label 4", "Concept Label 5"]\n\n'
        "No explanation, just the JSON array."
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


def _find_underrepresented_branches(
    prescan: PreScanResult,
    stage1_candidates: list[ScopedCandidate],
) -> list[str]:
    """Find prescan-tagged branches with poor Stage 1 coverage.

    A branch is underrepresented if it was tagged by prescan but has fewer
    than _MIN_CANDIDATES_THRESHOLD candidates from Stage 1.
    """
    # Collect all branches tagged by prescan
    prescan_branches: set[str] = set()
    for segment in prescan.segments:
        for branch in segment.branches:
            prescan_branches.add(branch)

    # Count Stage 1 candidates per branch
    branch_counts: dict[str, int] = {}
    for c in stage1_candidates:
        branch_counts[c.branch] = branch_counts.get(c.branch, 0) + 1

    # Find branches that need expansion
    underrepresented = []
    for branch in sorted(prescan_branches):
        count = branch_counts.get(branch, 0)
        if count < _MIN_CANDIDATES_THRESHOLD:
            underrepresented.append(branch)

    return underrepresented


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

        prompt = _build_expansion_prompt(item_text, branch_name)
        response = await provider.complete(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=512,
        )
        return _parse_llm_suggestions(response)
    except Exception as e:
        logger.warning("Stage 1.5: LLM call failed for branch %s: %s", branch_name, e)
        return []


async def run_stage1b(
    item_text: str,
    prescan: PreScanResult,
    stage1_candidates: list[ScopedCandidate],
    llm_config: LLMConfig,
) -> list[ScopedCandidate]:
    """Run Stage 1.5: LLM-assisted candidate expansion.

    Identifies prescan-tagged branches with poor Stage 1 coverage, asks the LLM
    to suggest concept labels, searches FOLIO for those labels, and returns
    new candidates to merge into the Stage 1 pool.

    Args:
        item_text: Original input text.
        prescan: Stage 0 output with segment/branch tags.
        stage1_candidates: Stage 1 output candidates.
        llm_config: LLM provider configuration.

    Returns:
        List of new ScopedCandidate to add (not including existing Stage 1 candidates).
    """
    underrepresented = _find_underrepresented_branches(prescan, stage1_candidates)

    if not underrepresented:
        logger.info("Stage 1.5: All prescan branches have adequate coverage, skipping expansion.")
        return []

    logger.info(
        "Stage 1.5: Expanding %d underrepresented branches: %s",
        len(underrepresented), ", ".join(underrepresented),
    )

    folio = get_folio()
    existing_hashes = {c.iri_hash for c in stage1_candidates}
    new_candidates: list[ScopedCandidate] = []

    for branch_name in underrepresented:
        branch_hashes = _resolve_branch_children(folio, branch_name)
        if branch_hashes is None:
            continue

        # Ask LLM for concept labels
        suggested_labels = await _llm_suggest_labels(item_text, branch_name, llm_config)
        if not suggested_labels:
            logger.info("Stage 1.5: No LLM suggestions for branch '%s'", branch_name)
            continue

        logger.info(
            "Stage 1.5: LLM suggested %d labels for '%s': %s",
            len(suggested_labels), branch_name, suggested_labels,
        )

        # Search FOLIO for each suggested label within the branch
        branch_new: dict[str, tuple[object, float]] = {}
        content_words = _content_words(item_text)
        if not content_words:
            from app.services.folio_service import _tokenize
            content_words = set(_tokenize(item_text))

        for label in suggested_labels:
            results = _search_within_branch(folio, label, branch_hashes, threshold=0.05)
            for iri_hash, owl_class, search_score in results:
                if iri_hash in existing_hashes:
                    continue  # Already in Stage 1 results

                # Re-score against original item text for consistency
                rescore = _compute_relevance_score(
                    content_words,
                    item_text,
                    owl_class.label or iri_hash,
                    owl_class.definition,
                    owl_class.alternative_labels or [],
                )
                best_score = max(search_score, rescore)

                if iri_hash not in branch_new or best_score > branch_new[iri_hash][1]:
                    branch_new[iri_hash] = (owl_class, best_score)

        # Sort by score and take top N
        sorted_new = sorted(branch_new.items(), key=lambda x: x[1][1], reverse=True)
        for iri_hash, (owl_class, score) in sorted_new[:_MAX_EXPAND_PER_BRANCH]:
            actual_branch = get_branch_for_class(folio, iri_hash)
            new_candidates.append(ScopedCandidate(
                iri_hash=iri_hash,
                label=owl_class.label or iri_hash,
                definition=owl_class.definition,
                synonyms=owl_class.alternative_labels or [],
                branch=actual_branch,
                score=score,
                source_branches=[branch_name],
            ))
            existing_hashes.add(iri_hash)  # Prevent dupes across branches

        logger.info(
            "Stage 1.5: Added %d candidates for branch '%s'",
            min(len(sorted_new), _MAX_EXPAND_PER_BRANCH), branch_name,
        )

    logger.info("Stage 1.5: Total new candidates from expansion: %d", len(new_candidates))
    return new_candidates
