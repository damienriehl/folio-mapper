"""Tests for embedding-based semantic search."""

from __future__ import annotations

import hashlib
import os
import pickle
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from app.models.embedding_models import EmbeddingConfig, EmbeddingProviderType, EmbeddingStatus


# --- Mock Embedding Provider ---


class MockEmbeddingProvider:
    """Deterministic embedding provider for testing.

    Generates hash-based vectors that are consistent for the same input text.
    """

    def __init__(self, dim: int = 32):
        self._dim = dim
        self._name = "mock-embed-v1"

    def embed(self, text: str) -> np.ndarray:
        vec = self._text_to_vec(text)
        return self._normalize_vec(vec)

    def embed_batch(self, texts: list[str]) -> np.ndarray:
        vecs = np.array([self._text_to_vec(t) for t in texts], dtype=np.float32)
        return self._normalize_batch(vecs)

    def dimension(self) -> int:
        return self._dim

    @property
    def model_name(self) -> str:
        return self._name

    def _text_to_vec(self, text: str) -> np.ndarray:
        """Generate a deterministic vector from text via SHA-256 hash."""
        h = hashlib.sha256(text.encode()).digest()
        # Use hash bytes to seed a sequence of floats
        raw = np.frombuffer(h * (self._dim // 32 + 1), dtype=np.uint8)[: self._dim]
        return (raw.astype(np.float32) / 128.0) - 1.0

    @staticmethod
    def _normalize_vec(vec: np.ndarray) -> np.ndarray:
        norm = np.linalg.norm(vec)
        if norm == 0:
            return vec
        return vec / norm

    @staticmethod
    def _normalize_batch(vecs: np.ndarray) -> np.ndarray:
        norms = np.linalg.norm(vecs, axis=-1, keepdims=True)
        norms = np.where(norms == 0, 1, norms)
        return vecs / norms


# --- Provider Tests ---


class TestMockProvider:
    """Test the mock provider behaves correctly."""

    def test_embed_returns_correct_shape(self):
        provider = MockEmbeddingProvider(dim=64)
        vec = provider.embed("hello world")
        assert vec.shape == (64,)

    def test_embed_is_normalized(self):
        provider = MockEmbeddingProvider(dim=64)
        vec = provider.embed("test text")
        norm = np.linalg.norm(vec)
        assert abs(norm - 1.0) < 1e-5

    def test_embed_batch_returns_correct_shape(self):
        provider = MockEmbeddingProvider(dim=32)
        texts = ["alpha", "beta", "gamma"]
        vecs = provider.embed_batch(texts)
        assert vecs.shape == (3, 32)

    def test_embed_batch_is_normalized(self):
        provider = MockEmbeddingProvider(dim=32)
        texts = ["one", "two", "three", "four"]
        vecs = provider.embed_batch(texts)
        norms = np.linalg.norm(vecs, axis=1)
        np.testing.assert_allclose(norms, 1.0, atol=1e-5)

    def test_embed_is_deterministic(self):
        provider = MockEmbeddingProvider(dim=32)
        v1 = provider.embed("same input")
        v2 = provider.embed("same input")
        np.testing.assert_array_equal(v1, v2)

    def test_different_inputs_different_vectors(self):
        provider = MockEmbeddingProvider(dim=32)
        v1 = provider.embed("input A")
        v2 = provider.embed("input B")
        assert not np.array_equal(v1, v2)

    def test_dimension(self):
        provider = MockEmbeddingProvider(dim=128)
        assert provider.dimension() == 128

    def test_model_name(self):
        provider = MockEmbeddingProvider()
        assert provider.model_name == "mock-embed-v1"


# --- Base Provider Tests ---


class TestBaseProvider:
    """Test the base provider ABC normalize utility."""

    def test_normalize_batch(self):
        from app.services.embedding.base import BaseEmbeddingProvider

        vecs = np.array([[3.0, 4.0], [0.0, 0.0], [1.0, 0.0]], dtype=np.float32)
        normed = BaseEmbeddingProvider._normalize(vecs)

        # First vector: [3/5, 4/5]
        np.testing.assert_allclose(normed[0], [0.6, 0.8], atol=1e-5)
        # Zero vector stays zero (no division by zero)
        np.testing.assert_allclose(normed[1], [0.0, 0.0], atol=1e-5)
        # Unit vector unchanged
        np.testing.assert_allclose(normed[2], [1.0, 0.0], atol=1e-5)


# --- FAISS Index Tests ---


@pytest.fixture
def sample_concepts():
    """Sample FOLIO-like concept data for testing."""
    return {
        "iri_hashes": [
            "R001", "R002", "R003", "R004", "R005",
            "R006", "R007", "R008", "R009", "R010",
        ],
        "labels": [
            "Driving Under Influence",
            "Criminal Defense",
            "Breach of Contract",
            "Personal Injury",
            "Family Law",
            "Immigration Law",
            "Intellectual Property",
            "Tax Law",
            "Bankruptcy",
            "Real Estate",
        ],
        "definitions": [
            "Operating a vehicle while impaired by alcohol or drugs",
            "Legal representation of individuals accused of crimes",
            "Failure to perform contractual obligations",
            "Physical or psychological harm caused by another's negligence",
            "Legal matters involving family relationships",
            "Law governing entry and residence of foreign nationals",
            "Legal protection of creative works and inventions",
            "Laws governing taxation and tax obligations",
            "Legal process for debt relief",
            "Law relating to land and property",
        ],
        "branches": [
            "Legal Matter Objective", "Service", "Legal Matter Objective",
            "Legal Matter Objective", "Area of Law", "Area of Law",
            "Area of Law", "Area of Law", "Area of Law", "Area of Law",
        ],
    }


@pytest.fixture
def mock_index(sample_concepts):
    """Build a FOLIOEmbeddingIndex with mock provider."""
    faiss = pytest.importorskip("faiss")

    from app.services.embedding.folio_index import FOLIOEmbeddingIndex

    provider = MockEmbeddingProvider(dim=32)
    idx = FOLIOEmbeddingIndex(
        provider=provider,
        iri_hashes=sample_concepts["iri_hashes"],
        labels=sample_concepts["labels"],
        definitions=sample_concepts["definitions"],
        branches=sample_concepts["branches"],
    )
    idx.build()
    return idx


class TestFOLIOEmbeddingIndex:
    """Test the FAISS-backed embedding index."""

    def test_build_creates_index(self, mock_index):
        assert mock_index._index is not None
        assert mock_index._index.ntotal == 10
        assert mock_index.num_concepts == 10

    def test_query_returns_results(self, mock_index):
        results = mock_index.query("DUI defense lawyer", top_k=5)
        assert len(results) > 0
        assert len(results) <= 5
        # Each result is (iri_hash, label, score)
        for iri_hash, label, score in results:
            assert isinstance(iri_hash, str)
            assert isinstance(label, str)
            assert isinstance(score, float)

    def test_query_respects_top_k(self, mock_index):
        results = mock_index.query("any legal topic", top_k=3)
        assert len(results) <= 3

    def test_query_with_branch_filter(self, mock_index):
        results = mock_index.query(
            "legal area",
            top_k=10,
            branch_filter={"Area of Law"},
        )
        # All results should be from "Area of Law" branch
        for iri_hash, label, score in results:
            idx = mock_index._iri_hashes.index(iri_hash)
            assert mock_index._branches[idx] == "Area of Law"

    def test_query_branch_filter_excludes_other_branches(self, mock_index):
        results = mock_index.query(
            "driving under influence",
            top_k=10,
            branch_filter={"Service"},
        )
        for iri_hash, _, _ in results:
            idx = mock_index._iri_hashes.index(iri_hash)
            assert mock_index._branches[idx] == "Service"

    def test_query_scores_sorted_descending(self, mock_index):
        results = mock_index.query("contract law", top_k=10)
        scores = [score for _, _, score in results]
        assert scores == sorted(scores, reverse=True)

    def test_score_candidates(self, mock_index):
        scores = mock_index.score_candidates(
            "criminal defense",
            ["R001", "R002", "R003"],
        )
        assert isinstance(scores, dict)
        assert "R001" in scores
        assert "R002" in scores
        assert "R003" in scores
        for v in scores.values():
            assert isinstance(v, float)

    def test_score_candidates_unknown_hash(self, mock_index):
        scores = mock_index.score_candidates("test", ["R001", "UNKNOWN"])
        assert "R001" in scores
        assert "UNKNOWN" not in scores

    def test_query_without_build_raises(self, sample_concepts):
        faiss = pytest.importorskip("faiss")
        from app.services.embedding.folio_index import FOLIOEmbeddingIndex

        provider = MockEmbeddingProvider(dim=32)
        idx = FOLIOEmbeddingIndex(
            provider=provider,
            iri_hashes=sample_concepts["iri_hashes"],
            labels=sample_concepts["labels"],
            definitions=sample_concepts["definitions"],
            branches=sample_concepts["branches"],
        )
        with pytest.raises(RuntimeError, match="not built"):
            idx.query("test")


# --- Cache Tests ---


class TestEmbeddingCache:
    """Test disk caching of embedding index."""

    def test_cache_round_trip(self, sample_concepts):
        faiss = pytest.importorskip("faiss")
        from app.services.embedding.folio_index import FOLIOEmbeddingIndex, _CACHE_DIR

        provider = MockEmbeddingProvider(dim=32)

        # Build and save to cache
        idx1 = FOLIOEmbeddingIndex(
            provider=provider,
            iri_hashes=sample_concepts["iri_hashes"],
            labels=sample_concepts["labels"],
            definitions=sample_concepts["definitions"],
            branches=sample_concepts["branches"],
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            # Patch cache dir
            with patch("app.services.embedding.folio_index._CACHE_DIR", Path(tmpdir)):
                idx1.build(owl_hash="test_hash_123")

                # Query the original
                results1 = idx1.query("contract", top_k=5)

                # Build a new index that loads from cache
                idx2 = FOLIOEmbeddingIndex(
                    provider=provider,
                    iri_hashes=sample_concepts["iri_hashes"],
                    labels=sample_concepts["labels"],
                    definitions=sample_concepts["definitions"],
                    branches=sample_concepts["branches"],
                )

                # Patch _cache_path to use same tmpdir
                cache_file = idx1._cache_path("test_hash_123")
                # The cache file should exist inside the temp dir structure
                # Let's manually save and load with direct path
                with patch.object(idx2, "_cache_path", return_value=cache_file):
                    idx2.build(owl_hash="test_hash_123")

                results2 = idx2.query("contract", top_k=5)

            # Results should match
            assert len(results1) == len(results2)
            for (h1, l1, s1), (h2, l2, s2) in zip(results1, results2):
                assert h1 == h2
                assert l1 == l2
                np.testing.assert_allclose(s1, s2, atol=1e-5)

    def test_cache_model_mismatch_rebuilds(self, sample_concepts):
        faiss = pytest.importorskip("faiss")
        from app.services.embedding.folio_index import FOLIOEmbeddingIndex

        provider1 = MockEmbeddingProvider(dim=32)
        provider1._name = "model-A"

        provider2 = MockEmbeddingProvider(dim=32)
        provider2._name = "model-B"

        with tempfile.TemporaryDirectory() as tmpdir:
            with patch("app.services.embedding.folio_index._CACHE_DIR", Path(tmpdir)):
                # Build with model A
                idx1 = FOLIOEmbeddingIndex(
                    provider=provider1,
                    iri_hashes=sample_concepts["iri_hashes"],
                    labels=sample_concepts["labels"],
                    definitions=sample_concepts["definitions"],
                    branches=sample_concepts["branches"],
                )
                idx1.build(owl_hash="same_hash")

                # Build with model B — should NOT use model A's cache
                idx2 = FOLIOEmbeddingIndex(
                    provider=provider2,
                    iri_hashes=sample_concepts["iri_hashes"],
                    labels=sample_concepts["labels"],
                    definitions=sample_concepts["definitions"],
                    branches=sample_concepts["branches"],
                )
                # Different model name means different cache file path
                idx2.build(owl_hash="same_hash")

                # Both should work
                assert idx1._index.ntotal == 10
                assert idx2._index.ntotal == 10


# --- Service Status Tests ---


class TestEmbeddingStatus:
    """Test the embedding service status reporting."""

    def test_status_model(self):
        status = EmbeddingStatus(
            available=True,
            provider="all-mpnet-base-v2",
            model="all-mpnet-base-v2",
            dimension=768,
            num_concepts=18000,
            index_cached=True,
        )
        assert status.available is True
        assert status.dimension == 768

    def test_status_unavailable(self):
        status = EmbeddingStatus(
            available=False,
            error="Missing dependency: faiss-cpu",
        )
        assert status.available is False
        assert "faiss" in status.error

    def test_config_model(self):
        config = EmbeddingConfig(
            provider=EmbeddingProviderType.LOCAL,
            model="all-MiniLM-L6-v2",
        )
        assert config.provider == EmbeddingProviderType.LOCAL
        assert config.model == "all-MiniLM-L6-v2"
        assert config.disabled is False

    def test_config_defaults(self):
        config = EmbeddingConfig()
        assert config.provider == EmbeddingProviderType.LOCAL
        assert config.model is None
        assert config.disabled is False


# --- Service Singleton Tests ---


class TestEmbeddingService:
    """Test the singleton embedding service."""

    def test_get_status_no_index(self):
        from app.services.embedding.service import get_embedding_status, reset_embedding_service

        reset_embedding_service()
        status = get_embedding_status()
        assert status.available is False

    def test_get_index_returns_none_initially(self):
        from app.services.embedding.service import get_embedding_index, reset_embedding_service

        reset_embedding_service()
        assert get_embedding_index() is None

    def test_build_with_disabled_config(self):
        from app.services.embedding.service import (
            build_embedding_index,
            get_embedding_status,
            reset_embedding_service,
        )

        reset_embedding_service()
        config = EmbeddingConfig(disabled=True)
        build_embedding_index(config)
        status = get_embedding_status()
        assert status.available is False
        assert "disabled" in (status.error or "").lower()

    def test_config_from_env(self):
        from app.services.embedding.service import _config_from_env

        with patch.dict(os.environ, {
            "EMBEDDING_PROVIDER": "openai",
            "EMBEDDING_MODEL": "text-embedding-3-large",
            "EMBEDDING_API_KEY": "sk-test",
            "EMBEDDING_DISABLED": "false",
        }):
            config = _config_from_env()
            assert config.provider == EmbeddingProviderType.OPENAI
            assert config.model == "text-embedding-3-large"
            assert config.api_key == "sk-test"
            assert config.disabled is False

    def test_config_from_env_disabled(self):
        from app.services.embedding.service import _config_from_env

        with patch.dict(os.environ, {"EMBEDDING_DISABLED": "true"}):
            config = _config_from_env()
            assert config.disabled is True

    def test_config_from_env_defaults(self):
        from app.services.embedding.service import _config_from_env

        with patch.dict(os.environ, {}, clear=True):
            config = _config_from_env()
            assert config.provider == EmbeddingProviderType.LOCAL
            assert config.model is None


# --- Pipeline Integration Tests ---


class TestPipelineEmbeddingIntegration:
    """Test that embeddings integrate correctly with pipeline stages."""

    def test_stage1_adds_embedding_candidates(self, sample_concepts):
        """Stage 1 should add candidates from embedding search."""
        from app.services.pipeline.stage1_filter import _add_embedding_candidates
        from app.models.pipeline_models import PreScanResult, PreScanSegment, ScopedCandidate

        # Create a mock index that returns controlled high-similarity results
        mock_idx = MagicMock()
        mock_idx.query.return_value = [
            ("R001", "Driving Under Influence", 0.85),
            ("R002", "Criminal Defense", 0.72),
            ("R003", "Breach of Contract", 0.45),
        ]

        # Mock FOLIO — use a dict-like mock that supports [] indexing
        concept_data = {}
        for i, h in enumerate(sample_concepts["iri_hashes"]):
            mock_class = MagicMock()
            mock_class.label = sample_concepts["labels"][i]
            mock_class.definition = sample_concepts["definitions"][i]
            mock_class.alternative_labels = []
            concept_data[h] = mock_class

        mock_folio = MagicMock()
        mock_folio.__getitem__ = lambda self, key: concept_data.get(key)

        # Start with empty best dict
        best = {}
        prescan = PreScanResult(
            segments=[PreScanSegment(text="DUI defense", branches=[])],
            raw_text="DUI defense",
        )

        with patch("app.services.embedding.service.get_embedding_index", return_value=mock_idx):
            with patch("app.services.pipeline.stage1_filter.get_branch_for_class", return_value="Legal Matter Objective"):
                added = _add_embedding_candidates(mock_folio, "DUI defense", best, prescan)

        assert added == 3
        assert len(best) == 3
        # All added candidates should have "embedding" as source
        for candidate in best.values():
            assert "embedding" in candidate.source_branches
        # Scores should be scaled from cosine similarity to 0-85 range
        assert best["R001"].score == round(0.85 * 85.0, 1)
        assert best["R002"].score == round(0.72 * 85.0, 1)

    def test_stage1_embedding_respects_existing(self, sample_concepts):
        """Embedding candidates should not overwrite existing keyword matches."""
        faiss = pytest.importorskip("faiss")
        from app.services.embedding.folio_index import FOLIOEmbeddingIndex
        from app.services.pipeline.stage1_filter import _add_embedding_candidates
        from app.models.pipeline_models import PreScanResult, PreScanSegment, ScopedCandidate

        provider = MockEmbeddingProvider(dim=32)
        mock_idx = FOLIOEmbeddingIndex(
            provider=provider,
            iri_hashes=sample_concepts["iri_hashes"],
            labels=sample_concepts["labels"],
            definitions=sample_concepts["definitions"],
            branches=sample_concepts["branches"],
        )
        mock_idx.build()

        mock_folio = MagicMock()

        # Pre-populate best with an existing candidate
        best = {
            "R001": ScopedCandidate(
                iri_hash="R001",
                label="Driving Under Influence",
                definition="Operating a vehicle while impaired",
                branch="Legal Matter Objective",
                score=95.0,
                source_branches=["keyword"],
            ),
        }
        prescan = PreScanResult(
            segments=[PreScanSegment(text="DUI", branches=[])],
            raw_text="DUI",
        )

        with patch("app.services.embedding.service.get_embedding_index", return_value=mock_idx):
            with patch("app.services.pipeline.stage1_filter.get_branch_for_class", return_value="Legal Matter Objective"):
                _add_embedding_candidates(mock_folio, "DUI", best, prescan)

        # R001 should still have original score and source
        assert best["R001"].score == 95.0
        assert best["R001"].source_branches == ["keyword"]

    def test_stage1_no_index_returns_zero(self):
        """When no embedding index is available, _add_embedding_candidates returns 0."""
        from app.services.pipeline.stage1_filter import _add_embedding_candidates
        from app.models.pipeline_models import PreScanResult, PreScanSegment

        mock_folio = MagicMock()
        best = {}
        prescan = PreScanResult(
            segments=[PreScanSegment(text="test", branches=[])],
            raw_text="test",
        )

        with patch("app.services.embedding.service.get_embedding_index", return_value=None):
            added = _add_embedding_candidates(mock_folio, "test", best, prescan)

        assert added == 0
        assert len(best) == 0

    def test_embedding_rerank_with_index(self, sample_concepts):
        """Embedding re-rank should blend keyword and embedding scores."""
        faiss = pytest.importorskip("faiss")
        from app.services.embedding.folio_index import FOLIOEmbeddingIndex
        from app.services.pipeline.orchestrator import _embedding_rerank
        from app.models.pipeline_models import ScopedCandidate

        provider = MockEmbeddingProvider(dim=32)
        mock_idx = FOLIOEmbeddingIndex(
            provider=provider,
            iri_hashes=sample_concepts["iri_hashes"],
            labels=sample_concepts["labels"],
            definitions=sample_concepts["definitions"],
            branches=sample_concepts["branches"],
        )
        mock_idx.build()

        candidates = [
            ScopedCandidate(
                iri_hash="R001",
                label="Driving Under Influence",
                branch="Legal Matter Objective",
                score=80.0,
            ),
            ScopedCandidate(
                iri_hash="R002",
                label="Criminal Defense",
                branch="Service",
                score=70.0,
            ),
            ScopedCandidate(
                iri_hash="R003",
                label="Breach of Contract",
                branch="Legal Matter Objective",
                score=60.0,
            ),
        ]

        with patch("app.services.embedding.service.get_embedding_index", return_value=mock_idx):
            ranked = _embedding_rerank("DUI criminal defense", candidates)

        assert len(ranked) == 3
        # Scores should be blended (not equal to original keyword scores)
        for r in ranked:
            assert r.iri_hash in {"R001", "R002", "R003"}
            assert r.score > 0
            # Reasoning should mention keyword and emb scores
            assert "keyword" in r.reasoning or "local score" in r.reasoning

    def test_embedding_rerank_without_index(self):
        """When no index is available, rerank falls back to keyword scores."""
        from app.services.pipeline.orchestrator import _embedding_rerank
        from app.models.pipeline_models import ScopedCandidate

        candidates = [
            ScopedCandidate(iri_hash="R001", label="Test", branch="Service", score=90.0),
            ScopedCandidate(iri_hash="R002", label="Other", branch="Service", score=80.0),
        ]

        with patch("app.services.embedding.service.get_embedding_index", return_value=None):
            ranked = _embedding_rerank("test query", candidates)

        assert len(ranked) == 2
        assert ranked[0].score == 90.0
        assert ranked[1].score == 80.0
        assert ranked[0].reasoning == "local score"

    def test_embedding_rerank_top_k(self, sample_concepts):
        """Re-rank should respect top_k parameter."""
        from app.services.pipeline.orchestrator import _embedding_rerank
        from app.models.pipeline_models import ScopedCandidate

        candidates = [
            ScopedCandidate(iri_hash=f"R{i:03d}", label=f"Concept {i}", branch="Service", score=90.0 - i)
            for i in range(30)
        ]

        with patch("app.services.embedding.service.get_embedding_index", return_value=None):
            ranked = _embedding_rerank("test", candidates, top_k=10)

        assert len(ranked) == 10


# --- Embedding Provider Type Tests ---


class TestEmbeddingProviderType:
    """Test the provider type enum."""

    def test_local_provider_type(self):
        assert EmbeddingProviderType.LOCAL.value == "local"

    def test_ollama_provider_type(self):
        assert EmbeddingProviderType.OLLAMA.value == "ollama"

    def test_openai_provider_type(self):
        assert EmbeddingProviderType.OPENAI.value == "openai"


# --- Router Tests ---


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client():
    from httpx import ASGITransport, AsyncClient
    from app.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.mark.anyio
async def test_embedding_status_endpoint(client):
    """GET /api/embedding/status should return status."""
    resp = await client.get("/api/embedding/status")
    assert resp.status_code == 200
    data = resp.json()
    assert "available" in data
    assert isinstance(data["available"], bool)


@pytest.mark.anyio
async def test_embedding_warmup_endpoint(client):
    """POST /api/embedding/warmup should return status (may fail gracefully)."""
    with patch("app.routers.embedding.build_embedding_index"):
        resp = await client.post("/api/embedding/warmup")
    assert resp.status_code == 200
    data = resp.json()
    assert "available" in data
