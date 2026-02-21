"""Stage 1: Branch-scoped pre-filter using local FOLIO search.

For each pre-scan segment, resolves branch names to IRI hashes,
searches within those branches, and deduplicates across segments.
"""

from __future__ import annotations

import logging

from folio import FOLIO, FOLIO_TYPE_IRIS, FOLIOTypes

from app.models.pipeline_models import PreScanResult, ScopedCandidate
from app.services.branch_config import BRANCH_CONFIG
from app.services.folio_service import (
    LEGAL_TERM_EXPANSIONS,
    _compute_relevance_score,
    _content_words,
    _extract_iri_hash,
    _generate_search_terms,
    get_branch_for_class,
    get_folio,
    search_candidates,
)

logger = logging.getLogger(__name__)

# Map display names → FOLIOTypes enum names
_DISPLAY_TO_ENUM_KEY: dict[str, str] = {
    cfg["name"]: key for key, cfg in BRANCH_CONFIG.items()
}

# Max candidates passed to Stage 2
_MAX_TOTAL_CANDIDATES = 60


def _resolve_branch_children(folio: FOLIO, branch_display_name: str) -> set[str] | None:
    """Resolve a branch display name to the set of IRI hashes of its children.

    Returns None if the branch cannot be resolved.
    """
    enum_key = _DISPLAY_TO_ENUM_KEY.get(branch_display_name)
    if not enum_key:
        logger.warning("Stage 1: Unknown branch display name: %s", branch_display_name)
        return None

    try:
        ft = FOLIOTypes[enum_key]
    except KeyError:
        logger.warning("Stage 1: FOLIOTypes has no member: %s", enum_key)
        return None

    root_hash = FOLIO_TYPE_IRIS.get(ft)
    if not root_hash:
        logger.warning("Stage 1: No IRI hash for FOLIOTypes.%s", enum_key)
        return None

    try:
        children = folio.get_children(root_hash, max_depth=4)
    except Exception as e:
        logger.warning("Stage 1: get_children failed for %s: %s", enum_key, e)
        return None

    # Build set of IRI hashes (include root + children)
    child_hashes = {_extract_iri_hash(c.iri) for c in children}
    child_hashes.add(root_hash)
    return child_hashes


def _search_within_branch(
    folio: FOLIO,
    term: str,
    branch_hashes: set[str],
    threshold: float,
) -> list[tuple[str, object, float]]:
    """Search FOLIO and filter results to only classes within the branch set.

    Returns list of (iri_hash, owl_class, score) tuples.
    """
    content_words = _content_words(term)
    if not content_words:
        from app.services.folio_service import _tokenize
        content_words = set(_tokenize(term))

    search_terms = _generate_search_terms(term)
    min_score = threshold * 100

    # Gather raw candidates
    raw: dict[str, object] = {}
    for st in search_terms:
        for owl_class, _ in folio.search_by_label(st, include_alt_labels=True, limit=25):
            h = _extract_iri_hash(owl_class.iri)
            if h not in raw and h in branch_hashes:
                raw[h] = owl_class

        if len(st) >= 3:
            for owl_class in folio.search_by_prefix(st):
                h = _extract_iri_hash(owl_class.iri)
                if h not in raw and h in branch_hashes:
                    raw[h] = owl_class

    # Score candidates
    scored = []
    for iri_hash, owl_class in raw.items():
        score = _compute_relevance_score(
            content_words,
            term,
            owl_class.label or iri_hash,
            owl_class.definition,
            owl_class.alternative_labels or [],
        )
        if score >= min_score:
            scored.append((iri_hash, owl_class, score))

    # Expansion re-scoring: re-score against expanded queries (e.g. "litigation practice")
    expansion_queries: list[tuple[set[str], str]] = []
    for w in content_words:
        suffixes = LEGAL_TERM_EXPANSIONS.get(w)
        if suffixes:
            for suffix in suffixes:
                eq = f"{w} {suffix}"
                expansion_queries.append((_content_words(eq), eq))

    if expansion_queries:
        best_scores: dict[str, float] = {h: s for h, _, s in scored}
        for iri_hash, owl_class in raw.items():
            for eq_content, eq_full in expansion_queries:
                exp_score = _compute_relevance_score(
                    eq_content,
                    eq_full,
                    owl_class.label or iri_hash,
                    owl_class.definition,
                    owl_class.alternative_labels or [],
                )
                if exp_score >= min_score and exp_score > best_scores.get(iri_hash, 0):
                    best_scores[iri_hash] = exp_score

        scored_map: dict[str, tuple[str, object, float]] = {
            h: (h, c, s) for h, c, s in scored
        }
        for iri_hash, new_score in best_scores.items():
            if iri_hash in scored_map:
                _, owl_class, old_score = scored_map[iri_hash]
                if new_score > old_score:
                    scored_map[iri_hash] = (iri_hash, owl_class, new_score)
            elif new_score >= min_score:
                scored_map[iri_hash] = (iri_hash, raw[iri_hash], new_score)

        scored = list(scored_map.values())

    scored.sort(key=lambda x: x[2], reverse=True)
    return scored


def run_stage1(
    folio: FOLIO,
    prescan: PreScanResult,
    threshold: float = 0.3,
    max_per_branch: int = 10,
    mandatory_branches: list[str] | None = None,
) -> list[ScopedCandidate]:
    """Run Stage 1: branch-scoped local search.

    For each segment with branch tags:
    1. Resolve branches to IRI hash sets
    2. Search within those branches
    3. Fallback to unscoped search if < 5 candidates per segment
    4. Deduplicate across segments (keep best score, merge source branches)
    5. Cap at 60 total candidates

    Args:
        folio: Loaded FOLIO instance.
        prescan: Stage 0 output with segments and branch tags.
        threshold: Minimum score threshold (0-1).
        max_per_branch: Max candidates per branch in unscoped fallback.

    Returns:
        Deduplicated list of ScopedCandidate sorted by score descending.
    """
    # Track best candidate per iri_hash across all segments
    best: dict[str, ScopedCandidate] = {}

    for segment in prescan.segments:
        segment_candidates: list[tuple[str, object, float, str]] = []  # (hash, class, score, branch)

        # Build search terms: original text + synonyms from Stage 0
        search_texts = [segment.text]
        if segment.synonyms:
            search_texts.extend(segment.synonyms)

        if segment.branches:
            for branch_name in segment.branches:
                branch_hashes = _resolve_branch_children(folio, branch_name)
                if branch_hashes is None:
                    continue

                for search_text in search_texts:
                    results = _search_within_branch(folio, search_text, branch_hashes, threshold)
                    for iri_hash, owl_class, score in results:
                        segment_candidates.append((iri_hash, owl_class, score, branch_name))

        # Fallback: if < 5 candidates for this segment, use unscoped search
        unique_hashes = {c[0] for c in segment_candidates}
        if len(unique_hashes) < 5:
            logger.info(
                "Stage 1: Segment '%s' has %d candidates, adding unscoped fallback",
                segment.text[:50], len(unique_hashes),
            )
            unscoped = search_candidates(segment.text, threshold, max_per_branch)
            for fc in unscoped:
                if fc.iri_hash not in unique_hashes:
                    segment_candidates.append((
                        fc.iri_hash,
                        folio[fc.iri_hash],
                        fc.score,
                        fc.branch,
                    ))

        # Merge into best candidates
        for iri_hash, owl_class, score, branch_name in segment_candidates:
            if owl_class is None:
                continue
            existing = best.get(iri_hash)
            if existing is None:
                actual_branch = get_branch_for_class(folio, iri_hash)
                best[iri_hash] = ScopedCandidate(
                    iri_hash=iri_hash,
                    label=owl_class.label or iri_hash,
                    definition=owl_class.definition,
                    synonyms=owl_class.alternative_labels or [],
                    branch=actual_branch,
                    score=score,
                    source_branches=[branch_name],
                )
            else:
                # Keep best score, merge source branches
                if score > existing.score:
                    existing.score = score
                if branch_name not in existing.source_branches:
                    existing.source_branches.append(branch_name)

    # Mandatory branches: search any mandatory branches not already covered by segments
    if mandatory_branches:
        searched_branches = set()
        for segment in prescan.segments:
            searched_branches.update(segment.branches)

        for branch_name in mandatory_branches:
            if branch_name in searched_branches:
                continue
            branch_hashes = _resolve_branch_children(folio, branch_name)
            if branch_hashes is None:
                continue
            results = _search_within_branch(folio, prescan.raw_text, branch_hashes, threshold)
            for iri_hash, owl_class, score, in results:
                if owl_class is None:
                    continue
                existing = best.get(iri_hash)
                if existing is None:
                    actual_branch = get_branch_for_class(folio, iri_hash)
                    best[iri_hash] = ScopedCandidate(
                        iri_hash=iri_hash,
                        label=owl_class.label or iri_hash,
                        definition=owl_class.definition,
                        synonyms=owl_class.alternative_labels or [],
                        branch=actual_branch,
                        score=score,
                        source_branches=[branch_name],
                    )
                else:
                    if score > existing.score:
                        existing.score = score
                    if branch_name not in existing.source_branches:
                        existing.source_branches.append(branch_name)

            logger.info(
                "Stage 1: Mandatory branch '%s' searched with %d results",
                branch_name, len(results),
            )

    # Sort by score descending and cap at max
    candidates = sorted(best.values(), key=lambda c: c.score, reverse=True)
    if len(candidates) > _MAX_TOTAL_CANDIDATES:
        candidates = candidates[:_MAX_TOTAL_CANDIDATES]

    logger.info("Stage 1: %d candidates after dedup and cap", len(candidates))
    return candidates
