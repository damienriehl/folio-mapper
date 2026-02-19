"""Local authentication middleware.

Checks X-Local-Token header on all /api/* paths except /api/health.
"""

from __future__ import annotations

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.services.local_auth import get_or_create_token, verify_local_token

# Paths that don't require authentication
_PUBLIC_PATHS = {"/api/health"}


class LocalAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path

        # Only protect /api/* paths (not static files)
        if not path.startswith("/api/"):
            return await call_next(request)

        # Allow public paths
        if path in _PUBLIC_PATHS:
            return await call_next(request)

        # Skip auth if disabled
        if get_or_create_token() is None:
            return await call_next(request)

        token = request.headers.get("X-Local-Token", "")
        if not token or not verify_local_token(token):
            return JSONResponse(
                status_code=401,
                content={"detail": "Invalid or missing local auth token"},
            )

        return await call_next(request)
