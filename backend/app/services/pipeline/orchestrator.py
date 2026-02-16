"""Pipeline orchestrator: runs Stages 0→1→2→3 per item and assembles the response."""

from __future__ import annotations

import asyncio
import logging

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
    _extract_iri_hash,
    get_all_branches,
    get_folio,
)
from app.models.pipeline_models import PreScanResult, PreScanSegment
from app.services.pipeline.stage1_filter import run_stage1
from app.services.pipeline.stage1b_expand import run_stage1b
from app.services.pipeline.stage2_rank import run_stage2
from app.services.pipeline.stage3_judge import run_stage3

logger = logging.getLogger(__name__)


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


_MAX_JUDGE_CANDIDATES = 10  # Cap candidates sent to Stage 3 judge
_CONCURRENCY_LIMIT = 3       # Max items processed in parallel


async def _process_item(
    item: ParseItem,
    llm_config: LLMConfig,
    folio: object,
    threshold: float,
    max_per_branch: int,
    sem: asyncio.Semaphore,
) -> tuple[ItemMappingResult, PipelineItemMetadata]:
    """Process a single item through the full pipeline (Stages 0→1→1.5→2→3)."""
    async with sem:
        print(f"\n{'='*60}")
        print(f"PIPELINE: Processing item {item.index}: {item.text[:60]}")
        print(f"{'='*60}")
        logger.info("Pipeline: processing item %d: %s", item.index, item.text[:60])

        # Stage 0: Skipped — use whole text as single segment (no LLM call)
        prescan = PreScanResult(
            segments=[PreScanSegment(text=item.text, branches=[], reasoning="prescan disabled")],
            raw_text=item.text,
        )
        print(f"[item {item.index}] STAGE 0: skipped (prescan disabled)")

        # Stage 1: Branch-scoped local search
        stage1_candidates = await asyncio.get_event_loop().run_in_executor(
            None, run_stage1, folio, prescan, threshold, max_per_branch,
        )
        print(f"[item {item.index}] STAGE 1: {len(stage1_candidates)} candidates")

        # Stage 1.5: LLM-assisted candidate expansion
        stage1b_new = await run_stage1b(item.text, prescan, stage1_candidates, llm_config)
        stage1b_branches = list({c.branch for c in stage1b_new}) if stage1b_new else []
        if stage1b_new:
            stage1_candidates = stage1_candidates + stage1b_new
            print(f"[item {item.index}] STAGE 1.5: Added {len(stage1b_new)} candidates")
        else:
            print(f"[item {item.index}] STAGE 1.5: No expansion needed")

        # Stage 2: LLM ranking — DISABLED, using local scores instead
        # ranked = await run_stage2(item.text, prescan, stage1_candidates, llm_config)
        ranked = [
            RankedCandidate(iri_hash=c.iri_hash, score=c.score, reasoning="local score")
            for c in sorted(stage1_candidates, key=lambda c: c.score, reverse=True)[:20]
        ]
        print(f"[item {item.index}] STAGE 2: {len(ranked)} candidates (local scores, LLM disabled)")
        for r in ranked[:3]:
            sc = {c.iri_hash: c for c in stage1_candidates}.get(r.iri_hash)
            label = sc.label if sc else r.iri_hash[:20]
            print(f"  - {label}: score={r.score}")

        # Build scoped lookup
        scoped_lookup = {c.iri_hash: c for c in stage1_candidates}

        # Stage 3: Judge validation — only send top N to reduce output size
        ranked_for_judge = ranked[:_MAX_JUDGE_CANDIDATES]
        judged = await run_stage3(item.text, prescan, ranked_for_judge, scoped_lookup, llm_config)

        # Also pass through any ranked candidates beyond top N (unjudged)
        judged_hashes = {j.iri_hash for j in judged}
        for r in ranked[_MAX_JUDGE_CANDIDATES:]:
            if r.iri_hash not in judged_hashes:
                judged.append(JudgedCandidate(
                    iri_hash=r.iri_hash,
                    original_score=r.score,
                    adjusted_score=r.score,
                    verdict="confirmed",
                    reasoning="below judge cutoff — score unchanged",
                ))

        # Re-sort after merging
        judged = [j for j in judged if j.verdict != "rejected"]
        judged.sort(key=lambda j: j.adjusted_score, reverse=True)

        print(f"[item {item.index}] STAGE 3: {len(judged)} judged candidates")

        # Compute judge stats
        stage3_boosted = sum(1 for j in judged if j.verdict == "boosted")
        stage3_penalized = sum(1 for j in judged if j.verdict == "penalized")
        stage3_rejected = len(ranked) - len(judged)

        # Assemble result
        item_result = _assemble_item_result(item, judged, scoped_lookup)

        item_meta = PipelineItemMetadata(
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
        )

        return item_result, item_meta


async def run_pipeline(
    items: list[ParseItem],
    llm_config: LLMConfig,
    threshold: float = 0.3,
    max_per_branch: int = 10,
) -> PipelineResponse:
    """Run the full mapping pipeline (Stages 0→1→2→3) for all items.

    Processes items concurrently (up to _CONCURRENCY_LIMIT at a time).

    Args:
        items: Parsed input items to map.
        llm_config: LLM provider configuration.
        threshold: Minimum score threshold (0-1).
        max_per_branch: Max candidates per branch in fallback search.

    Returns:
        PipelineResponse with MappingResponse and pipeline metadata.
    """
    folio = get_folio()
    sem = asyncio.Semaphore(_CONCURRENCY_LIMIT)

    tasks = [
        _process_item(item, llm_config, folio, threshold, max_per_branch, sem)
        for item in items
    ]
    results = await asyncio.gather(*tasks)

    # Unpack results, maintaining original item order
    item_results = [r[0] for r in results]
    metadata = [r[1] for r in results]

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
