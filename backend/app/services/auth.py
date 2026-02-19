"""API key extraction from request headers."""

from __future__ import annotations

from fastapi import Request


def extract_api_key(request: Request) -> str | None:
    """Extract API key from Authorization: Bearer header."""
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:] or None
    return None


def extract_github_pat(request: Request) -> str | None:
    """Extract GitHub PAT from X-GitHub-Pat header."""
    return request.headers.get("X-GitHub-Pat") or None
