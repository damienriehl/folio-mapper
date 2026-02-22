"""Embedding-based semantic search for FOLIO concepts."""

from app.services.embedding.service import (
    build_embedding_index,
    get_embedding_index,
    get_embedding_status,
)

__all__ = [
    "build_embedding_index",
    "get_embedding_index",
    "get_embedding_status",
]
