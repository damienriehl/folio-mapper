"""Tests for Stage 1.5: LLM-assisted candidate expansion."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.llm_models import LLMConfig, LLMProviderType
from app.models.pipeline_models import PreScanResult, PreScanSegment, ScopedCandidate
from app.services.pipeline.stage1b_expand import (
    _find_underrepresented_branches,
    _parse_llm_suggestions,
    run_stage1b,
)


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
def llm_config():
    return LLMConfig(
        provider=LLMProviderType.OPENAI,
        api_key="test-key",
        base_url="https://api.openai.com/v1",
        model="gpt-4o",
    )


@pytest.fixture
def prescan_with_area_of_law():
    return PreScanResult(
        segments=[
            PreScanSegment(
                text="DUI/DWI Defense",
                branches=["Area of Law", "Objectives"],
                reasoning="test",
            ),
        ],
        raw_text="DUI/DWI Defense",
    )


@pytest.fixture
def stage1_candidates_no_area_of_law():
    """Stage 1 candidates with Objectives but no Area of Law."""
    return [
        ScopedCandidate(
            iri_hash="RDUI",
            label="Driving Under the Influence",
            definition="DUI offense",
            synonyms=["DWI"],
            branch="Objectives",
            score=85.0,
            source_branches=["Objectives"],
        ),
        ScopedCandidate(
            iri_hash="RDWI",
            label="Driving While Intoxicated",
            definition="DWI offense",
            synonyms=["DUI"],
            branch="Objectives",
            score=80.0,
            source_branches=["Objectives"],
        ),
    ]


# --- Parse tests ---


def test_parse_llm_suggestions_valid():
    result = _parse_llm_suggestions('["Criminal Law", "Traffic Law", "Motor Vehicle Law"]')
    assert result == ["Criminal Law", "Traffic Law", "Motor Vehicle Law"]


def test_parse_llm_suggestions_with_markdown_fences():
    result = _parse_llm_suggestions('```json\n["Criminal Law"]\n```')
    assert result == ["Criminal Law"]


def test_parse_llm_suggestions_invalid():
    result = _parse_llm_suggestions("Not valid JSON")
    assert result == []


def test_parse_llm_suggestions_filters_non_strings():
    result = _parse_llm_suggestions('[42, "Criminal Law", null, "DUI Law"]')
    assert result == ["Criminal Law", "DUI Law"]


# --- Underrepresented branch detection ---


def test_find_underrepresented_no_candidates(prescan_with_area_of_law):
    """Branches with 0 candidates are underrepresented."""
    candidates = [
        ScopedCandidate(
            iri_hash="R1",
            label="Test",
            branch="Objectives",
            score=80.0,
            source_branches=["Objectives"],
        ),
    ]
    result = _find_underrepresented_branches(prescan_with_area_of_law, candidates)
    assert "Area of Law" in result


def test_find_underrepresented_few_candidates(prescan_with_area_of_law):
    """Branches with < 3 candidates are underrepresented."""
    candidates = [
        ScopedCandidate(
            iri_hash="R1",
            label="Some Law",
            branch="Area of Law",
            score=40.0,
            source_branches=["Area of Law"],
        ),
        ScopedCandidate(
            iri_hash="R2",
            label="DUI",
            branch="Objectives",
            score=85.0,
            source_branches=["Objectives"],
        ),
    ]
    result = _find_underrepresented_branches(prescan_with_area_of_law, candidates)
    assert "Area of Law" in result


def test_find_underrepresented_adequate_coverage(prescan_with_area_of_law):
    """Branches with >= 3 candidates are NOT underrepresented."""
    candidates = [
        ScopedCandidate(
            iri_hash=f"R{i}",
            label=f"Law {i}",
            branch="Area of Law",
            score=70.0,
            source_branches=["Area of Law"],
        )
        for i in range(4)
    ] + [
        ScopedCandidate(
            iri_hash="R_obj",
            label="DUI",
            branch="Objectives",
            score=85.0,
            source_branches=["Objectives"],
        ),
    ]
    result = _find_underrepresented_branches(prescan_with_area_of_law, candidates)
    assert "Area of Law" not in result


def test_find_underrepresented_no_prescan_branches():
    """No branches tagged → nothing underrepresented."""
    prescan = PreScanResult(
        segments=[PreScanSegment(text="test", branches=[], reasoning="")],
        raw_text="test",
    )
    result = _find_underrepresented_branches(prescan, [])
    assert result == []


# --- Service integration tests ---


def _mock_owl_class(label, iri, definition=None, alt_labels=None, sub_class_of=None):
    owl = MagicMock()
    owl.label = label
    owl.iri = iri
    owl.definition = definition
    owl.alternative_labels = alt_labels or []
    owl.sub_class_of = sub_class_of or []
    return owl


@pytest.mark.anyio
async def test_run_stage1b_expands_underrepresented_branch(
    llm_config,
    prescan_with_area_of_law,
    stage1_candidates_no_area_of_law,
):
    """Stage 1.5 should add Area of Law candidates when Stage 1 found none."""
    mock_folio = MagicMock()
    owl_criminal = _mock_owl_class("Criminal Law", "http://example.org/CL", "Criminal law")

    with (
        patch("app.services.pipeline.stage1b_expand.get_folio", return_value=mock_folio),
        patch(
            "app.services.pipeline.stage1b_expand._resolve_branch_children",
            return_value={"RRoot", "RCL"},
        ),
        patch(
            "app.services.pipeline.stage1b_expand._llm_suggest_labels",
            new_callable=AsyncMock,
            return_value=["Criminal Law", "Traffic Law"],
        ),
        patch(
            "app.services.pipeline.stage1b_expand._search_within_branch",
            return_value=[("RCL", owl_criminal, 60.0)],
        ),
        patch("app.services.pipeline.stage1b_expand._content_words", return_value={"dui", "dwi", "defense"}),
        patch("app.services.pipeline.stage1b_expand._compute_relevance_score", return_value=55.0),
        patch("app.services.pipeline.stage1b_expand.get_branch_for_class", return_value="Area of Law"),
    ):
        new_candidates = await run_stage1b(
            "DUI/DWI Defense",
            prescan_with_area_of_law,
            stage1_candidates_no_area_of_law,
            llm_config,
        )

    assert len(new_candidates) > 0
    assert any(c.label == "Criminal Law" for c in new_candidates)
    assert all(c.iri_hash not in {"RDUI", "RDWI"} for c in new_candidates)  # No dupes


@pytest.mark.anyio
async def test_run_stage1b_skips_when_all_branches_covered(
    llm_config,
):
    """Stage 1.5 should skip when all prescan branches have enough candidates."""
    prescan = PreScanResult(
        segments=[
            PreScanSegment(text="Business Formation", branches=["Area of Law"], reasoning=""),
        ],
        raw_text="Business Formation",
    )
    # 5 Area of Law candidates — well above threshold
    candidates = [
        ScopedCandidate(
            iri_hash=f"R{i}",
            label=f"Law {i}",
            branch="Area of Law",
            score=70.0,
            source_branches=["Area of Law"],
        )
        for i in range(5)
    ]

    new_candidates = await run_stage1b("Business Formation", prescan, candidates, llm_config)
    assert new_candidates == []


@pytest.mark.anyio
async def test_run_stage1b_deduplicates_existing(
    llm_config,
    prescan_with_area_of_law,
):
    """Stage 1.5 should not add candidates already in Stage 1 results."""
    existing = [
        ScopedCandidate(
            iri_hash="RCL",
            label="Criminal Law",
            branch="Area of Law",
            score=30.0,
            source_branches=["Area of Law"],
        ),
    ]

    mock_folio = MagicMock()
    owl_criminal = _mock_owl_class("Criminal Law", "http://example.org/CL", "Criminal law")

    with (
        patch("app.services.pipeline.stage1b_expand.get_folio", return_value=mock_folio),
        patch(
            "app.services.pipeline.stage1b_expand._resolve_branch_children",
            return_value={"RRoot", "RCL"},
        ),
        patch(
            "app.services.pipeline.stage1b_expand._llm_suggest_labels",
            new_callable=AsyncMock,
            return_value=["Criminal Law"],
        ),
        patch(
            "app.services.pipeline.stage1b_expand._search_within_branch",
            return_value=[("RCL", owl_criminal, 60.0)],  # Same hash as existing
        ),
        patch("app.services.pipeline.stage1b_expand._content_words", return_value={"dui"}),
        patch("app.services.pipeline.stage1b_expand._compute_relevance_score", return_value=55.0),
        patch("app.services.pipeline.stage1b_expand.get_branch_for_class", return_value="Area of Law"),
    ):
        new_candidates = await run_stage1b(
            "DUI/DWI Defense",
            prescan_with_area_of_law,
            existing,
            llm_config,
        )

    # RCL already exists, so should not be added again
    assert len(new_candidates) == 0


@pytest.mark.anyio
async def test_run_stage1b_handles_llm_failure(
    llm_config,
    prescan_with_area_of_law,
    stage1_candidates_no_area_of_law,
):
    """Stage 1.5 should gracefully handle LLM failures."""
    mock_folio = MagicMock()

    with (
        patch("app.services.pipeline.stage1b_expand.get_folio", return_value=mock_folio),
        patch(
            "app.services.pipeline.stage1b_expand._resolve_branch_children",
            return_value={"RRoot"},
        ),
        patch(
            "app.services.pipeline.stage1b_expand._llm_suggest_labels",
            new_callable=AsyncMock,
            return_value=[],  # LLM failed
        ),
    ):
        new_candidates = await run_stage1b(
            "DUI/DWI Defense",
            prescan_with_area_of_law,
            stage1_candidates_no_area_of_law,
            llm_config,
        )

    assert new_candidates == []


@pytest.mark.anyio
async def test_run_stage1b_handles_unresolvable_branch(
    llm_config,
    prescan_with_area_of_law,
    stage1_candidates_no_area_of_law,
):
    """Stage 1.5 should skip branches that can't be resolved."""
    mock_folio = MagicMock()

    with (
        patch("app.services.pipeline.stage1b_expand.get_folio", return_value=mock_folio),
        patch(
            "app.services.pipeline.stage1b_expand._resolve_branch_children",
            return_value=None,  # Branch can't be resolved
        ),
    ):
        new_candidates = await run_stage1b(
            "DUI/DWI Defense",
            prescan_with_area_of_law,
            stage1_candidates_no_area_of_law,
            llm_config,
        )

    assert new_candidates == []
