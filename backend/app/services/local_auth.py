"""Local authentication token for securing the API.

In desktop mode, the Electron shell generates a token, passes it via the
FOLIO_MAPPER_LOCAL_TOKEN env var, and sends it in X-Local-Token headers.
All /api/* requests (except /api/health) must include this token.

In dev mode (no FOLIO_MAPPER_LOCAL_TOKEN set), auth is disabled automatically
so the frontend can reach the backend without a token.

Auth can also be explicitly disabled via FOLIO_MAPPER_NO_AUTH=true.
"""

from __future__ import annotations

import os
import secrets

_token: str | None = None


def get_or_create_token() -> str | None:
    """Return the local auth token if one is configured.

    Returns None (auth disabled) when:
    - FOLIO_MAPPER_NO_AUTH=true, OR
    - No FOLIO_MAPPER_LOCAL_TOKEN env var is set (dev mode)
    """
    global _token
    if os.environ.get("FOLIO_MAPPER_NO_AUTH", "").lower() == "true":
        return None
    env_token = os.environ.get("FOLIO_MAPPER_LOCAL_TOKEN")
    if not env_token:
        return None  # Dev mode — no token configured, auth disabled
    if _token is None:
        _token = env_token
    return _token


def verify_local_token(token: str) -> bool:
    """Verify a token using constant-time comparison."""
    expected = get_or_create_token()
    if expected is None:
        return True  # Auth disabled
    return secrets.compare_digest(token, expected)
