import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers.export import router as export_router
from app.routers.github import router as github_router
from app.routers.llm import router as llm_router
from app.routers.mapping import router as mapping_router
from app.routers.parse import router as parse_router
from app.routers.pipeline import router as pipeline_router

app = FastAPI(title="FOLIO Mapper API", version="0.1.0")

cors_origins = ["http://localhost:5173"]
extra_origin = os.environ.get("FOLIO_MAPPER_ORIGIN")
if extra_origin:
    cors_origins.append(extra_origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
