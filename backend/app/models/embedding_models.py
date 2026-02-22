"""Pydantic models for embedding-based semantic search."""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel


class EmbeddingProviderType(str, Enum):
    LOCAL = "local"
    OLLAMA = "ollama"
    OPENAI = "openai"


class EmbeddingConfig(BaseModel):
    provider: EmbeddingProviderType = EmbeddingProviderType.LOCAL
    model: str | None = None  # None = use provider default
    base_url: str | None = None
    api_key: str | None = None
    disabled: bool = False


class EmbeddingStatus(BaseModel):
    available: bool
    provider: str | None = None
    model: str | None = None
    dimension: int | None = None
    num_concepts: int | None = None
    index_cached: bool = False
    error: str | None = None
