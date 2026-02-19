import os
import secrets
import time
from collections import defaultdict

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from app.routers.export import router as export_router
from app.routers.github import router as github_router
from app.routers.llm import router as llm_router
from app.routers.mapping import router as mapping_router
from app.routers.parse import router as parse_router
from app.routers.pipeline import router as pipeline_router

app = FastAPI(title="FOLIO Mapper API", version="0.1.0")


# --- Security: Optional API token authentication (#4) ---
# Set FOLIO_API_TOKEN env var to require Bearer token on all /api/ endpoints.
# For single-user deployments, bind to 127.0.0.1 and leave this unset.
_api_token = os.environ.get("FOLIO_API_TOKEN")


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if _api_token and request.url.path.startswith("/api/"):
            auth = request.headers.get("Authorization", "")
            if auth != f"Bearer {_api_token}":
                from starlette.responses import JSONResponse
                return JSONResponse(
                    status_code=401,
                    content={"detail": "Invalid or missing API token"},
                )
        response = await call_next(request)
        return response


if _api_token:
    app.add_middleware(AuthMiddleware)


# --- Security: Simple rate limiting (#9) ---
# Lightweight in-process rate limiter (no external dependency).
# For production, use a reverse proxy rate limiter (nginx, Cloudflare, etc.).
_RATE_LIMIT_WINDOW = 60  # seconds
_RATE_LIMITS = {
    "/api/pipeline/map": 30,       # expensive LLM calls
    "/api/github/submit-issue": 5, # prevent GitHub spam
    "/api/parse/file": 60,         # file uploads
    "/api/llm/test-connection": 30,
}
_rate_counters: dict[str, list[float]] = defaultdict(list)


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        limit = _RATE_LIMITS.get(path)
        if limit and request.method == "POST":
            client_ip = request.client.host if request.client else "unknown"
            key = f"{client_ip}:{path}"
            now = time.time()
            # Clean old entries
            _rate_counters[key] = [t for t in _rate_counters[key] if now - t < _RATE_LIMIT_WINDOW]
            if len(_rate_counters[key]) >= limit:
                from starlette.responses import JSONResponse
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Rate limit exceeded. Try again later."},
                )
            _rate_counters[key].append(now)
        return await call_next(request)


app.add_middleware(RateLimitMiddleware)

# CORS: load origins from env (comma-separated), default to localhost dev server
_cors_env = os.environ.get("CORS_ORIGINS", "http://localhost:5173")
cors_origins = [o.strip() for o in _cors_env.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
)

# --- Security: HSTS and security headers (#2) ---
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    return response


app.include_router(parse_router)
app.include_router(mapping_router)
app.include_router(llm_router)
app.include_router(pipeline_router)
app.include_router(export_router)
app.include_router(github_router)


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


# Desktop mode: serve built web app as static files (SPA fallback to index.html)
web_dir = os.environ.get("FOLIO_MAPPER_WEB_DIR")
if web_dir and os.path.isdir(web_dir):
    from starlette.staticfiles import StaticFiles
    from starlette.types import Receive, Scope, Send

    class SPAStaticFiles(StaticFiles):
        async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
            try:
                await super().__call__(scope, receive, send)
            except Exception:
                # SPA fallback: serve index.html for unknown paths
                scope["path"] = "/"
                await super().__call__(scope, receive, send)

    app.mount("/", SPAStaticFiles(directory=web_dir, html=True), name="static")
