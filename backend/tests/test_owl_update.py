"""Tests for the OWL update service and endpoints."""

import json
import threading
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.owl_update_service import (
    _check_github_for_update,
    _load_meta,
    _save_meta,
    get_update_status,
    reset_update_service,
)


@pytest.fixture(autouse=True)
def _reset():
    """Reset OWL update service state before each test."""
    reset_update_service()
    yield
    reset_update_service()


@pytest.fixture
def client():
    return TestClient(app)


# --- Status endpoint ---


def test_status_returns_default_current(client):
    """GET /owl-update/status returns 'current' by default."""
    resp = client.get("/api/mapping/owl-update/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["update_status"] == "current"
    assert data["concept_count"] == 0
    assert data["error"] is None


# --- GitHub check: new commit ---


def test_check_detects_new_commit():
    """_check_github_for_update returns True when SHA differs."""
    import app.services.owl_update_service as svc

    svc._last_commit_sha = "old_sha_123"

    fake_response = MagicMock()
    fake_response.status = 200
    fake_response.read.return_value = json.dumps([{"sha": "new_sha_456"}]).encode()
    fake_response.headers = {}
    fake_response.__enter__ = lambda s: s
    fake_response.__exit__ = MagicMock(return_value=False)

    with patch("urllib.request.urlopen", return_value=fake_response):
        result = _check_github_for_update()

    assert result is True


# --- GitHub check: same commit ---


def test_check_detects_no_change():
    """_check_github_for_update returns False when SHA matches."""
    import app.services.owl_update_service as svc

    svc._last_commit_sha = "same_sha"

    fake_response = MagicMock()
    fake_response.status = 200
    fake_response.read.return_value = json.dumps([{"sha": "same_sha"}]).encode()
    fake_response.headers = {}
    fake_response.__enter__ = lambda s: s
    fake_response.__exit__ = MagicMock(return_value=False)

    with patch("urllib.request.urlopen", return_value=fake_response):
        result = _check_github_for_update()

    assert result is False


# --- GitHub rate limit fallback ---


def test_check_falls_back_to_head_on_rate_limit():
    """On 403, falls back to HEAD+ETag check."""
    import urllib.error

    import app.services.owl_update_service as svc

    svc._last_commit_sha = "old_etag"

    # First call (commits API) raises 403
    error_403 = urllib.error.HTTPError(
        url="", code=403, msg="rate limited", hdrs={}, fp=None
    )

    # Second call (HEAD fallback) returns new ETag
    fake_head = MagicMock()
    fake_head.status = 200
    fake_head.headers = {"ETag": "new_etag"}
    fake_head.__enter__ = lambda s: s
    fake_head.__exit__ = MagicMock(return_value=False)

    with patch("urllib.request.urlopen", side_effect=[error_403, fake_head]):
        result = _check_github_for_update()

    assert result is True


# --- Network error ---


def test_check_handles_network_error():
    """Network error → returns False, sets error message."""
    import app.services.owl_update_service as svc

    svc._last_commit_sha = "some_sha"

    with patch("urllib.request.urlopen", side_effect=OSError("Connection refused")):
        result = _check_github_for_update()

    assert result is False
    assert svc._update_error is not None
    assert "Network error" in svc._update_error


# --- Apply update swaps instance ---


def test_apply_update_swaps_folio_instance():
    """_apply_update creates new FOLIO and calls reload_folio."""
    import app.services.owl_update_service as svc

    mock_folio = MagicMock()
    mock_folio.classes = [MagicMock() for _ in range(100)]

    fake_commits_response = MagicMock()
    fake_commits_response.status = 200
    fake_commits_response.read.return_value = json.dumps(
        [{"sha": "updated_sha"}]
    ).encode()
    fake_commits_response.__enter__ = lambda s: s
    fake_commits_response.__exit__ = MagicMock(return_value=False)

    # Patch the FOLIO class where it's imported inside _apply_update
    mock_folio_module = MagicMock()
    mock_folio_module.FOLIO.return_value = mock_folio

    with (
        patch.dict("sys.modules", {"folio": mock_folio_module}),
        patch("app.services.folio_service.reload_folio") as mock_reload,
        patch("urllib.request.urlopen", return_value=fake_commits_response),
    ):
        svc._apply_update()

    mock_reload.assert_called_once_with(mock_folio)
    assert svc._concept_count == 100


# --- Meta persistence ---


def test_meta_save_and_load(tmp_path):
    """Save/load meta persists SHA and timestamps."""
    import app.services.owl_update_service as svc

    svc._META_PATH = tmp_path / "owl_update_meta.json"
    svc._META_DIR = tmp_path

    svc._last_commit_sha = "test_sha_789"
    svc._last_check_time = "2026-03-08T12:00:00Z"
    svc._last_update_time = "2026-03-07T10:00:00Z"
    _save_meta()

    # Reset and reload
    svc._last_commit_sha = None
    svc._last_check_time = None
    svc._last_update_time = None
    _load_meta()

    assert svc._last_commit_sha == "test_sha_789"
    assert svc._last_check_time == "2026-03-08T12:00:00Z"
    assert svc._last_update_time == "2026-03-07T10:00:00Z"


# --- Disabled via env var ---


def test_disabled_via_env_var():
    """When OWL_UPDATE_DISABLED=true, checker doesn't start."""
    import app.services.owl_update_service as svc

    with patch.dict("os.environ", {"OWL_UPDATE_DISABLED": "true"}):
        svc.start_update_checker()
        assert svc._timer is None


# --- Force update endpoint ---


def test_force_update_endpoint(client):
    """POST /owl-update/force returns status."""
    with patch("app.services.owl_update_service.force_update") as mock_force:
        mock_force.return_value = get_update_status()
        resp = client.post("/api/mapping/owl-update/force")

    assert resp.status_code == 200
    data = resp.json()
    assert "update_status" in data


# --- Check endpoint ---


def test_check_endpoint(client):
    """POST /owl-update/check returns status."""
    with patch("app.services.owl_update_service.trigger_update_check") as mock_check:
        mock_check.return_value = get_update_status()
        resp = client.post("/api/mapping/owl-update/check")

    assert resp.status_code == 200
    data = resp.json()
    assert "update_status" in data


# --- Concurrent safety ---


def test_concurrent_requests_safe():
    """Multiple threads calling get_update_status don't crash."""
    results = []

    def _get():
        results.append(get_update_status())

    threads = [threading.Thread(target=_get) for _ in range(10)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert len(results) == 10
    assert all(r.update_status == "current" for r in results)


# --- First check stores SHA without triggering update ---


def test_first_check_stores_sha():
    """First check (no stored SHA) stores the SHA and returns False."""
    import app.services.owl_update_service as svc

    svc._last_commit_sha = None

    fake_response = MagicMock()
    fake_response.status = 200
    fake_response.read.return_value = json.dumps([{"sha": "initial_sha"}]).encode()
    fake_response.headers = {}
    fake_response.__enter__ = lambda s: s
    fake_response.__exit__ = MagicMock(return_value=False)

    with patch("urllib.request.urlopen", return_value=fake_response):
        result = _check_github_for_update()

    assert result is False
    assert svc._last_commit_sha == "initial_sha"
