"""Local embedding provider using sentence-transformers."""

from __future__ import annotations

import logging

import numpy as np

from app.services.embedding.base import BaseEmbeddingProvider

logger = logging.getLogger(__name__)

_DEFAULT_MODEL = "all-mpnet-base-v2"


class LocalEmbeddingProvider(BaseEmbeddingProvider):
    """Offline embedding provider using sentence-transformers.

    Default model: all-mpnet-base-v2 (768-dim, good quality).
    Alternative: all-MiniLM-L6-v2 (384-dim, faster, less memory).
    """

    def __init__(self, model: str | None = None):
        try:
            from sentence_transformers import SentenceTransformer
        except ImportError:
            raise ImportError(
                "sentence-transformers is required for local embeddings. "
                "Install with: pip install sentence-transformers"
            )

        self._model_name = model or _DEFAULT_MODEL
        logger.info("Loading sentence-transformers model: %s", self._model_name)
        self._model = SentenceTransformer(self._model_name)
        self._dim = self._model.get_sentence_embedding_dimension()
        logger.info("Model loaded: %s (dim=%d)", self._model_name, self._dim)

    def embed(self, text: str) -> np.ndarray:
        vec = self._model.encode(text, normalize_embeddings=True)
        return np.asarray(vec, dtype=np.float32)

    def embed_batch(self, texts: list[str]) -> np.ndarray:
        vecs = self._model.encode(texts, normalize_embeddings=True, batch_size=256)
        return np.asarray(vecs, dtype=np.float32)

    def dimension(self) -> int:
        return self._dim

    @property
    def model_name(self) -> str:
        return self._model_name
