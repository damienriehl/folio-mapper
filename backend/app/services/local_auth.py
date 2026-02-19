"""Local authentication token for securing the API.

In desktop mode, the backend generates a random token on startup and
emits it to stdout for the Electron shell to capture. All /api/* requests
(except /api/health) must include this token in the X-Local-Token header.

In development, the token can be set via FOLIO_MAPPER_LOCAL_TOKEN env var.
If neither is set and the env var FOLIO_MAPPER_NO_AUTH=true is present,
authentication is disabled entirely.
"""

from __future__ import annotations

import os
import secrets

_token: str | None = None


def get_or_create_token() -> str | None:
    """Return the local auth token, creating one if needed.

    Returns None if auth is disabled via FOLIO_MAPPER_NO_AUTH=true.
    """
    global _token
    if os.environ.get("FOLIO_MAPPER_NO_AUTH", "").lower() == "true":
        return None
    if _token is None:
        _token = os.environ.get("FOLIO_MAPPER_LOCAL_TOKEN") or secrets.token_urlsafe(32)
    return _token


def verify_local_token(token: str) -> bool:
    """Verify a token using constant-time comparison."""
    expected = get_or_create_token()
    if expected is None:
        return True  # Auth disabled
    return secrets.compare_digest(token, expected)
