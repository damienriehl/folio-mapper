import json
import os
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.middleware.auth import LocalAuthMiddleware
from app.rate_limit import limiter
from app.routers.export import router as export_router
from app.routers.github import router as github_router
from app.routers.llm import router as llm_router
from app.routers.mapping import router as mapping_router
from app.routers.parse import router as parse_router
from app.routers.pipeline import router as pipeline_router
from app.services.local_auth import get_or_create_token


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Emit local auth token to stdout for the Electron shell to capture."""
    token = get_or_create_token()
    if token:
        print(json.dumps({"local_token": token}), file=sys.stdout, flush=True)
    yield


app = FastAPI(title="FOLIO Mapper API", version="0.1.0", lifespan=lifespan)

# --- Rate limiting (Finding 9) ---
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# --- CORS (Finding 5) ---
cors_origins = os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",")
cors_origins = [o.strip() for o in cors_origins if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Local-Token", "X-GitHub-Pat"],
)


# --- Security headers middleware ---
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response


app.add_middleware(SecurityHeadersMiddleware)

# --- Local auth middleware (Finding 4) ---
app.add_middleware(LocalAuthMiddleware)

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
