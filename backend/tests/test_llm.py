"""Tests for LLM provider registry and router endpoints."""

from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models.llm_models import LLMProviderType, ModelInfo
from app.services.llm.anthropic_provider import AnthropicProvider
from app.services.llm.cohere_provider import CohereProvider
from app.services.llm.google_provider import GoogleProvider
from app.services.llm.openai_compat import OpenAICompatProvider
from app.services.llm.registry import (
    DEFAULT_BASE_URLS,
    DEFAULT_MODELS,
    KNOWN_MODELS,
    PROVIDER_DISPLAY_NAMES,
    REQUIRES_API_KEY,
    get_provider,
    sort_and_enrich_models,
)


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


# --- Registry unit tests ---


def test_all_providers_have_metadata():
    """Every provider type should have entries in all metadata dicts."""
    for p in LLMProviderType:
        assert p in DEFAULT_BASE_URLS, f"Missing default URL for {p}"
        assert p in DEFAULT_MODELS, f"Missing default model for {p}"
        assert p in PROVIDER_DISPLAY_NAMES, f"Missing display name for {p}"
        assert p in REQUIRES_API_KEY, f"Missing requires_api_key for {p}"


def test_get_provider_openai():
    provider = get_provider(LLMProviderType.OPENAI, api_key="sk-test")
    assert isinstance(provider, OpenAICompatProvider)
    assert provider.base_url == "https://api.openai.com/v1"


def test_get_provider_anthropic():
    provider = get_provider(LLMProviderType.ANTHROPIC, api_key="sk-ant-test")
    assert isinstance(provider, AnthropicProvider)
    assert provider.base_url == "https://api.anthropic.com"


def test_get_provider_google():
    provider = get_provider(LLMProviderType.GOOGLE, api_key="AIza-test")
    assert isinstance(provider, GoogleProvider)


def test_get_provider_cohere():
    provider = get_provider(LLMProviderType.COHERE, api_key="co-test")
    assert isinstance(provider, CohereProvider)


def test_get_provider_ollama():
    provider = get_provider(LLMProviderType.OLLAMA)
    assert isinstance(provider, OpenAICompatProvider)
    assert provider.base_url == "http://localhost:11434/v1"


def test_get_provider_lmstudio():
    provider = get_provider(LLMProviderType.LMSTUDIO)
    assert isinstance(provider, OpenAICompatProvider)
    assert provider.base_url == "http://localhost:1234/v1"


def test_get_provider_mistral():
    provider = get_provider(LLMProviderType.MISTRAL, api_key="test")
    assert isinstance(provider, OpenAICompatProvider)
    assert provider.base_url == "https://api.mistral.ai/v1"


def test_get_provider_meta_llama():
    provider = get_provider(LLMProviderType.META_LLAMA, api_key="test")
    assert isinstance(provider, OpenAICompatProvider)


def test_get_provider_custom_url():
    provider = get_provider(
        LLMProviderType.CUSTOM,
        base_url="http://localhost:9999/v1",
    )
    assert isinstance(provider, OpenAICompatProvider)
    assert provider.base_url == "http://localhost:9999/v1"


def test_get_provider_respects_model():
    provider = get_provider(LLMProviderType.OPENAI, api_key="sk-test", model="gpt-4o")
    assert provider.model == "gpt-4o"


# --- Local providers don't require keys ---


def test_local_providers_no_key_required():
    for p in [LLMProviderType.OLLAMA, LLMProviderType.LMSTUDIO]:
        assert REQUIRES_API_KEY[p] is False


def test_cloud_providers_require_key():
    for p in [
        LLMProviderType.OPENAI,
        LLMProviderType.ANTHROPIC,
        LLMProviderType.GOOGLE,
        LLMProviderType.MISTRAL,
        LLMProviderType.COHERE,
        LLMProviderType.META_LLAMA,
    ]:
        assert REQUIRES_API_KEY[p] is True


# --- Router endpoint tests (mocked providers) ---

MOCK_MODELS = [
    ModelInfo(id="gpt-4o", name="GPT-4o", context_window=128000),
    ModelInfo(id="gpt-4o-mini", name="GPT-4o Mini", context_window=128000),
]


@pytest.mark.anyio
@patch("app.routers.llm.get_provider")
async def test_test_connection_success(mock_get_provider, client: AsyncClient):
    mock_provider = AsyncMock()
    mock_provider.test_connection.return_value = True
    mock_get_provider.return_value = mock_provider

    resp = await client.post(
        "/api/llm/test-connection",
        json={"provider": "openai", "model": "gpt-4o"},
        headers={"Authorization": "Bearer sk-test"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["message"] == "Connection successful"


@pytest.mark.anyio
@patch("app.routers.llm.get_provider")
async def test_test_connection_failure(mock_get_provider, client: AsyncClient):
    mock_provider = AsyncMock()
    mock_provider.test_connection.side_effect = Exception("Invalid API key")
    mock_get_provider.return_value = mock_provider

    resp = await client.post(
        "/api/llm/test-connection",
        json={"provider": "openai"},
        headers={"Authorization": "Bearer bad-key"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is False
    # Error message should be generic (not leak exception details)
    assert data["message"] == "Connection test failed"


@pytest.mark.anyio
@patch("app.routers.llm.get_provider")
async def test_list_models(mock_get_provider, client: AsyncClient):
    mock_provider = AsyncMock()
    mock_provider.list_models.return_value = MOCK_MODELS
    mock_get_provider.return_value = mock_provider

    resp = await client.post(
        "/api/llm/models",
        json={"provider": "openai"},
        headers={"Authorization": "Bearer sk-test"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert data[0]["id"] == "gpt-4o"
    assert data[1]["id"] == "gpt-4o-mini"


@pytest.mark.anyio
@patch("app.routers.llm.get_provider")
async def test_list_models_local_no_key(mock_get_provider, client: AsyncClient):
    mock_provider = AsyncMock()
    mock_provider.list_models.return_value = [
        ModelInfo(id="llama3:latest", name="llama3:latest"),
    ]
    mock_get_provider.return_value = mock_provider

    resp = await client.post(
        "/api/llm/models",
        json={"provider": "ollama"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["id"] == "llama3:latest"


@pytest.mark.anyio
async def test_test_connection_invalid_provider(client: AsyncClient):
    resp = await client.post(
        "/api/llm/test-connection",
        json={"provider": "nonexistent"},
    )
    assert resp.status_code == 422  # validation error


# --- sort_and_enrich_models unit tests ---


def test_sort_and_enrich_models_order():
    """Known models sort by curated index; unknowns sort alphabetically after."""
    live = [
        ModelInfo(id="unknown-z", name="Unknown Z"),
        ModelInfo(id="gpt-5", name="GPT-5", context_window=1047576),
        ModelInfo(id="unknown-a", name="Unknown A"),
        ModelInfo(id="gpt-5.2", name="GPT-5.2", context_window=1047576),
    ]
    result = sort_and_enrich_models(live, LLMProviderType.OPENAI)
    ids = [m.id for m in result]
    # gpt-5.2 is index 0 in KNOWN_MODELS, gpt-5 is index 2, then unknowns alphabetically
    assert ids == ["gpt-5.2", "gpt-5", "unknown-a", "unknown-z"]


def test_sort_and_enrich_models_deduplicates():
    """Duplicate model ids are removed (first occurrence kept)."""
    live = [
        ModelInfo(id="gpt-5", name="GPT-5", context_window=1047576),
        ModelInfo(id="gpt-5", name="GPT-5 Duplicate", context_window=999),
    ]
    result = sort_and_enrich_models(live, LLMProviderType.OPENAI)
    assert len(result) == 1
    assert result[0].name == "GPT-5"


def test_sort_and_enrich_models_enriches_name():
    """When live API returns name == id, backfill display name from known models."""
    live = [
        ModelInfo(id="gpt-5.2", name="gpt-5.2"),  # name == id
    ]
    result = sort_and_enrich_models(live, LLMProviderType.OPENAI)
    assert result[0].name == "GPT-5.2"  # enriched from KNOWN_MODELS


def test_sort_and_enrich_models_enriches_context_window():
    """When live API returns context_window=None, backfill from known models."""
    live = [
        ModelInfo(id="gpt-5.2", name="GPT-5.2", context_window=None),
    ]
    result = sort_and_enrich_models(live, LLMProviderType.OPENAI)
    assert result[0].context_window == 1047576  # enriched from KNOWN_MODELS


def test_sort_and_enrich_models_preserves_live_metadata():
    """When live API returns good metadata, don't overwrite with known values."""
    live = [
        ModelInfo(id="gpt-5.2", name="GPT-5.2 (Preview)", context_window=999999),
    ]
    result = sort_and_enrich_models(live, LLMProviderType.OPENAI)
    assert result[0].name == "GPT-5.2 (Preview)"
    assert result[0].context_window == 999999


# --- Fallback router tests ---


@pytest.mark.anyio
@patch("app.routers.llm.get_provider")
async def test_list_models_fallback_on_failure(mock_get_provider, client: AsyncClient):
    """When live fetch raises, return known models (200, not 500)."""
    mock_get_provider.side_effect = Exception("Bad API key")

    resp = await client.post(
        "/api/llm/models",
        json={"provider": "openai"},
        headers={"Authorization": "Bearer bad-key"},
    )
    assert resp.status_code == 200
    data = resp.json()
    # Should return KNOWN_MODELS for openai
    known_ids = {m.id for m in KNOWN_MODELS[LLMProviderType.OPENAI]}
    returned_ids = {m["id"] for m in data}
    assert returned_ids == known_ids


@pytest.mark.anyio
@patch("app.routers.llm.get_provider")
async def test_list_models_fallback_on_empty(mock_get_provider, client: AsyncClient):
    """When live fetch returns empty list, fall back to known models."""
    mock_provider = AsyncMock()
    mock_provider.list_models.return_value = []
    mock_get_provider.return_value = mock_provider

    resp = await client.post(
        "/api/llm/models",
        json={"provider": "openai"},
        headers={"Authorization": "Bearer sk-test"},
    )
    assert resp.status_code == 200
    data = resp.json()
    known_ids = {m.id for m in KNOWN_MODELS[LLMProviderType.OPENAI]}
    returned_ids = {m["id"] for m in data}
    assert returned_ids == known_ids


@pytest.mark.anyio
@patch("app.routers.llm.get_provider")
async def test_list_models_enriches_metadata(mock_get_provider, client: AsyncClient):
    """Live models with name==id and context_window=None get enriched."""
    mock_provider = AsyncMock()
    mock_provider.list_models.return_value = [
        ModelInfo(id="gpt-5.2", name="gpt-5.2", context_window=None),
        ModelInfo(id="custom-model", name="custom-model", context_window=4096),
    ]
    mock_get_provider.return_value = mock_provider

    resp = await client.post(
        "/api/llm/models",
        json={"provider": "openai"},
        headers={"Authorization": "Bearer sk-test"},
    )
    assert resp.status_code == 200
    data = resp.json()
    # gpt-5.2 should be enriched
    gpt = next(m for m in data if m["id"] == "gpt-5.2")
    assert gpt["name"] == "GPT-5.2"
    assert gpt["context_window"] == 1047576
    # custom-model should be unchanged
    custom = next(m for m in data if m["id"] == "custom-model")
    assert custom["name"] == "custom-model"
    assert custom["context_window"] == 4096
