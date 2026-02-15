from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers.export import router as export_router
from app.routers.llm import router as llm_router
from app.routers.mapping import router as mapping_router
from app.routers.parse import router as parse_router
from app.routers.pipeline import router as pipeline_router

app = FastAPI(title="FOLIO Mapper API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(parse_router)
app.include_router(mapping_router)
app.include_router(llm_router)
app.include_router(pipeline_router)
app.include_router(export_router)


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
