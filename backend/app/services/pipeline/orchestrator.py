"""Pipeline orchestrator: runs Stages 0→1→2→3 per item and assembles the response."""

from __future__ import annotations

import asyncio
import logging
import math
from collections import Counter

from app.models.llm_models import LLMConfig
from app.models.mapping_models import (
    BranchGroup,
    BranchInfo,
    FolioCandidate,
    ItemMappingResult,
    MappingResponse,
)
from app.models.parse_models import ParseItem
from app.models.pipeline_models import (
    JudgedCandidate,
    PipelineItemMetadata,
    PipelineResponse,
    RankedCandidate,
    ScopedCandidate,
)
from app.services.branch_config import get_branch_color
from app.services.folio_service import (
    _build_hierarchy_path,
    _content_words,
    _extract_iri_hash,
    _word_overlap,
    get_all_branches,
    get_folio,
)
from app.services.pipeline.stage0_prescan import run_stage0
from app.services.pipeline.stage1_filter import run_stage1
from app.services.pipeline.stage1b_expand import run_stage1b
from app.services.pipeline.stage2_rank import run_stage2
from app.services.pipeline.stage3_judge import run_stage3

logger = logging.getLogger(__name__)


def _differentiate_scores(
    text: str,
    judged: list[JudgedCandidate],
    scoped_lookup: dict[str, ScopedCandidate],
) -> list[JudgedCandidate]:
    """Break tied scores using semantic relevance signals.

    When the LLM gives many candidates the same score (e.g., all 54 because
    they share a keyword), this function differentiates them using:
    - Query word coverage: fraction of query words found in the label
    - Label specificity: how focused the label is on query terms
    - Definition relevance: whether the definition mentions query terms
    """
    if len(judged) < 2:
        return judged

    # Check if differentiation is needed: >40% of candidates share the same
    # rounded score
    rounded_counts = Counter(round(j.adjusted_score) for j in judged)
    most_common_score, most_common_count = rounded_counts.most_common(1)[0]
    if most_common_count < max(3, len(judged) * 0.4):
        return judged  # Scores already varied enough

    logger.info(
        "Score differentiation: %d/%d candidates share score %d, applying tiebreaking",
        most_common_count, len(judged), most_common_score,
    )

    query_words = _content_words(text)
    if not query_words:
        return judged

    # Compute a semantic relevance signal for each candidate (0.0 - 1.0)
    signals: dict[str, float] = {}
    for j in judged:
        sc = scoped_lookup.get(j.iri_hash)
        if sc is None:
            signals[j.iri_hash] = 0.0
            continue

        label_words = _content_words(sc.label)
        # 1. Forward overlap: what fraction of query words appear in the label
        forward = _word_overlap(query_words, label_words) if label_words else 0.0
        # 2. Reverse overlap: what fraction of label words are query words
        #    Higher = label is more focused on the query topic
        reverse = _word_overlap(label_words, query_words) if label_words else 0.0
        # 3. Definition boost: does the definition contain query terms?
        def_boost = 0.0
        if sc.definition:
            def_words = _content_words(sc.definition)
            def_overlap = _word_overlap(query_words, def_words) if def_words else 0.0
            def_boost = def_overlap * 0.3  # Smaller weight than label signals
        # 4. Synonym boost
        syn_boost = 0.0
        for syn in (sc.synonyms or [])[:5]:
            syn_words = _content_words(syn)
            syn_overlap = _word_overlap(query_words, syn_words) if syn_words else 0.0
            syn_boost = max(syn_boost, syn_overlap * 0.2)

        # Combined signal: weighted average (0.0 - ~1.0)
        signal = forward * 0.4 + reverse * 0.3 + def_boost + syn_boost
        signals[j.iri_hash] = signal

    # Apply differentiation: spread scores based on signal ranking
    # Sort by (adjusted_score DESC, signal DESC) to establish ordering
    sorted_judged = sorted(
        judged,
        key=lambda j: (j.adjusted_score, signals.get(j.iri_hash, 0.0)),
        reverse=True,
    )

    # Find score range — use at least a 30-point spread
    max_score = sorted_judged[0].adjusted_score
    min_signal = min(signals.values()) if signals else 0.0
    max_signal = max(signals.values()) if signals else 1.0
    signal_range = max_signal - min_signal if max_signal > min_signal else 1.0

    result = []
    for idx, j in enumerate(sorted_judged):
        sig = signals.get(j.iri_hash, 0.0)
        # Normalize signal to [0, 1]
        normalized = (sig - min_signal) / signal_range

        # Map to score: top signal gets the original score, bottom signal
        # gets original - 35 (ensuring visible differentiation)
        spread = 50.0
        new_score = max_score - spread * (1.0 - normalized)
        # Small position-based tiebreaker to ensure every candidate
        # gets a unique rounded score (0.4 points per rank position)
        new_score -= idx * 0.4
        new_score = max(1.0, min(99.0, round(new_score, 1)))

        result.append(JudgedCandidate(
            iri_hash=j.iri_hash,
            original_score=j.original_score,
            adjusted_score=new_score,
            verdict=j.verdict,
            reasoning=j.reasoning,
        ))

    result.sort(key=lambda j: j.adjusted_score, reverse=True)
    return result


def _build_folio_candidate_from_judged(
    judged: JudgedCandidate,
    scoped_lookup: dict[str, ScopedCandidate],
) -> FolioCandidate | None:
    """Convert a JudgedCandidate back to a FolioCandidate for the UI."""
    scoped = scoped_lookup.get(judged.iri_hash)
    if scoped is None:
        return None

    folio = get_folio()
    return FolioCandidate(
        label=scoped.label,
        iri=f"https://folio.openlegalstandard.org/{scoped.iri_hash}",
        iri_hash=scoped.iri_hash,
        definition=scoped.definition,
        synonyms=scoped.synonyms,
        branch=scoped.branch,
        branch_color=get_branch_color(scoped.branch),
        hierarchy_path=_build_hierarchy_path(folio, scoped.iri_hash),
        score=judged.adjusted_score,
    )


def _assemble_item_result(
    item: ParseItem,
    judged: list[JudgedCandidate],
    scoped_lookup: dict[str, ScopedCandidate],
) -> ItemMappingResult:
    """Build an ItemMappingResult from judged candidates."""
    candidates: list[FolioCandidate] = []
    for j in judged:
        fc = _build_folio_candidate_from_judged(j, scoped_lookup)
        if fc is not None:
            candidates.append(fc)

    # Group by branch
    branch_groups_dict: dict[str, list[FolioCandidate]] = {}
    for c in candidates:
        branch_groups_dict.setdefault(c.branch, []).append(c)

    branch_groups = [
        BranchGroup(
            branch=branch,
            branch_color=get_branch_color(branch),
            candidates=cands,
        )
        for branch, cands in sorted(branch_groups_dict.items())
    ]

    return ItemMappingResult(
        item_index=item.index,
        item_text=item.text,
        branch_groups=branch_groups,
        total_candidates=len(candidates),
    )


async def run_pipeline(
    items: list[ParseItem],
    llm_config: LLMConfig,
    threshold: float = 0.3,
    max_per_branch: int = 10,
) -> PipelineResponse:
    """Run the full mapping pipeline (Stages 0→1→2→3) for all items.

    Processes items sequentially to respect LLM rate limits.

    Args:
        items: Parsed input items to map.
        llm_config: LLM provider configuration.
        threshold: Minimum score threshold (0-1).
        max_per_branch: Max candidates per branch in fallback search.

    Returns:
        PipelineResponse with MappingResponse and pipeline metadata.
    """
    folio = get_folio()
    item_results: list[ItemMappingResult] = []
    metadata: list[PipelineItemMetadata] = []

    for item in items:
        logger.info("Pipeline: processing item %d: %s", item.index, item.text[:60])

        # Stage 0: Pre-scan
        prescan = await run_stage0(item.text, llm_config)
        logger.info(
            "Pipeline: Stage 0 produced %d segments for item %d",
            len(prescan.segments), item.index,
        )

        # Stage 1: Branch-scoped local search
        stage1_candidates = await asyncio.get_event_loop().run_in_executor(
            None, run_stage1, folio, prescan, threshold, max_per_branch,
        )
        logger.info(
            "Pipeline: Stage 1 produced %d candidates for item %d",
            len(stage1_candidates), item.index,
        )

        # Stage 1.5: LLM-assisted candidate expansion for underrepresented branches
        stage1b_new = await run_stage1b(item.text, prescan, stage1_candidates, llm_config)
        stage1b_branches = list({c.branch for c in stage1b_new}) if stage1b_new else []
        if stage1b_new:
            stage1_candidates = stage1_candidates + stage1b_new
            logger.info(
                "Pipeline: Stage 1.5 added %d candidates for item %d (branches: %s)",
                len(stage1b_new), item.index, ", ".join(stage1b_branches),
            )

        # Stage 2: LLM ranking
        ranked = await run_stage2(item.text, prescan, stage1_candidates, llm_config)
        logger.info(
            "Pipeline: Stage 2 ranked %d candidates for item %d",
            len(ranked), item.index,
        )

        # Build scoped lookup for converting ranked/judged → FolioCandidate
        scoped_lookup = {c.iri_hash: c for c in stage1_candidates}

        # Stage 3: Judge validation
        judged = await run_stage3(item.text, prescan, ranked, scoped_lookup, llm_config)

        # Stage 4: Score differentiation — break tied scores using semantic signals
        judged = _differentiate_scores(item.text, judged, scoped_lookup)

        # Compute judge stats
        stage3_boosted = sum(1 for j in judged if j.verdict == "boosted")
        stage3_penalized = sum(1 for j in judged if j.verdict == "penalized")
        # Count rejected from full judge output (before filtering in run_stage3)
        stage3_rejected = len(ranked) - len(judged)  # removed candidates
        logger.info(
            "Pipeline: Stage 3 judged %d candidates for item %d "
            "(boosted=%d, penalized=%d, rejected=%d)",
            len(judged), item.index,
            stage3_boosted, stage3_penalized, stage3_rejected,
        )

        # Assemble result using judge-adjusted scores
        item_result = _assemble_item_result(item, judged, scoped_lookup)
        item_results.append(item_result)

        metadata.append(PipelineItemMetadata(
            item_index=item.index,
            item_text=item.text,
            prescan=prescan,
            stage1_candidate_count=len(stage1_candidates) - len(stage1b_new),
            stage1b_expanded_count=len(stage1b_new),
            stage1b_branches_expanded=stage1b_branches,
            stage2_candidate_count=len(ranked),
            stage3_judged_count=len(judged),
            stage3_boosted=stage3_boosted,
            stage3_penalized=stage3_penalized,
            stage3_rejected=stage3_rejected,
        ))

    # Get available branches
    try:
        branches = await asyncio.get_event_loop().run_in_executor(None, get_all_branches)
    except Exception:
        branches = []

    mapping_response = MappingResponse(
        items=item_results,
        total_items=len(items),
        branches_available=branches,
    )

    return PipelineResponse(
        mapping=mapping_response,
        pipeline_metadata=metadata,
    )
