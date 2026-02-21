"""Tests for synthetic data generation."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models.llm_models import LLMConfig, LLMProviderType
from app.models.synthetic_models import SyntheticRequest, SyntheticResponse
from app.services.synthetic_prompt import (
    _hierarchy_depth,
    build_synthetic_prompt,
    sanitize_output,
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


# --- Model validation ---


def test_synthetic_request_defaults():
    req = SyntheticRequest(
        llm_config=LLMConfig(provider=LLMProviderType.OPENAI),
    )
    assert req.count == 10


def test_synthetic_request_custom_count():
    req = SyntheticRequest(
        count=25,
        llm_config=LLMConfig(provider=LLMProviderType.OPENAI),
    )
    assert req.count == 25


def test_synthetic_request_count_too_low():
    with pytest.raises(Exception):
        SyntheticRequest(
            count=2,
            llm_config=LLMConfig(provider=LLMProviderType.OPENAI),
        )


def test_synthetic_request_count_too_high():
    with pytest.raises(Exception):
        SyntheticRequest(
            count=100,
            llm_config=LLMConfig(provider=LLMProviderType.OPENAI),
        )


def test_synthetic_response_model():
    resp = SyntheticResponse(text="Litigation\n\tSecurities", item_count=2)
    assert resp.text == "Litigation\n\tSecurities"
    assert resp.item_count == 2


# --- Prompt builder ---


def test_hierarchy_depth_small():
    assert _hierarchy_depth(5) == 2
    assert _hierarchy_depth(12) == 2


def test_hierarchy_depth_medium():
    assert _hierarchy_depth(13) == 3
    assert _hierarchy_depth(25) == 3


def test_hierarchy_depth_large():
    assert _hierarchy_depth(26) == 4
    assert _hierarchy_depth(50) == 4


def test_build_synthetic_prompt_structure():
    messages = build_synthetic_prompt(10)
    assert len(messages) == 2
    assert messages[0]["role"] == "system"
    assert messages[1]["role"] == "user"
    assert "10" in messages[1]["content"]
    assert "2 levels" in messages[1]["content"]


def test_build_synthetic_prompt_depth_scales():
    msgs_small = build_synthetic_prompt(10)
    msgs_large = build_synthetic_prompt(30)
    assert "2 levels" in msgs_small[1]["content"]
    assert "4 levels" in msgs_large[1]["content"]


# --- Sanitization ---


def test_sanitize_strips_markdown_fences():
    raw = "```\nLitigation\n\tSecurities\n```"
    result = sanitize_output(raw)
    assert result == "Litigation\n\tSecurities"


def test_sanitize_strips_language_fences():
    raw = "```text\nLitigation\n\tSecurities\n```"
    result = sanitize_output(raw)
    assert result == "Litigation\n\tSecurities"


def test_sanitize_preserves_tabs():
    raw = "Corporate\n\tM&A\n\t\tCross-Border"
    result = sanitize_output(raw)
    assert "\t" in result
    assert "\t\t" in result


def test_sanitize_removes_control_chars():
    raw = "Litigation\x00\x07\n\tSecurities"
    result = sanitize_output(raw)
    assert "\x00" not in result
    assert "\x07" not in result
    assert "Litigation" in result
    assert "\tSecurities" in result


# --- Router integration ---


MOCK_LLM_OUTPUT = "Corporate & Transactional\n\tMergers & Acquisitions\n\tPrivate Equity\nLitigation\n\tCommercial Litigation"


@pytest.mark.anyio
@patch(
    "app.routers.synthetic.generate_synthetic_data",
    new_callable=AsyncMock,
    return_value=SyntheticResponse(text=MOCK_LLM_OUTPUT, item_count=5),
)
async def test_synthetic_endpoint_success(mock_gen, client: AsyncClient):
    resp = await client.post(
        "/api/synthetic/generate",
        json={
            "count": 10,
            "llm_config": {
                "provider": "openai",
                "base_url": "https://api.openai.com/v1",
                "model": "gpt-4o",
            },
        },
        headers={"Authorization": "Bearer test-key"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["item_count"] == 5
    assert "Corporate" in data["text"]


@pytest.mark.anyio
@patch(
    "app.routers.synthetic.generate_synthetic_data",
    new_callable=AsyncMock,
    side_effect=Exception("LLM provider error"),
)
async def test_synthetic_endpoint_llm_failure(mock_gen, client: AsyncClient):
    resp = await client.post(
        "/api/synthetic/generate",
        json={
            "count": 10,
            "llm_config": {
                "provider": "openai",
                "base_url": "https://api.openai.com/v1",
                "model": "gpt-4o",
            },
        },
        headers={"Authorization": "Bearer test-key"},
    )
    assert resp.status_code == 500
