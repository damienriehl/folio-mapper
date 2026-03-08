"""Background service: checks GitHub for FOLIO OWL updates and hot-reloads."""

from __future__ import annotations

import json
import logging
import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

from app.models.mapping_models import OWLUpdateStatus

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Module-level state (singleton pattern matching embedding/service.py)
# ---------------------------------------------------------------------------
_update_lock = threading.Lock()
_last_check_time: str | None = None
_last_update_time: str | None = None
_last_commit_sha: str | None = None
_update_status: str = "current"  # current | checking | updating | updated | error
_update_error: str | None = None
_concept_count: int = 0
_timer: threading.Timer | None = None

_GITHUB_REPO = "alea-institute/FOLIO"
_OWL_PATH = "FOLIO.owl"

_META_DIR = Path.home() / ".folio" / "cache"
_META_PATH = _META_DIR / "owl_update_meta.json"

# ---------------------------------------------------------------------------
# Config from env
# ---------------------------------------------------------------------------

def _check_interval() -> int:
    return int(os.environ.get("OWL_UPDATE_INTERVAL", "86400"))


def _branch() -> str:
    return os.environ.get("OWL_UPDATE_BRANCH", "main")


def _disabled() -> bool:
    return os.environ.get("OWL_UPDATE_DISABLED", "").lower() == "true"


def _check_on_startup() -> bool:
    return os.environ.get("OWL_UPDATE_ON_STARTUP", "true").lower() != "false"


# ---------------------------------------------------------------------------
# Meta persistence
# ---------------------------------------------------------------------------

def _load_meta() -> None:
    global _last_check_time, _last_commit_sha, _last_update_time
    if _META_PATH.exists():
        try:
            data = json.loads(_META_PATH.read_text())
            _last_check_time = data.get("last_check_time")
            _last_commit_sha = data.get("last_commit_sha")
            _last_update_time = data.get("last_update_time")
        except Exception:
            logger.warning("Failed to load OWL update meta from %s", _META_PATH)


def _save_meta() -> None:
    try:
        _META_DIR.mkdir(parents=True, exist_ok=True)
        _META_PATH.write_text(json.dumps({
            "last_check_time": _last_check_time,
            "last_commit_sha": _last_commit_sha,
            "last_update_time": _last_update_time,
        }))
    except Exception:
        logger.warning("Failed to save OWL update meta to %s", _META_PATH)


# ---------------------------------------------------------------------------
# GitHub API helpers
# ---------------------------------------------------------------------------

def _check_github_for_update() -> bool:
    """Check GitHub for a new OWL commit. Returns True if a new version exists."""
    global _last_commit_sha, _last_check_time, _update_error
    import urllib.request
    import urllib.error

    branch = _branch()
    _last_check_time = datetime.now(timezone.utc).isoformat()

    # Primary: GitHub commits API (lightweight, ~2KB response)
    url = f"https://api.github.com/repos/{_GITHUB_REPO}/commits?path={_OWL_PATH}&sha={branch}&per_page=1"
    req = urllib.request.Request(url, headers={
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "folio-mapper",
    })

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode())
                if data and isinstance(data, list) and len(data) > 0:
                    latest_sha = data[0].get("sha", "")
                    if _last_commit_sha is None:
                        # First check — store SHA, no update needed
                        _last_commit_sha = latest_sha
                        _save_meta()
                        return False
                    if latest_sha != _last_commit_sha:
                        logger.info(
                            "New OWL commit detected: %s -> %s",
                            _last_commit_sha[:8],
                            latest_sha[:8],
                        )
                        return True
                    return False
    except urllib.error.HTTPError as e:
        if e.code == 403:
            logger.info("GitHub API rate limited, trying HEAD fallback")
            return _check_github_head_fallback()
        _update_error = f"GitHub API error: {e.code}"
        logger.warning("GitHub API error checking OWL updates: %s", e)
        return False
    except Exception as e:
        _update_error = f"Network error: {e}"
        logger.warning("Network error checking OWL updates: %s", e)
        return False

    return False


def _check_github_head_fallback() -> bool:
    """Fallback: use HTTP HEAD + ETag on the raw file URL."""
    global _last_commit_sha
    import urllib.request
    import urllib.error

    branch = _branch()
    url = f"https://raw.githubusercontent.com/{_GITHUB_REPO}/{branch}/{_OWL_PATH}"
    req = urllib.request.Request(url, method="HEAD", headers={
        "User-Agent": "folio-mapper",
    })

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            etag = resp.headers.get("ETag", "")
            if _last_commit_sha is None:
                _last_commit_sha = etag
                _save_meta()
                return False
            if etag and etag != _last_commit_sha:
                logger.info("OWL ETag changed: %s -> %s", _last_commit_sha, etag)
                return True
            return False
    except Exception as e:
        logger.warning("HEAD fallback failed: %s", e)
        return False


# ---------------------------------------------------------------------------
# Apply update
# ---------------------------------------------------------------------------

def _apply_update() -> None:
    """Download fresh OWL, rebuild FOLIO instance, swap into folio_service."""
    global _last_commit_sha, _last_update_time, _update_status, _update_error, _concept_count

    _update_status = "updating"
    branch = _branch()

    try:
        from folio import FOLIO

        # Build a fresh FOLIO instance (bypasses cache, downloads from GitHub)
        new_folio = FOLIO(use_cache=False, github_repo_branch=branch)
        _concept_count = len(new_folio.classes)
        logger.info("Downloaded new OWL: %d classes from branch %s", _concept_count, branch)

        # Hot-swap into folio_service
        from app.services.folio_service import reload_folio
        reload_folio(new_folio)

        # Rebuild embedding index in background
        try:
            from app.services.embedding.service import build_embedding_index
            threading.Thread(target=build_embedding_index, daemon=True).start()
        except Exception:
            logger.info("Embedding rebuild skipped (not available)")

        # Update tracking state
        # Re-fetch the latest SHA now that we've confirmed a good download
        import urllib.request
        try:
            url = f"https://api.github.com/repos/{_GITHUB_REPO}/commits?path={_OWL_PATH}&sha={branch}&per_page=1"
            req = urllib.request.Request(url, headers={
                "Accept": "application/vnd.github.v3+json",
                "User-Agent": "folio-mapper",
            })
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode())
                if data and isinstance(data, list) and len(data) > 0:
                    _last_commit_sha = data[0].get("sha", "")
        except Exception:
            pass  # SHA will be updated on next check

        _last_update_time = datetime.now(timezone.utc).isoformat()
        _update_status = "updated"
        _update_error = None
        _save_meta()

        logger.info("FOLIO OWL update applied successfully (%d concepts)", _concept_count)

        # Reset status to "current" after a brief period so the frontend can see "updated"
        def _reset_status():
            global _update_status
            time.sleep(30)
            if _update_status == "updated":
                _update_status = "current"

        threading.Thread(target=_reset_status, daemon=True).start()

    except Exception as e:
        _update_status = "error"
        _update_error = str(e)
        logger.error("Failed to apply OWL update: %s", e, exc_info=True)

        # Reset to current after 60s so it can retry next cycle
        def _reset_error():
            global _update_status
            time.sleep(60)
            if _update_status == "error":
                _update_status = "current"

        threading.Thread(target=_reset_error, daemon=True).start()


# ---------------------------------------------------------------------------
# Update loop
# ---------------------------------------------------------------------------

def _update_loop() -> None:
    """Check for updates and reschedule. Runs in a timer thread."""
    global _update_status, _timer

    if _disabled():
        return

    with _update_lock:
        _update_status = "checking"
        try:
            has_update = _check_github_for_update()
            if has_update:
                _apply_update()
            else:
                _update_status = "current"
        except Exception as e:
            _update_status = "error"
            logger.error("Update loop error: %s", e, exc_info=True)

    # Reschedule
    _schedule_next()


def _schedule_next() -> None:
    """Schedule the next check after the configured interval."""
    global _timer
    if _disabled():
        return
    interval = _check_interval()
    _timer = threading.Timer(interval, _update_loop)
    _timer.daemon = True
    _timer.start()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def start_update_checker(interval: int | None = None) -> None:
    """Start the periodic update checker. Called from lifespan."""
    global _concept_count

    if _disabled():
        logger.info("OWL update checker disabled")
        return

    _load_meta()

    # Capture current concept count from folio_service
    try:
        from app.services.folio_service import get_folio
        folio = get_folio()
        if folio:
            _concept_count = len(folio.classes)
    except Exception:
        pass

    if _check_on_startup():
        # Run first check after a brief delay to let FOLIO finish loading
        delay = 10
        timer = threading.Timer(delay, _update_loop)
        timer.daemon = True
        timer.start()
    else:
        _schedule_next()

    logger.info(
        "OWL update checker started (interval=%ds, branch=%s)",
        interval or _check_interval(),
        _branch(),
    )


def stop_update_checker() -> None:
    """Stop the periodic update checker. Called on shutdown."""
    global _timer
    if _timer:
        _timer.cancel()
        _timer = None
    logger.info("OWL update checker stopped")


def get_update_status() -> OWLUpdateStatus:
    """Return current OWL update status for the API."""
    return OWLUpdateStatus(
        update_status=_update_status,
        last_check_time=_last_check_time,
        last_update_time=_last_update_time,
        concept_count=_concept_count,
        owl_commit_sha=_last_commit_sha,
        check_interval_seconds=_check_interval(),
        error=_update_error,
    )


def trigger_update_check() -> OWLUpdateStatus:
    """Manually trigger an update check. Returns status after check."""
    threading.Thread(target=_update_loop, daemon=True).start()
    return get_update_status()


def force_update() -> OWLUpdateStatus:
    """Force re-download regardless of SHA. Returns status."""
    global _last_commit_sha
    _last_commit_sha = None  # Reset so next check always sees a diff

    def _force():
        global _update_status
        with _update_lock:
            _update_status = "updating"
            _apply_update()

    threading.Thread(target=_force, daemon=True).start()
    return get_update_status()


def reset_update_service() -> None:
    """Reset all state. Used in tests."""
    global _last_check_time, _last_update_time, _last_commit_sha
    global _update_status, _update_error, _concept_count, _timer
    stop_update_checker()
    _last_check_time = None
    _last_update_time = None
    _last_commit_sha = None
    _update_status = "current"
    _update_error = None
    _concept_count = 0
    _timer = None
