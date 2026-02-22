"""Singleton embedding service: manages provider + FAISS index lifecycle."""

from __future__ import annotations

import hashlib
import logging
import os
import threading

from app.models.embedding_models import EmbeddingConfig, EmbeddingProviderType, EmbeddingStatus

logger = logging.getLogger(__name__)

# Module-level singleton
_index: object | None = None  # FOLIOEmbeddingIndex
_provider: object | None = None  # BaseEmbeddingProvider
_lock = threading.Lock()
_error: str | None = None
_building = False


def _config_from_env() -> EmbeddingConfig:
    """Build EmbeddingConfig from environment variables."""
    provider_str = os.environ.get("EMBEDDING_PROVIDER", "local")
    try:
        provider = EmbeddingProviderType(provider_str)
    except ValueError:
        provider = EmbeddingProviderType.LOCAL

    return EmbeddingConfig(
        provider=provider,
        model=os.environ.get("EMBEDDING_MODEL"),
        base_url=os.environ.get("EMBEDDING_BASE_URL"),
        api_key=os.environ.get("EMBEDDING_API_KEY"),
        disabled=os.environ.get("EMBEDDING_DISABLED", "").lower() == "true",
    )


def _create_provider(config: EmbeddingConfig):
    """Create an embedding provider based on config."""
    if config.provider == EmbeddingProviderType.LOCAL:
        from app.services.embedding.local_provider import LocalEmbeddingProvider
        return LocalEmbeddingProvider(model=config.model)
    elif config.provider == EmbeddingProviderType.OLLAMA:
        from app.services.embedding.ollama_provider import OllamaEmbeddingProvider
        return OllamaEmbeddingProvider(model=config.model, base_url=config.base_url)
    elif config.provider == EmbeddingProviderType.OPENAI:
        from app.services.embedding.openai_provider import OpenAIEmbeddingProvider
        return OpenAIEmbeddingProvider(
            model=config.model,
            api_key=config.api_key,
            base_url=config.base_url,
        )
    else:
        raise ValueError(f"Unknown embedding provider: {config.provider}")


def _compute_owl_hash(folio) -> str:
    """Compute a hash of the FOLIO ontology for cache keying."""
    # Use number of classes + a sample of IRIs as a fingerprint
    classes = folio.classes
    n = len(classes)
    sample_iris = [classes[i].iri for i in range(0, n, max(1, n // 20))]
    content = f"{n}:{','.join(sample_iris)}"
    return hashlib.sha256(content.encode()).hexdigest()[:16]


def build_embedding_index(config: EmbeddingConfig | None = None) -> None:
    """Build (or rebuild) the FAISS embedding index.

    This loads FOLIO, creates the embedding provider, embeds all concepts,
    and builds the FAISS index. Results are cached to disk.

    Gracefully degrades: if dependencies are missing, sets _error and returns.
    """
    global _index, _provider, _error, _building

    if config is None:
        config = _config_from_env()

    if config.disabled:
        _error = "Embeddings disabled via configuration"
        logger.info("Embedding service disabled")
        return

    with _lock:
        _building = True
        _error = None

        try:
            # Check for required dependencies
            try:
                import faiss  # noqa: F401
                import numpy  # noqa: F401
            except ImportError as e:
                _error = f"Missing dependency: {e}. Install with: pip install -e '.[embedding]'"
                logger.info("Embedding dependencies not available: %s", _error)
                return

            # Create provider
            _provider = _create_provider(config)

            # Load FOLIO concepts
            from app.services.folio_service import get_branch_for_class, get_folio

            folio = get_folio()
            owl_hash = _compute_owl_hash(folio)

            # Extract concept data
            iri_hashes = []
            labels = []
            definitions = []
            branches = []

            for owl_class in folio.classes:
                iri = owl_class.iri
                # Skip owl:Thing and other non-FOLIO IRIs
                if "folio.openlegalstandard.org" not in iri:
                    continue
                h = iri.rsplit("/", 1)[-1]
                label = owl_class.label
                if not label:
                    continue

                iri_hashes.append(h)
                labels.append(label)
                definitions.append(owl_class.definition)
                branches.append(get_branch_for_class(folio, h))

            logger.info("Extracted %d FOLIO concepts for embedding", len(iri_hashes))

            # Build index
            from app.services.embedding.folio_index import FOLIOEmbeddingIndex

            idx = FOLIOEmbeddingIndex(
                provider=_provider,
                iri_hashes=iri_hashes,
                labels=labels,
                definitions=definitions,
                branches=branches,
            )
            idx.build(owl_hash=owl_hash)
            _index = idx

            logger.info("Embedding index ready: %d concepts", idx.num_concepts)

        except Exception as e:
            _error = str(e)
            logger.error("Failed to build embedding index: %s", e, exc_info=True)
        finally:
            _building = False


def get_embedding_index():
    """Return the FAISS embedding index, or None if not available."""
    return _index


def get_embedding_status() -> EmbeddingStatus:
    """Return current embedding service status."""
    if _index is not None and _provider is not None:
        return EmbeddingStatus(
            available=True,
            provider=_provider.model_name,
            model=_provider.model_name,
            dimension=_provider.dimension(),
            num_concepts=_index.num_concepts,
            index_cached=True,
        )

    return EmbeddingStatus(
        available=False,
        error=_error or ("Building index..." if _building else "Index not built"),
    )


def reset_embedding_service() -> None:
    """Reset the embedding service state. Used in tests."""
    global _index, _provider, _error, _building
    _index = None
    _provider = None
    _error = None
    _building = False
