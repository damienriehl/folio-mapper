"""Tests for local authentication and CORS hardening (Phase 3)."""

import os
from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def authed_client():
    """Client with auth disabled (standard for most tests)."""
    # conftest.py sets FOLIO_MAPPER_NO_AUTH=true
    from app.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.fixture
async def auth_required_client():
    """Client where auth IS required — need X-Local-Token header."""
    # Temporarily enable auth with a known token
    with patch.dict(os.environ, {"FOLIO_MAPPER_NO_AUTH": "", "FOLIO_MAPPER_LOCAL_TOKEN": "test-secret-token"}):
        # Reset the cached token
        import app.services.local_auth as la
        la._token = None

        from app.main import app

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            yield c

        # Reset token cache
        la._token = None


@pytest.mark.anyio
async def test_health_no_auth_required(auth_required_client: AsyncClient):
    """Health endpoint should work without auth token."""
    resp = await auth_required_client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


@pytest.mark.anyio
async def test_api_without_token_returns_401(auth_required_client: AsyncClient):
    """API endpoints should return 401 without X-Local-Token."""
    resp = await auth_required_client.get("/api/mapping/status")
    assert resp.status_code == 401
    assert "auth token" in resp.json()["detail"].lower()


@pytest.mark.anyio
async def test_api_with_valid_token_passes(auth_required_client: AsyncClient):
    """API endpoints should work with valid X-Local-Token."""
    resp = await auth_required_client.get(
        "/api/mapping/status",
        headers={"X-Local-Token": "test-secret-token"},
    )
    # Should not be 401 — actual result depends on FOLIO loading state
    assert resp.status_code != 401


@pytest.mark.anyio
async def test_api_with_invalid_token_returns_401(auth_required_client: AsyncClient):
    """API endpoints should return 401 with wrong X-Local-Token."""
    resp = await auth_required_client.get(
        "/api/mapping/status",
        headers={"X-Local-Token": "wrong-token"},
    )
    assert resp.status_code == 401


@pytest.mark.anyio
async def test_security_headers_present(authed_client: AsyncClient):
    """Security headers should be present on all responses."""
    resp = await authed_client.get("/api/health")
    assert resp.headers.get("X-Content-Type-Options") == "nosniff"
    assert resp.headers.get("X-Frame-Options") == "DENY"
    assert "max-age" in resp.headers.get("Strict-Transport-Security", "")


@pytest.mark.anyio
async def test_cors_restricted_methods(authed_client: AsyncClient):
    """CORS should only allow GET, POST, OPTIONS."""
    resp = await authed_client.options(
        "/api/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "DELETE",
        },
    )
    allowed = resp.headers.get("Access-Control-Allow-Methods", "")
    assert "DELETE" not in allowed


@pytest.mark.anyio
async def test_cors_restricted_headers(authed_client: AsyncClient):
    """CORS should only allow specific headers."""
    resp = await authed_client.options(
        "/api/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "X-Local-Token",
        },
    )
    allowed = resp.headers.get("Access-Control-Allow-Headers", "")
    assert "X-Local-Token" in allowed
