"""Tests for the mandatory branch fallback feature."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models.llm_models import LLMConfig, LLMProviderType
from app.models.mapping_models import FolioCandidate
from app.models.pipeline_models import (
    BranchFallbackResult,
    MandatoryFallbackRequest,
    MandatoryFallbackResponse,
)
from app.services.pipeline.mandatory_fallback import (
    _build_llm_prompt,
    _parse_llm_suggestions,
    run_mandatory_fallback,
)


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
        base_url="https://api.openai.com/v1",
        model="gpt-4o",
    )


# --- Model tests ---


def test_mandatory_fallback_request_model():
    req = MandatoryFallbackRequest(
        item_text="Small Business Formation",
        item_index=0,
        branches=["Area of Law", "Legal Entity"],
    )
    assert req.item_text == "Small Business Formation"
    assert req.item_index == 0
    assert len(req.branches) == 2
    assert req.llm_config is None


def test_mandatory_fallback_request_with_llm():
    req = MandatoryFallbackRequest(
        item_text="Tax Liability",
        item_index=1,
        branches=["Area of Law"],
        llm_config=LLMConfig(
            provider=LLMProviderType.OPENAI,
            model="gpt-4o",
        ),
    )
    assert req.llm_config is not None
    assert req.llm_config.provider == LLMProviderType.OPENAI


def test_branch_fallback_result_model():
    result = BranchFallbackResult(
        branch="Area of Law",
        branch_color="#1A5276",
        candidates=[
            FolioCandidate(
                label="Business Law",
                iri="http://example.org/Business_Law",
                iri_hash="RBusiness_Law",
                definition="Laws governing business",
                synonyms=[],
                branch="Area of Law",
                branch_color="#1A5276",
                hierarchy_path=[{"label": "Area of Law", "iri_hash": "RAoL"}, {"label": "Business Law", "iri_hash": "RBL"}],
                score=75.0,
            )
        ],
    )
    assert result.branch == "Area of Law"
    assert len(result.candidates) == 1


def test_mandatory_fallback_response_model():
    resp = MandatoryFallbackResponse(
        item_index=0,
        fallback_results=[
            BranchFallbackResult(
                branch="Area of Law",
                branch_color="#1A5276",
                candidates=[],
            )
        ],
    )
    assert resp.item_index == 0
    assert len(resp.fallback_results) == 1


# --- LLM suggestion parsing tests ---


def test_parse_llm_suggestions_valid_json():
    result = _parse_llm_suggestions('["Business Law", "Corporate Law", "Tax Law"]')
    assert result == ["Business Law", "Corporate Law", "Tax Law"]


def test_parse_llm_suggestions_with_fences():
    result = _parse_llm_suggestions('```json\n["Contract Law", "Tort Law"]\n```')
    assert result == ["Contract Law", "Tort Law"]


def test_parse_llm_suggestions_invalid():
    result = _parse_llm_suggestions("Not a JSON array at all")
    assert result == []


def test_parse_llm_suggestions_non_string_items():
    result = _parse_llm_suggestions('[1, "Valid Label", null, "Another"]')
    assert result == ["Valid Label", "Another"]


# --- Service tests (mocked FOLIO) ---


def _mock_owl_class(label="Test Concept", iri="http://example.org/Test", definition=None, alt_labels=None, sub_class_of=None):
    owl = MagicMock()
    owl.label = label
    owl.iri = iri
    owl.definition = definition
    owl.alternative_labels = alt_labels or []
    owl.sub_class_of = sub_class_of or []
    return owl


@pytest.mark.anyio
async def test_run_mandatory_fallback_local_only():
    """Test fallback with local FOLIO search only (no LLM)."""
    mock_folio = MagicMock()
    owl1 = _mock_owl_class("Business Organizations Law", "http://example.org/BOL", "Law of business organizations")
    owl2 = _mock_owl_class("Corporate Formation", "http://example.org/CF", "Forming corporations")

    # _resolve_branch_children returns a set of hashes
    # _search_within_branch returns list of (iri_hash, owl_class, score)
    with (
        patch("app.services.pipeline.mandatory_fallback.get_folio", return_value=mock_folio),
        patch(
            "app.services.pipeline.mandatory_fallback._resolve_branch_children",
            return_value={"RBranch_Root", "RBOL", "RCF"},
        ),
        patch(
            "app.services.pipeline.mandatory_fallback._search_within_branch",
            return_value=[("RBOL", owl1, 65.0), ("RCF", owl2, 50.0)],
        ),
        patch("app.services.pipeline.mandatory_fallback._build_hierarchy_path", return_value=[{"label": "Area of Law", "iri_hash": "RAoL"}, {"label": "Business Organizations Law", "iri_hash": "RBOL"}]),
        patch("app.services.pipeline.mandatory_fallback.get_branch_for_class", return_value="Area of Law"),
    ):
        results = await run_mandatory_fallback(
            item_text="Small Business Formation",
            branches=["Area of Law"],
            llm_config=None,
        )

    assert len(results) == 1
    assert results[0].branch == "Area of Law"
    assert len(results[0].candidates) == 2
    assert results[0].candidates[0].label == "Business Organizations Law"
    assert results[0].candidates[0].score == 65.0


@pytest.mark.anyio
async def test_run_mandatory_fallback_with_llm():
    """Test fallback with LLM suggestions when local results are insufficient."""
    mock_folio = MagicMock()
    owl1 = _mock_owl_class("Business Law", "http://example.org/BL", "General business law")

    llm_config = LLMConfig(
        provider=LLMProviderType.OPENAI,
        model="gpt-4o",
    )

    # First call (local search): returns empty
    # Second call (LLM label search): returns result
    search_calls = [[], [("RBL", owl1, 70.0)]]

    with (
        patch("app.services.pipeline.mandatory_fallback.get_folio", return_value=mock_folio),
        patch(
            "app.services.pipeline.mandatory_fallback._resolve_branch_children",
            return_value={"RBranch_Root", "RBL"},
        ),
        patch(
            "app.services.pipeline.mandatory_fallback._search_within_branch",
            side_effect=search_calls,
        ),
        patch(
            "app.services.pipeline.mandatory_fallback._llm_suggest_labels",
            new_callable=AsyncMock,
            return_value=["Business Law"],
        ),
        patch("app.services.pipeline.mandatory_fallback._build_hierarchy_path", return_value=[{"label": "Area of Law", "iri_hash": "RAoL"}, {"label": "Business Law", "iri_hash": "RBL"}]),
        patch("app.services.pipeline.mandatory_fallback.get_branch_for_class", return_value="Area of Law"),
        patch("app.services.pipeline.mandatory_fallback._content_words", return_value={"business", "formation"}),
        patch("app.services.pipeline.mandatory_fallback._compute_relevance_score", return_value=70.0),
    ):
        results = await run_mandatory_fallback(
            item_text="Small Business Formation",
            branches=["Area of Law"],
            llm_config=llm_config,
        )

    assert len(results) == 1
    assert len(results[0].candidates) == 1
    assert results[0].candidates[0].label == "Business Law"


@pytest.mark.anyio
async def test_run_mandatory_fallback_with_see_also():
    """Test fallback finds cross-branch candidates via see_also traversal."""
    mock_folio = MagicMock()
    owl_criminal = _mock_owl_class("Criminal Law", "http://example.org/CL", "Criminal law area")

    with (
        patch("app.services.pipeline.mandatory_fallback.get_folio", return_value=mock_folio),
        patch(
            "app.services.pipeline.mandatory_fallback._resolve_branch_children",
            return_value={"RBranch_Root", "RCL"},
        ),
        patch(
            "app.services.pipeline.mandatory_fallback._search_within_branch",
            return_value=[],  # Keyword search finds nothing
        ),
        patch(
            "app.services.pipeline.mandatory_fallback._see_also_within_branch",
            return_value=[("RCL", owl_criminal, 45.0)],  # see_also finds Criminal Law
        ),
        patch("app.services.pipeline.mandatory_fallback._build_hierarchy_path", return_value=[{"label": "Area of Law", "iri_hash": "RAoL"}, {"label": "Criminal Law", "iri_hash": "RCL"}]),
        patch("app.services.pipeline.mandatory_fallback.get_branch_for_class", return_value="Area of Law"),
    ):
        results = await run_mandatory_fallback(
            item_text="Drug Offenses",
            branches=["Area of Law"],
            llm_config=None,
        )

    assert len(results) == 1
    assert results[0].branch == "Area of Law"
    assert len(results[0].candidates) == 1
    assert results[0].candidates[0].label == "Criminal Law"
    assert results[0].candidates[0].score == 45.0


@pytest.mark.anyio
async def test_run_mandatory_fallback_unresolvable_branch():
    """Test fallback when branch cannot be resolved."""
    mock_folio = MagicMock()

    with (
        patch("app.services.pipeline.mandatory_fallback.get_folio", return_value=mock_folio),
        patch(
            "app.services.pipeline.mandatory_fallback._resolve_branch_children",
            return_value=None,
        ),
    ):
        results = await run_mandatory_fallback(
            item_text="Test",
            branches=["Nonexistent Branch"],
        )

    assert len(results) == 1
    assert results[0].branch == "Nonexistent Branch"
    assert len(results[0].candidates) == 0


# --- Endpoint tests ---


@pytest.mark.anyio
async def test_mandatory_fallback_endpoint(client: AsyncClient):
    """Test the POST /api/mapping/mandatory-fallback endpoint."""
    mock_results = [
        BranchFallbackResult(
            branch="Area of Law",
            branch_color="#1A5276",
            candidates=[
                FolioCandidate(
                    label="Business Law",
                    iri="http://example.org/BL",
                    iri_hash="RBL",
                    definition="Business law",
                    synonyms=[],
                    branch="Area of Law",
                    branch_color="#1A5276",
                    hierarchy_path=[{"label": "Area of Law", "iri_hash": "RAoL"}, {"label": "Business Law", "iri_hash": "RBL"}],
                    score=70.0,
                )
            ],
        )
    ]

    with patch(
        "app.routers.mapping.run_mandatory_fallback",
        new_callable=AsyncMock,
        return_value=mock_results,
    ):
        resp = await client.post(
            "/api/mapping/mandatory-fallback",
            json={
                "item_text": "Small Business Formation",
                "item_index": 0,
                "branches": ["Area of Law"],
            },
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["item_index"] == 0
    assert len(data["fallback_results"]) == 1
    assert data["fallback_results"][0]["branch"] == "Area of Law"
    assert len(data["fallback_results"][0]["candidates"]) == 1


@pytest.mark.anyio
async def test_mandatory_fallback_endpoint_with_llm(client: AsyncClient):
    """Test fallback endpoint with LLM config."""
    with patch(
        "app.routers.mapping.run_mandatory_fallback",
        new_callable=AsyncMock,
        return_value=[],
    ) as mock_run:
        resp = await client.post(
            "/api/mapping/mandatory-fallback",
            json={
                "item_text": "Tax Planning",
                "item_index": 1,
                "branches": ["Area of Law"],
                "llm_config": {
                    "provider": "openai",
                    "model": "gpt-4o",
                },
            },
            headers={"Authorization": "Bearer test-key"},
        )

    assert resp.status_code == 200
    # Verify the LLM config was passed through
    call_kwargs = mock_run.call_args
    assert call_kwargs.kwargs["llm_config"] is not None
    assert call_kwargs.kwargs["llm_config"].provider == LLMProviderType.OPENAI


# --- Prompt building tests ---


def test_build_llm_prompt_without_labels():
    prompt = _build_llm_prompt("Workers Compensation", "Service")
    assert "Workers Compensation" in prompt
    assert "Service" in prompt
    assert "top-level concepts" not in prompt


def test_build_llm_prompt_with_labels():
    labels = ["Dispute Service", "Litigation Practice", "Compliance Service"]
    prompt = _build_llm_prompt("Workers Compensation", "Service", branch_labels=labels)
    assert "Workers Compensation" in prompt
    assert "Service" in prompt
    assert "top-level concepts" in prompt
    assert "Dispute Service" in prompt
    assert "Litigation Practice" in prompt
    assert "Compliance Service" in prompt
    assert "Use these as guidance" in prompt


def test_build_llm_prompt_with_empty_labels():
    prompt = _build_llm_prompt("Test", "Service", branch_labels=[])
    assert "top-level concepts" not in prompt


# --- Structural embedding tests ---


@pytest.mark.anyio
async def test_run_mandatory_fallback_structural_embedding():
    """Test fallback finds candidates via structural embedding search (L1+L2 only)."""
    mock_folio = MagicMock()
    owl_dispute = _mock_owl_class("Dispute Service", "http://example.org/DS", "Service for resolving disputes")

    mock_index = MagicMock()
    # First call: regular embedding search returns nothing relevant
    # Second call: structural embedding search returns Dispute Service
    mock_index.query.side_effect = [
        [],  # Step 1.75: regular embedding
        [("RDS", "Dispute Service", 0.82)],  # Step 1.75b: structural
    ]
    mock_folio.__getitem__ = lambda self, key: owl_dispute if key == "RDS" else None

    with (
        patch("app.services.pipeline.mandatory_fallback.get_folio", return_value=mock_folio),
        patch(
            "app.services.pipeline.mandatory_fallback._resolve_branch_children",
            return_value={"RService_Root", "RDS"},
        ),
        patch(
            "app.services.pipeline.mandatory_fallback._search_within_branch",
            return_value=[],
        ),
        patch(
            "app.services.pipeline.mandatory_fallback._see_also_within_branch",
            return_value=[],
        ),
        patch("app.services.pipeline.mandatory_fallback._build_hierarchy_path", return_value=[]),
        patch("app.services.pipeline.mandatory_fallback.get_branch_for_class", return_value="Service"),
        patch(
            "app.services.pipeline.mandatory_fallback._resolve_branch_level_hashes",
            return_value=frozenset({"RService_Root", "RDS", "RLP"}),
        ),
        patch("app.services.embedding.service.get_embedding_index", return_value=mock_index),
    ):
        results = await run_mandatory_fallback(
            item_text="Workers Compensation",
            branches=["Service"],
            llm_config=None,
        )

    assert len(results) == 1
    assert results[0].branch == "Service"
    assert any(c.label == "Dispute Service" for c in results[0].candidates)
