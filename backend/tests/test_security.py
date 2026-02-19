"""Security-specific tests for Phase 1 findings (prompt injection, file limits, repo targeting, HTML escape)."""

from __future__ import annotations

import html
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models.pipeline_models import PreScanResult, PreScanSegment, RankedCandidate, ScopedCandidate
from app.services.export_service import _html_escape
from app.services.file_parser import MAX_COLUMNS, MAX_ROWS
from app.services.pipeline.prompts import (
    _sanitize_user_input,
    build_judge_prompt,
    build_prescan_prompt,
    build_ranking_prompt,
)


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


# --- Prompt injection tests (Finding 6) ---


def test_sanitize_strips_control_chars():
    text = "hello\x00world\x07test\x1fend"
    result = _sanitize_user_input(text)
    assert "\x00" not in result
    assert "\x07" not in result
    assert "\x1f" not in result
    assert "helloworld" in result


def test_sanitize_preserves_normal_chars():
    text = "Legal analysis of contracts\nNew paragraph"
    result = _sanitize_user_input(text)
    assert result == text


def test_sanitize_enforces_length_limit():
    text = "x" * 20_000
    result = _sanitize_user_input(text)
    assert len(result) == 10_000


def test_prescan_prompt_has_user_input_tags():
    messages = build_prescan_prompt("Contract law analysis")
    user_msg = messages[1]["content"]
    assert "<user_input>" in user_msg
    assert "</user_input>" in user_msg
    assert "data only" in messages[0]["content"]


def test_ranking_prompt_has_user_input_tags():
    prescan = PreScanResult(
        segments=[PreScanSegment(text="test", branches=["Service"])],
        raw_text="test",
    )
    candidates = [
        ScopedCandidate(iri_hash="R1", label="Test", branch="Service", score=80.0),
    ]
    messages = build_ranking_prompt("test text", prescan, candidates)
    user_msg = messages[1]["content"]
    assert "<user_input>" in user_msg
    assert "</user_input>" in user_msg
    assert "data only" in messages[0]["content"]


def test_judge_prompt_has_user_input_tags():
    prescan = PreScanResult(
        segments=[PreScanSegment(text="test", branches=["Service"])],
        raw_text="test",
    )
    ranked = [RankedCandidate(iri_hash="R1", score=80.0)]
    scoped_lookup = {
        "R1": ScopedCandidate(iri_hash="R1", label="Test", branch="Service", score=80.0),
    }
    messages = build_judge_prompt("test text", prescan, ranked, scoped_lookup)
    user_msg = messages[1]["content"]
    assert "<user_input>" in user_msg
    assert "</user_input>" in user_msg
    assert "data only" in messages[0]["content"]


# --- File upload limits (Finding 7) ---


def test_file_parser_too_many_rows():
    """CSV with too many rows should raise ValueError."""
    from app.services.file_parser import _read_csv

    # Create CSV content with MAX_ROWS + 1 rows
    lines = [f"row{i}" for i in range(MAX_ROWS + 1)]
    content = "\n".join(lines).encode("utf-8")
    with pytest.raises(ValueError, match="too many rows"):
        _read_csv(content)


def test_file_parser_too_many_columns():
    """CSV with too many columns should raise ValueError."""
    from app.services.file_parser import _read_csv

    cols = ",".join([f"col{i}" for i in range(MAX_COLUMNS + 1)])
    content = cols.encode("utf-8")
    with pytest.raises(ValueError, match="too many columns"):
        _read_csv(content)


@pytest.mark.anyio
async def test_upload_file_too_large(client: AsyncClient):
    """Upload exceeding 10MB should return 413."""
    import io

    # Create content just over 10MB
    content = b"x" * (10 * 1024 * 1024 + 1)
    files = {"file": ("test.csv", io.BytesIO(content), "text/csv")}
    resp = await client.post("/api/parse/file", files=files)
    assert resp.status_code == 413


# --- GitHub repo targeting (Finding 10) ---


@pytest.mark.anyio
async def test_github_disallowed_repo_returns_403(client: AsyncClient):
    """Submitting to a non-allowlisted repo should return 403."""
    resp = await client.post(
        "/api/github/submit-issue",
        json={
            "owner": "evil-org",
            "repo": "evil-repo",
            "title": "Test",
            "body": "Test body",
        },
        headers={"X-GitHub-Pat": "ghp_test"},
    )
    assert resp.status_code == 403
    assert "not in the allowed list" in resp.json()["detail"]


@pytest.mark.anyio
async def test_github_default_repo_uses_alea(client: AsyncClient):
    """Default owner/repo should be alea-institute/FOLIO."""
    mock_response = MagicMock()
    mock_response.status_code = 201
    mock_response.json.return_value = {
        "html_url": "https://github.com/alea-institute/FOLIO/issues/1",
        "number": 1,
    }

    mock_client_instance = AsyncMock()
    mock_client_instance.post.return_value = mock_response
    mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
    mock_client_instance.__aexit__ = AsyncMock(return_value=False)

    with patch("app.routers.github.httpx.AsyncClient", return_value=mock_client_instance):
        resp = await client.post(
            "/api/github/submit-issue",
            json={"title": "Test", "body": "Test body"},
            headers={"X-GitHub-Pat": "ghp_test"},
        )

    assert resp.status_code == 200
    call_args = mock_client_instance.post.call_args
    assert "alea-institute/FOLIO/issues" in call_args[0][0]


# --- HTML escaping (Finding 11) ---


def test_html_escape_handles_single_quotes():
    """Single quotes should be escaped (stdlib html.escape handles this)."""
    result = _html_escape("It's a test")
    assert "&#x27;" in result or "&#39;" in result or "&apos;" in result
    # The raw single quote should not be present unescaped in a context where it matters
    assert result == html.escape("It's a test", quote=True)


def test_html_escape_handles_all_special_chars():
    """All HTML special characters should be properly escaped."""
    result = _html_escape('<script>alert("xss")</script>')
    assert "<" not in result
    assert ">" not in result
    assert "&lt;" in result
    assert "&gt;" in result
    assert "&quot;" in result
