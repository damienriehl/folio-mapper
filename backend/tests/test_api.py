from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app

FIXTURES_DIR = Path(__file__).parent / "fixtures"


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.mark.anyio
async def test_health(client: AsyncClient):
    resp = await client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


@pytest.mark.anyio
async def test_parse_text(client: AsyncClient):
    resp = await client.post(
        "/api/parse/text",
        json={"text": "Contract Law\nTort Law\nProperty Law"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["format"] == "text_multi"
    assert data["total_items"] == 3


@pytest.mark.anyio
async def test_parse_text_empty(client: AsyncClient):
    resp = await client.post("/api/parse/text", json={"text": "   "})
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_upload_flat_csv(client: AsyncClient):
    content = (FIXTURES_DIR / "flat.csv").read_bytes()
    resp = await client.post(
        "/api/parse/file",
        files={"file": ("flat.csv", content, "text/csv")},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["format"] == "flat"
    assert data["total_items"] == 6


@pytest.mark.anyio
async def test_upload_hierarchical_csv(client: AsyncClient):
    content = (FIXTURES_DIR / "hierarchical.csv").read_bytes()
    resp = await client.post(
        "/api/parse/file",
        files={"file": ("hierarchical.csv", content, "text/csv")},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["format"] == "hierarchical"
    assert data["hierarchy"] is not None
    assert len(data["hierarchy"]) == 2


@pytest.mark.anyio
async def test_upload_unsupported_type(client: AsyncClient):
    resp = await client.post(
        "/api/parse/file",
        files={"file": ("file.pdf", b"data", "application/pdf")},
    )
    assert resp.status_code == 400
