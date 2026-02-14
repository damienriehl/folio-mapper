from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers.parse import router as parse_router

app = FastAPI(title="FOLIO Mapper API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(parse_router)


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
