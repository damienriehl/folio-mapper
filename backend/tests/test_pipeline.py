"""Tests for the LLM-powered mapping pipeline (Stages 0-3)."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models.llm_models import LLMConfig, LLMProviderType
from app.models.mapping_models import (
    BranchGroup,
    BranchInfo,
    FolioCandidate,
    ItemMappingResult,
    MappingResponse,
)
from app.models.pipeline_models import (
    JudgedCandidate,
    PipelineItemMetadata,
    PipelineRequest,
    PipelineResponse,
    PreScanResult,
    PreScanSegment,
    RankedCandidate,
    ScopedCandidate,
)
from app.services.pipeline.prompts import build_judge_prompt, build_prescan_prompt, build_ranking_prompt
from app.services.pipeline.stage0_prescan import _parse_prescan_json, _strip_markdown_fences
from app.services.pipeline.stage2_rank import _parse_ranking_json
from app.services.pipeline.stage3_judge import _parse_judge_json


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.fixture
def llm_config():
    return LLMConfig(
        provider=LLMProviderType.OPENAI,
        api_key="test-key",
        base_url="https://api.openai.com/v1",
        model="gpt-4o",
    )


# --- Pipeline model tests ---


def test_prescan_segment_model():
    seg = PreScanSegment(text="investigation", branches=["Service"], reasoning="enforcement activity")
    assert seg.text == "investigation"
    assert seg.branches == ["Service"]


def test_prescan_result_model():
    result = PreScanResult(
        segments=[PreScanSegment(text="agency", branches=["Actor / Player"])],
        raw_text="Agency investigation",
    )
    assert len(result.segments) == 1
    assert result.raw_text == "Agency investigation"


def test_scoped_candidate_model():
    c = ScopedCandidate(
        iri_hash="Rtest123",
        label="Investigation",
        definition="An investigation activity",
        synonyms=["Inquiry"],
        branch="Service",
        score=85.0,
        source_branches=["Service"],
    )
    assert c.score == 85.0
    assert c.branch == "Service"


def test_ranked_candidate_model():
    r = RankedCandidate(iri_hash="Rtest123", score=92.5, reasoning="Direct match")
    assert r.score == 92.5


def test_judged_candidate_model():
    j = JudgedCandidate(
        iri_hash="Rtest123", original_score=92.5, adjusted_score=88.0,
        verdict="penalized", reasoning="Too generic",
    )
    assert j.original_score == 92.5
    assert j.adjusted_score == 88.0
    assert j.verdict == "penalized"


def test_pipeline_response_model():
    resp = PipelineResponse(
        mapping=MappingResponse(items=[], total_items=0, branches_available=[]),
        pipeline_metadata=[],
    )
    assert resp.mapping.total_items == 0


# --- Prompt building tests ---


def test_build_prescan_prompt_has_branches():
    messages = build_prescan_prompt("Contract review")
    assert len(messages) == 2
    assert messages[0]["role"] == "system"
    assert messages[1]["role"] == "user"
    # Should contain branch names
    assert "Service" in messages[0]["content"]
    assert "Area of Law" in messages[0]["content"]
    assert "Actor / Player" in messages[0]["content"]
    # Should NOT contain excluded branches
    assert "Standards Compatibility" not in messages[0]["content"]
    assert "SANDBOX" not in messages[0]["content"]
    # User message should contain the input text
    assert "Contract review" in messages[1]["content"]


def test_build_ranking_prompt_groups_by_branch():
    prescan = PreScanResult(
        segments=[PreScanSegment(text="investigation", branches=["Service"])],
        raw_text="Agency investigation",
    )
    candidates = [
        ScopedCandidate(
            iri_hash="R1", label="Investigation", branch="Service",
            score=80.0, source_branches=["Service"],
        ),
        ScopedCandidate(
            iri_hash="R2", label="Agency", branch="Actor / Player",
            score=70.0, source_branches=["Actor / Player"],
        ),
    ]
    messages = build_ranking_prompt("Agency investigation", prescan, candidates)
    assert len(messages) == 2
    assert "Investigation" in messages[1]["content"]
    assert "Agency" in messages[1]["content"]
    assert "branch: Service" in messages[1]["content"]
    assert "branch: Actor / Player" in messages[1]["content"]


def test_build_judge_prompt_includes_candidates():
    prescan = PreScanResult(
        segments=[PreScanSegment(text="investigation", branches=["Service"])],
        raw_text="investigation",
    )
    ranked = [
        RankedCandidate(iri_hash="R1", score=90.0, reasoning="Strong match"),
        RankedCandidate(iri_hash="R2", score=70.0, reasoning="Moderate match"),
    ]
    scoped_lookup = {
        "R1": ScopedCandidate(
            iri_hash="R1", label="Investigation", branch="Service",
            definition="An investigation activity", score=85.0, source_branches=["Service"],
        ),
        "R2": ScopedCandidate(
            iri_hash="R2", label="Inquiry", branch="Service",
            definition="A formal inquiry", score=70.0, source_branches=["Service"],
        ),
    }
    messages = build_judge_prompt("investigation", prescan, ranked, scoped_lookup)
    assert len(messages) == 2
    assert "REDUCE FALSE POSITIVES" in messages[0]["content"]
    assert "REDUCE FALSE NEGATIVES" in messages[0]["content"]
    assert "Investigation" in messages[1]["content"]
    assert "Inquiry" in messages[1]["content"]
    assert "branch: Service" in messages[1]["content"]


# --- Stage 0 JSON parsing tests ---


def test_strip_markdown_fences():
    raw = '```json\n{"segments": []}\n```'
    assert _strip_markdown_fences(raw) == '{"segments": []}'


def test_strip_markdown_fences_no_fences():
    raw = '{"segments": []}'
    assert _strip_markdown_fences(raw) == '{"segments": []}'


def test_parse_prescan_json_valid():
    raw = json.dumps({
        "segments": [
            {"text": "Agency investigation", "branches": ["Service", "Actor / Player"], "reasoning": "test"},
            {"text": "enforcement", "branches": ["Service"], "reasoning": "test"},
        ]
    })
    result = _parse_prescan_json(raw, "Agency investigation and/or enforcement")
    assert len(result.segments) == 2
    assert result.segments[0].text == "Agency investigation"
    assert "Service" in result.segments[0].branches
    assert "Actor / Player" in result.segments[0].branches


def test_parse_prescan_json_filters_invalid_branches():
    raw = json.dumps({
        "segments": [
            {"text": "test", "branches": ["Service", "Made Up Branch", "Standards Compatibility"]},
        ]
    })
    result = _parse_prescan_json(raw, "test")
    assert result.segments[0].branches == ["Service"]


def test_parse_prescan_json_invalid_json_falls_back():
    result = _parse_prescan_json("not json at all", "original text")
    assert len(result.segments) == 1
    assert result.segments[0].text == "original text"
    assert result.segments[0].branches == []
    assert result.segments[0].reasoning == "fallback"


def test_parse_prescan_json_empty_segments_falls_back():
    raw = json.dumps({"segments": []})
    result = _parse_prescan_json(raw, "original text")
    assert len(result.segments) == 1
    assert result.segments[0].text == "original text"


def test_parse_prescan_json_with_fences():
    raw = '```json\n' + json.dumps({
        "segments": [{"text": "test", "branches": ["Service"]}]
    }) + '\n```'
    result = _parse_prescan_json(raw, "test")
    assert len(result.segments) == 1
    assert result.segments[0].branches == ["Service"]


# --- Stage 2 JSON parsing tests ---


def test_parse_ranking_json_valid():
    known = {"R1", "R2", "R3"}
    raw = json.dumps({
        "ranked": [
            {"iri_hash": "R1", "score": 95, "reasoning": "Exact match"},
            {"iri_hash": "R2", "score": 80, "reasoning": "Strong match"},
        ]
    })
    result = _parse_ranking_json(raw, known)
    assert result is not None
    assert len(result) == 2
    assert result[0].iri_hash == "R1"
    assert result[0].score == 95


def test_parse_ranking_json_drops_unknown_hashes():
    known = {"R1"}
    raw = json.dumps({
        "ranked": [
            {"iri_hash": "R1", "score": 90, "reasoning": "ok"},
            {"iri_hash": "HALLUCINATED", "score": 85, "reasoning": "fake"},
        ]
    })
    result = _parse_ranking_json(raw, known)
    assert result is not None
    assert len(result) == 1
    assert result[0].iri_hash == "R1"


def test_parse_ranking_json_clamps_scores():
    known = {"R1"}
    raw = json.dumps({
        "ranked": [{"iri_hash": "R1", "score": 150, "reasoning": "over"}]
    })
    result = _parse_ranking_json(raw, known)
    assert result is not None
    assert result[0].score == 100.0


def test_parse_ranking_json_invalid_returns_none():
    result = _parse_ranking_json("not json", {"R1"})
    assert result is None


def test_parse_ranking_json_empty_ranked_returns_none():
    raw = json.dumps({"ranked": []})
    result = _parse_ranking_json(raw, {"R1"})
    assert result is None


def test_parse_ranking_json_with_fences():
    known = {"R1"}
    raw = '```json\n' + json.dumps({
        "ranked": [{"iri_hash": "R1", "score": 88, "reasoning": "ok"}]
    }) + '\n```'
    result = _parse_ranking_json(raw, known)
    assert result is not None
    assert result[0].score == 88


# --- Stage 3 JSON parsing tests ---


def test_parse_judge_json_valid():
    ranked_lookup = {
        "R1": RankedCandidate(iri_hash="R1", score=90.0, reasoning="ok"),
        "R2": RankedCandidate(iri_hash="R2", score=70.0, reasoning="ok"),
    }
    raw = json.dumps({
        "judged": [
            {"iri_hash": "R1", "adjusted_score": 92, "verdict": "boosted", "reasoning": "Good match"},
            {"iri_hash": "R2", "adjusted_score": 40, "verdict": "penalized", "reasoning": "Too generic"},
        ]
    })
    result = _parse_judge_json(raw, ranked_lookup)
    assert result is not None
    assert len(result) == 2
    assert result[0].iri_hash == "R1"
    assert result[0].adjusted_score == 92
    assert result[0].verdict == "boosted"
    assert result[1].adjusted_score == 40
    assert result[1].verdict == "penalized"


def test_parse_judge_json_rejected_forces_zero():
    ranked_lookup = {"R1": RankedCandidate(iri_hash="R1", score=80.0, reasoning="ok")}
    raw = json.dumps({
        "judged": [
            {"iri_hash": "R1", "adjusted_score": 50, "verdict": "rejected", "reasoning": "Wrong concept"},
        ]
    })
    result = _parse_judge_json(raw, ranked_lookup)
    assert result is not None
    assert result[0].adjusted_score == 0.0
    assert result[0].verdict == "rejected"


def test_parse_judge_json_confirmed_trusts_adjusted_score():
    ranked_lookup = {"R1": RankedCandidate(iri_hash="R1", score=80.0, reasoning="ok")}
    raw = json.dumps({
        "judged": [
            {"iri_hash": "R1", "adjusted_score": 95, "verdict": "confirmed", "reasoning": "Looks good"},
        ]
    })
    result = _parse_judge_json(raw, ranked_lookup)
    assert result is not None
    # confirmed trusts the judge's adjusted_score (no ±5 clamping)
    assert result[0].adjusted_score == 95.0


def test_parse_judge_json_drops_unknown_hashes():
    ranked_lookup = {"R1": RankedCandidate(iri_hash="R1", score=80.0, reasoning="ok")}
    raw = json.dumps({
        "judged": [
            {"iri_hash": "R1", "adjusted_score": 82, "verdict": "confirmed", "reasoning": "ok"},
            {"iri_hash": "FAKE", "adjusted_score": 90, "verdict": "boosted", "reasoning": "hallucinated"},
        ]
    })
    result = _parse_judge_json(raw, ranked_lookup)
    assert result is not None
    assert len(result) == 1
    assert result[0].iri_hash == "R1"


def test_parse_judge_json_invalid_returns_none():
    ranked_lookup = {"R1": RankedCandidate(iri_hash="R1", score=80.0, reasoning="ok")}
    result = _parse_judge_json("not json", ranked_lookup)
    assert result is None


def test_parse_judge_json_empty_returns_none():
    ranked_lookup = {"R1": RankedCandidate(iri_hash="R1", score=80.0, reasoning="ok")}
    raw = json.dumps({"judged": []})
    result = _parse_judge_json(raw, ranked_lookup)
    assert result is None


def test_parse_judge_json_with_fences():
    ranked_lookup = {"R1": RankedCandidate(iri_hash="R1", score=80.0, reasoning="ok")}
    raw = '```json\n' + json.dumps({
        "judged": [{"iri_hash": "R1", "adjusted_score": 78, "verdict": "confirmed", "reasoning": "ok"}]
    }) + '\n```'
    result = _parse_judge_json(raw, ranked_lookup)
    assert result is not None
    assert result[0].adjusted_score == 78.0


# --- Stage 0 integration test (mocked LLM) ---


@pytest.mark.anyio
async def test_stage0_calls_llm(llm_config):
    from app.services.pipeline.stage0_prescan import run_stage0

    mock_response = json.dumps({
        "segments": [
            {"text": "Agency investigation", "branches": ["Service", "Actor / Player"], "reasoning": "test"},
            {"text": "enforcement", "branches": ["Service"], "reasoning": "test"},
        ]
    })

    mock_provider = AsyncMock()
    mock_provider.complete = AsyncMock(return_value=mock_response)

    with patch("app.services.pipeline.stage0_prescan.get_provider", return_value=mock_provider):
        result = await run_stage0("Agency investigation and/or enforcement", llm_config)

    assert len(result.segments) == 2
    assert "Service" in result.segments[0].branches
    mock_provider.complete.assert_called_once()
    call_kwargs = mock_provider.complete.call_args
    assert call_kwargs.kwargs.get("temperature") == 0.1
    assert call_kwargs.kwargs.get("max_tokens") == 1024


@pytest.mark.anyio
async def test_stage0_fallback_on_llm_failure(llm_config):
    from app.services.pipeline.stage0_prescan import run_stage0

    mock_provider = AsyncMock()
    mock_provider.complete = AsyncMock(side_effect=Exception("API error"))

    with patch("app.services.pipeline.stage0_prescan.get_provider", return_value=mock_provider):
        result = await run_stage0("test input", llm_config)

    assert len(result.segments) == 1
    assert result.segments[0].text == "test input"
    assert result.segments[0].branches == []


# --- Stage 2 integration test (mocked LLM) ---


@pytest.mark.anyio
async def test_stage2_calls_llm(llm_config):
    from app.services.pipeline.stage2_rank import run_stage2

    prescan = PreScanResult(
        segments=[PreScanSegment(text="investigation", branches=["Service"])],
        raw_text="investigation",
    )
    candidates = [
        ScopedCandidate(
            iri_hash="R1", label="Investigation", branch="Service",
            score=80.0, source_branches=["Service"],
        ),
    ]

    mock_response = json.dumps({
        "ranked": [{"iri_hash": "R1", "score": 92, "reasoning": "Strong match"}]
    })
    mock_provider = AsyncMock()
    mock_provider.complete = AsyncMock(return_value=mock_response)

    with patch("app.services.pipeline.stage2_rank.get_provider", return_value=mock_provider):
        result = await run_stage2("investigation", prescan, candidates, llm_config)

    assert len(result) == 1
    assert result[0].iri_hash == "R1"
    assert result[0].score == 92
    mock_provider.complete.assert_called_once()
    call_kwargs = mock_provider.complete.call_args
    assert call_kwargs.kwargs.get("temperature") == 0.1
    assert call_kwargs.kwargs.get("max_tokens") == 4096


@pytest.mark.anyio
async def test_stage2_fallback_on_llm_failure(llm_config):
    from app.services.pipeline.stage2_rank import run_stage2

    prescan = PreScanResult(
        segments=[PreScanSegment(text="test", branches=[])],
        raw_text="test",
    )
    candidates = [
        ScopedCandidate(
            iri_hash="R1", label="Test", branch="Service",
            score=75.0, source_branches=["Service"],
        ),
    ]

    mock_provider = AsyncMock()
    mock_provider.complete = AsyncMock(side_effect=Exception("API error"))

    with patch("app.services.pipeline.stage2_rank.get_provider", return_value=mock_provider):
        result = await run_stage2("test", prescan, candidates, llm_config)

    assert len(result) == 1
    assert result[0].iri_hash == "R1"
    assert result[0].score == 75.0  # Falls back to local score


@pytest.mark.anyio
async def test_stage2_empty_candidates(llm_config):
    from app.services.pipeline.stage2_rank import run_stage2

    prescan = PreScanResult(segments=[], raw_text="test")
    result = await run_stage2("test", prescan, [], llm_config)
    assert result == []


# --- Stage 3 integration test (mocked LLM) ---


@pytest.mark.anyio
async def test_stage3_calls_llm(llm_config):
    from app.services.pipeline.stage3_judge import run_stage3

    prescan = PreScanResult(
        segments=[PreScanSegment(text="investigation", branches=["Service"])],
        raw_text="investigation",
    )
    ranked = [
        RankedCandidate(iri_hash="R1", score=90.0, reasoning="Strong match"),
        RankedCandidate(iri_hash="R2", score=60.0, reasoning="Weak match"),
    ]
    scoped_lookup = {
        "R1": ScopedCandidate(
            iri_hash="R1", label="Investigation", branch="Service",
            score=85.0, source_branches=["Service"],
        ),
        "R2": ScopedCandidate(
            iri_hash="R2", label="General Inquiry", branch="Service",
            score=60.0, source_branches=["Service"],
        ),
    }

    mock_response = json.dumps({
        "judged": [
            {"iri_hash": "R1", "adjusted_score": 93, "verdict": "boosted", "reasoning": "Exact match"},
            {"iri_hash": "R2", "adjusted_score": 0, "verdict": "rejected", "reasoning": "Too generic"},
        ]
    })
    mock_provider = AsyncMock()
    mock_provider.complete = AsyncMock(return_value=mock_response)

    with patch("app.services.pipeline.stage3_judge.get_provider", return_value=mock_provider):
        result = await run_stage3("investigation", prescan, ranked, scoped_lookup, llm_config)

    # R2 rejected → filtered out
    assert len(result) == 1
    assert result[0].iri_hash == "R1"
    assert result[0].adjusted_score == 93
    assert result[0].verdict == "boosted"
    mock_provider.complete.assert_called_once()


@pytest.mark.anyio
async def test_stage3_fallback_on_llm_failure(llm_config):
    from app.services.pipeline.stage3_judge import run_stage3

    prescan = PreScanResult(
        segments=[PreScanSegment(text="test", branches=[])],
        raw_text="test",
    )
    ranked = [
        RankedCandidate(iri_hash="R1", score=85.0, reasoning="ok"),
    ]
    scoped_lookup = {
        "R1": ScopedCandidate(
            iri_hash="R1", label="Test", branch="Service",
            score=85.0, source_branches=["Service"],
        ),
    }

    mock_provider = AsyncMock()
    mock_provider.complete = AsyncMock(side_effect=Exception("API error"))

    with patch("app.services.pipeline.stage3_judge.get_provider", return_value=mock_provider):
        result = await run_stage3("test", prescan, ranked, scoped_lookup, llm_config)

    # Fallback: scores unchanged, all confirmed
    assert len(result) == 1
    assert result[0].iri_hash == "R1"
    assert result[0].adjusted_score == 85.0
    assert result[0].verdict == "confirmed"


@pytest.mark.anyio
async def test_stage3_empty_ranked(llm_config):
    from app.services.pipeline.stage3_judge import run_stage3

    prescan = PreScanResult(segments=[], raw_text="test")
    result = await run_stage3("test", prescan, [], {}, llm_config)
    assert result == []


@pytest.mark.anyio
async def test_stage3_passes_through_unjudged_candidates(llm_config):
    """Candidates not mentioned by the judge should be passed through unchanged."""
    from app.services.pipeline.stage3_judge import run_stage3

    prescan = PreScanResult(
        segments=[PreScanSegment(text="test", branches=["Service"])],
        raw_text="test",
    )
    ranked = [
        RankedCandidate(iri_hash="R1", score=90.0, reasoning="ok"),
        RankedCandidate(iri_hash="R2", score=70.0, reasoning="ok"),
    ]
    scoped_lookup = {
        "R1": ScopedCandidate(iri_hash="R1", label="A", branch="Service", score=90.0, source_branches=[]),
        "R2": ScopedCandidate(iri_hash="R2", label="B", branch="Service", score=70.0, source_branches=[]),
    }

    # Judge only mentions R1
    mock_response = json.dumps({
        "judged": [
            {"iri_hash": "R1", "adjusted_score": 92, "verdict": "boosted", "reasoning": "good"},
        ]
    })
    mock_provider = AsyncMock()
    mock_provider.complete = AsyncMock(return_value=mock_response)

    with patch("app.services.pipeline.stage3_judge.get_provider", return_value=mock_provider):
        result = await run_stage3("test", prescan, ranked, scoped_lookup, llm_config)

    assert len(result) == 2
    hashes = {j.iri_hash for j in result}
    assert "R1" in hashes
    assert "R2" in hashes
    # R2 should be passed through with original score
    r2 = next(j for j in result if j.iri_hash == "R2")
    assert r2.adjusted_score == 70.0
    assert r2.verdict == "confirmed"


# --- Orchestrator test (all stages mocked) ---


MOCK_PRESCAN = PreScanResult(
    segments=[
        PreScanSegment(text="Agency investigation", branches=["Service", "Actor / Player"]),
        PreScanSegment(text="enforcement", branches=["Service"]),
    ],
    raw_text="Agency investigation and/or enforcement.",
)

MOCK_STAGE1 = [
    ScopedCandidate(
        iri_hash="Rinvest",
        label="Investigation",
        definition="An investigation activity",
        branch="Service",
        score=85.0,
        source_branches=["Service"],
    ),
    ScopedCandidate(
        iri_hash="Renforce",
        label="Enforcement",
        definition="Enforcement activity",
        branch="Service",
        score=80.0,
        source_branches=["Service"],
    ),
]

MOCK_RANKED = [
    RankedCandidate(iri_hash="Rinvest", score=95.0, reasoning="Direct match"),
    RankedCandidate(iri_hash="Renforce", score=88.0, reasoning="Strong match"),
]

MOCK_JUDGED = [
    JudgedCandidate(iri_hash="Rinvest", original_score=95.0, adjusted_score=93.0, verdict="confirmed", reasoning="Accurate"),
    JudgedCandidate(iri_hash="Renforce", original_score=88.0, adjusted_score=85.0, verdict="confirmed", reasoning="Accurate"),
]

MOCK_BRANCHES = [
    BranchInfo(name="Service", color="#138D75", concept_count=200),
]


@pytest.mark.anyio
async def test_orchestrator(llm_config):
    from app.models.parse_models import ParseItem
    from app.services.pipeline.orchestrator import run_pipeline

    items = [ParseItem(text="Agency investigation and/or enforcement.", index=0, ancestry=[])]

    # Mock FOLIO instance
    mock_folio = MagicMock()
    mock_owl_invest = MagicMock()
    mock_owl_invest.iri = "https://folio.openlegalstandard.org/Rinvest"
    mock_owl_invest.label = "Investigation"
    mock_owl_invest.definition = "An investigation activity"
    mock_owl_invest.alternative_labels = []
    mock_owl_invest.sub_class_of = []

    mock_owl_enforce = MagicMock()
    mock_owl_enforce.iri = "https://folio.openlegalstandard.org/Renforce"
    mock_owl_enforce.label = "Enforcement"
    mock_owl_enforce.definition = "Enforcement activity"
    mock_owl_enforce.alternative_labels = []
    mock_owl_enforce.sub_class_of = []

    mock_folio.__getitem__ = lambda self, key: {"Rinvest": mock_owl_invest, "Renforce": mock_owl_enforce}.get(key)

    with (
        patch("app.services.pipeline.orchestrator.run_stage0", return_value=MOCK_PRESCAN),
        patch("app.services.pipeline.orchestrator.run_stage1", return_value=MOCK_STAGE1),
        patch("app.services.pipeline.orchestrator.run_stage2", return_value=MOCK_RANKED),
        patch("app.services.pipeline.orchestrator.run_stage3", return_value=MOCK_JUDGED),
        patch("app.services.pipeline.orchestrator.get_folio", return_value=mock_folio),
        patch("app.services.pipeline.orchestrator.get_all_branches", return_value=MOCK_BRANCHES),
        patch("app.services.pipeline.orchestrator._build_folio_candidate_from_judged", side_effect=lambda j, sl: FolioCandidate(
            label=sl[j.iri_hash].label, iri=f"https://folio.openlegalstandard.org/{j.iri_hash}",
            iri_hash=j.iri_hash, definition=sl[j.iri_hash].definition, synonyms=[],
            branch="Service", branch_color="#138D75", hierarchy_path=[{"label": "Service", "iri_hash": "Rservice"}], score=j.adjusted_score,
        ) if j.iri_hash in sl else None),
    ):
        result = await run_pipeline(items, llm_config)

    assert isinstance(result, PipelineResponse)
    assert result.mapping.total_items == 1
    assert len(result.mapping.items) == 1

    item_result = result.mapping.items[0]
    assert item_result.total_candidates == 2
    assert item_result.item_text == "Agency investigation and/or enforcement."

    # Check metadata includes Stage 3
    assert len(result.pipeline_metadata) == 1
    meta = result.pipeline_metadata[0]
    assert meta.stage1_candidate_count == 2
    assert meta.stage2_candidate_count == 2
    assert meta.stage3_judged_count == 2
    assert len(meta.prescan.segments) == 2


# --- Endpoint test (fully mocked pipeline) ---


MOCK_PIPELINE_RESPONSE = PipelineResponse(
    mapping=MappingResponse(
        items=[
            ItemMappingResult(
                item_index=0,
                item_text="Agency investigation",
                branch_groups=[
                    BranchGroup(
                        branch="Service",
                        branch_color="#138D75",
                        candidates=[
                            FolioCandidate(
                                label="Investigation",
                                iri="https://folio.openlegalstandard.org/Rinvest",
                                iri_hash="Rinvest",
                                definition="An investigation activity",
                                synonyms=[],
                                branch="Service",
                                branch_color="#138D75",
                                hierarchy_path=[{"label": "Service", "iri_hash": "Rservice"}, {"label": "Investigation", "iri_hash": "Rinvest"}],
                                score=95.0,
                            ),
                        ],
                    ),
                ],
                total_candidates=1,
            ),
        ],
        total_items=1,
        branches_available=[],
    ),
    pipeline_metadata=[
        PipelineItemMetadata(
            item_index=0,
            item_text="Agency investigation",
            prescan=PreScanResult(
                segments=[PreScanSegment(text="Agency investigation", branches=["Service"])],
                raw_text="Agency investigation",
            ),
            stage1_candidate_count=5,
            stage2_candidate_count=1,
            stage3_judged_count=1,
            stage3_boosted=0,
            stage3_penalized=0,
            stage3_rejected=0,
        ),
    ],
)


@pytest.mark.anyio
@patch("app.routers.pipeline.run_pipeline", return_value=MOCK_PIPELINE_RESPONSE)
async def test_pipeline_endpoint(mock_run, client: AsyncClient):
    resp = await client.post(
        "/api/pipeline/map",
        json={
            "items": [{"text": "Agency investigation", "index": 0, "ancestry": []}],
            "llm_config": {
                "provider": "openai",
                "api_key": "test-key",
                "base_url": "https://api.openai.com/v1",
                "model": "gpt-4o",
            },
            "threshold": 0.3,
            "max_per_branch": 10,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["mapping"]["total_items"] == 1
    assert len(data["mapping"]["items"]) == 1
    assert data["mapping"]["items"][0]["branch_groups"][0]["branch"] == "Service"
    assert len(data["pipeline_metadata"]) == 1
    assert data["pipeline_metadata"][0]["stage1_candidate_count"] == 5


# --- Acceptance test: "Agency investigation and/or enforcement." ---


@pytest.mark.anyio
async def test_acceptance_agency_investigation(llm_config):
    """End-to-end acceptance test with mocked LLM calls.

    Verifies the PRD acceptance criteria:
    - Pre-scan produces correct segment/branch tags
    - Stage 1 returns branch-scoped candidates
    - Stage 2 ranks them with scores and branch attribution
    - Stage 3 judge validates and adjusts scores
    """
    from app.models.parse_models import ParseItem
    from app.services.pipeline.orchestrator import run_pipeline

    items = [ParseItem(
        text="Agency investigation and/or enforcement.",
        index=0,
        ancestry=[],
    )]

    # Stage 0 mock: LLM segments the text
    stage0_response = json.dumps({
        "segments": [
            {
                "text": "Agency investigation",
                "branches": ["Service", "Actor / Player"],
                "reasoning": "Investigation is a legal service; agency is an actor",
            },
            {
                "text": "enforcement",
                "branches": ["Service", "Objectives"],
                "reasoning": "Enforcement is a legal service and objective",
            },
        ]
    })

    # Stage 2 mock: LLM ranks candidates
    stage2_response = json.dumps({
        "ranked": [
            {"iri_hash": "Rinvest", "score": 95, "reasoning": "Direct investigation match"},
            {"iri_hash": "Renforce", "score": 90, "reasoning": "Direct enforcement match"},
            {"iri_hash": "Ragency", "score": 75, "reasoning": "Agency actor reference"},
        ]
    })

    # Stage 3 mock: Judge validates candidates
    stage3_response = json.dumps({
        "judged": [
            {"iri_hash": "Rinvest", "adjusted_score": 96, "verdict": "boosted", "reasoning": "Exact match to investigation"},
            {"iri_hash": "Renforce", "adjusted_score": 88, "verdict": "confirmed", "reasoning": "Good enforcement match"},
            {"iri_hash": "Ragency", "adjusted_score": 40, "verdict": "penalized", "reasoning": "Agency is too generic here"},
        ]
    })

    # Mock FOLIO
    mock_folio = MagicMock()
    mock_owl_classes = {
        "Rinvest": _make_owl("Rinvest", "Investigation", "An investigation activity", ["Inquiry"]),
        "Renforce": _make_owl("Renforce", "Enforcement", "Enforcement activity", []),
        "Ragency": _make_owl("Ragency", "Agency", "A governmental agency", ["Bureau"]),
    }

    mock_folio.__getitem__ = lambda self, key: mock_owl_classes.get(key)
    mock_folio.search_by_label = MagicMock(return_value=[])
    mock_folio.search_by_prefix = MagicMock(return_value=[])
    mock_folio.get_children = MagicMock(return_value=[])

    # Mock LLM provider (returns different responses for stage 0, stage 2, stage 3)
    call_count = {"n": 0}

    async def mock_complete(messages, **kwargs):
        call_count["n"] += 1
        if call_count["n"] == 1:
            return stage0_response
        elif call_count["n"] == 2:
            return stage2_response
        return stage3_response

    mock_provider = AsyncMock()
    mock_provider.complete = mock_complete

    # Stage 1 will fallback to unscoped search since branch search returns nothing
    mock_search_candidates = [
        FolioCandidate(
            label="Investigation", iri="https://folio.openlegalstandard.org/Rinvest",
            iri_hash="Rinvest", definition="An investigation activity",
            synonyms=["Inquiry"], branch="Service", branch_color="#138D75",
            hierarchy_path=[{"label": "Service", "iri_hash": "Rservice"}, {"label": "Investigation", "iri_hash": "Rinvest"}], score=85.0,
        ),
        FolioCandidate(
            label="Enforcement", iri="https://folio.openlegalstandard.org/Renforce",
            iri_hash="Renforce", definition="Enforcement activity",
            synonyms=[], branch="Service", branch_color="#138D75",
            hierarchy_path=[{"label": "Service", "iri_hash": "Rservice"}, {"label": "Enforcement", "iri_hash": "Renforce"}], score=80.0,
        ),
        FolioCandidate(
            label="Agency", iri="https://folio.openlegalstandard.org/Ragency",
            iri_hash="Ragency", definition="A governmental agency",
            synonyms=["Bureau"], branch="Actor / Player", branch_color="#2E86C1",
            hierarchy_path=[{"label": "Actor / Player", "iri_hash": "Ractor"}, {"label": "Agency", "iri_hash": "Ragency"}], score=70.0,
        ),
    ]

    with (
        patch("app.services.pipeline.stage0_prescan.get_provider", return_value=mock_provider),
        patch("app.services.pipeline.stage2_rank.get_provider", return_value=mock_provider),
        patch("app.services.pipeline.stage3_judge.get_provider", return_value=mock_provider),
        patch("app.services.pipeline.orchestrator.get_folio", return_value=mock_folio),
        patch("app.services.pipeline.stage1_filter.get_folio", return_value=mock_folio),
        patch("app.services.pipeline.stage1_filter.search_candidates", return_value=mock_search_candidates),
        patch("app.services.pipeline.stage1_filter.get_branch_for_class", return_value="Service"),
        patch("app.services.pipeline.orchestrator.get_all_branches", return_value=MOCK_BRANCHES),
        patch("app.services.pipeline.orchestrator._build_folio_candidate_from_judged", side_effect=lambda j, sl: FolioCandidate(
            label=sl[j.iri_hash].label, iri=f"https://folio.openlegalstandard.org/{j.iri_hash}",
            iri_hash=j.iri_hash, definition=sl[j.iri_hash].definition, synonyms=[],
            branch="Service", branch_color="#138D75", hierarchy_path=[{"label": "Service", "iri_hash": "Rservice"}], score=j.adjusted_score,
        ) if j.iri_hash in sl else None),
    ):
        result = await run_pipeline(items, llm_config)

    # Verify pre-scan
    assert len(result.pipeline_metadata) == 1
    meta = result.pipeline_metadata[0]
    assert len(meta.prescan.segments) == 2
    assert "Service" in meta.prescan.segments[0].branches
    assert "Service" in meta.prescan.segments[1].branches

    # Verify candidates were produced through all stages
    assert meta.stage1_candidate_count > 0
    assert meta.stage2_candidate_count > 0
    assert meta.stage3_judged_count > 0

    # Verify mapping response has results
    assert result.mapping.total_items == 1
    item = result.mapping.items[0]
    assert item.total_candidates > 0

    # Verify LLM was called three times (stage 0 + stage 2 + stage 3)
    assert call_count["n"] == 3


def _make_owl(iri_hash: str, label: str, definition: str, alt_labels: list[str]) -> MagicMock:
    """Helper to create a mock OWLClass."""
    mock = MagicMock()
    mock.iri = f"https://folio.openlegalstandard.org/{iri_hash}"
    mock.label = label
    mock.definition = definition
    mock.alternative_labels = alt_labels
    mock.sub_class_of = []
    return mock
