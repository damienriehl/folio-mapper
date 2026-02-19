"""Tests for the GitHub issue submission endpoint."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


def _make_request_body(**overrides):
    base = {
        "owner": "alea-institute",
        "repo": "FOLIO",
        "title": "[Concept Requests] Test batch",
        "body": "## Summary\n1 concept request.",
    }
    base.update(overrides)
    return base


def _make_headers(pat: str = "ghp_testtoken123"):
    return {"X-GitHub-Pat": pat}


@pytest.mark.anyio
async def test_submit_issue_success(client: AsyncClient):
    """Successful issue creation returns url and number."""
    mock_response = MagicMock()
    mock_response.status_code = 201
    mock_response.json.return_value = {
        "html_url": "https://github.com/alea-institute/FOLIO/issues/42",
        "number": 42,
    }

    mock_client_instance = AsyncMock()
    mock_client_instance.post.return_value = mock_response
    mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
    mock_client_instance.__aexit__ = AsyncMock(return_value=False)

    with patch("app.routers.github.httpx.AsyncClient", return_value=mock_client_instance):
        resp = await client.post(
            "/api/github/submit-issue",
            json=_make_request_body(),
            headers=_make_headers(),
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["url"] == "https://github.com/alea-institute/FOLIO/issues/42"
    assert data["number"] == 42

    # Verify the correct GitHub API call was made
    call_args = mock_client_instance.post.call_args
    assert "alea-institute/FOLIO/issues" in call_args[0][0]
    assert call_args[1]["headers"]["Authorization"] == "Bearer ghp_testtoken123"


@pytest.mark.anyio
async def test_submit_issue_invalid_token(client: AsyncClient):
    """Invalid PAT returns 401 from GitHub."""
    mock_response = MagicMock()
    mock_response.status_code = 401
    mock_response.json.return_value = {"message": "Bad credentials"}

    mock_client_instance = AsyncMock()
    mock_client_instance.post.return_value = mock_response
    mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
    mock_client_instance.__aexit__ = AsyncMock(return_value=False)

    with patch("app.routers.github.httpx.AsyncClient", return_value=mock_client_instance):
        resp = await client.post(
            "/api/github/submit-issue",
            json=_make_request_body(),
            headers=_make_headers(),
        )

    assert resp.status_code == 401
    assert "Bad credentials" in resp.json()["detail"]


@pytest.mark.anyio
async def test_submit_issue_repo_not_allowed(client: AsyncClient):
    """Non-allowlisted repo returns 403."""
    resp = await client.post(
        "/api/github/submit-issue",
        json=_make_request_body(owner="nonexistent", repo="nope"),
        headers=_make_headers(),
    )

    assert resp.status_code == 403
    assert "not in the allowed list" in resp.json()["detail"]


@pytest.mark.anyio
async def test_submit_issue_missing_pat_returns_401(client: AsyncClient):
    """Missing PAT header returns 401."""
    resp = await client.post(
        "/api/github/submit-issue",
        json=_make_request_body(),
    )
    assert resp.status_code == 401
    assert "PAT required" in resp.json()["detail"]


@pytest.mark.anyio
async def test_submit_issue_missing_fields(client: AsyncClient):
    """Missing required fields returns 422."""
    resp = await client.post(
        "/api/github/submit-issue",
        json={},
        headers=_make_headers(),
    )
    assert resp.status_code == 422


@pytest.mark.anyio
async def test_submit_issue_sends_correct_payload(client: AsyncClient):
    """Verifies the payload sent to GitHub API matches request."""
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

    body = _make_request_body(title="My Title", body="My Body")

    with patch("app.routers.github.httpx.AsyncClient", return_value=mock_client_instance):
        await client.post(
            "/api/github/submit-issue",
            json=body,
            headers=_make_headers(),
        )

    call_args = mock_client_instance.post.call_args
    payload = call_args[1]["json"]
    assert payload["title"] == "My Title"
    assert payload["body"] == "My Body"


@pytest.mark.anyio
async def test_submit_issue_github_api_error_non_json(client: AsyncClient):
    """Handles non-JSON error responses from GitHub."""
    mock_response = MagicMock()
    mock_response.status_code = 500
    mock_response.json.side_effect = ValueError("not json")

    mock_client_instance = AsyncMock()
    mock_client_instance.post.return_value = mock_response
    mock_client_instance.__aenter__ = AsyncMock(return_value=mock_client_instance)
    mock_client_instance.__aexit__ = AsyncMock(return_value=False)

    with patch("app.routers.github.httpx.AsyncClient", return_value=mock_client_instance):
        resp = await client.post(
            "/api/github/submit-issue",
            json=_make_request_body(),
            headers=_make_headers(),
        )

    assert resp.status_code == 500
    assert "GitHub API error" in resp.json()["detail"]
