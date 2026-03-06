"""Lazy-loaded spaCy NLP helper with graceful degradation.

Provides word-vector-based similar word lookup and word-pair similarity.
Prefers en_core_web_lg (685K vectors) for comprehensive coverage, falls back
to en_core_web_md (20K vectors). Degrades silently when spaCy is unavailable.
"""

from __future__ import annotations

import logging
import os
from functools import lru_cache

logger = logging.getLogger(__name__)

_nlp = None
_available = False

# Preferred model order: lg has 685K vectors vs md's 20K
_MODELS = ["en_core_web_lg", "en_core_web_md"]


def warmup() -> None:
    """Load best available spaCy model. Safe to call multiple times."""
    global _nlp, _available
    if _available:
        return
    try:
        import spacy
    except ImportError:
        logger.info("spaCy not installed — NLP word vectors disabled")
        return

    # Allow override via env var
    env_model = os.environ.get("SPACY_MODEL")
    models = [env_model] if env_model else _MODELS

    for model_name in models:
        try:
            _nlp = spacy.load(model_name)
            _available = True
            logger.info("spaCy %s loaded (%d vectors)", model_name, len(_nlp.vocab.vectors))
            return
        except OSError:
            logger.debug("spaCy model %s not found, trying next", model_name)

    logger.info("No spaCy model found (%s) — NLP word vectors disabled", ", ".join(models))


def is_available() -> bool:
    """Whether spaCy word vectors are ready."""
    return _available


@lru_cache(maxsize=512)
def similar_words(word: str, top_n: int = 3, threshold: float = 0.5) -> list[tuple[str, float]]:
    """Top-N similar words via spaCy vocab vectors.

    Returns list of (word, similarity) tuples, or [] if unavailable.
    """
    if not _available or _nlp is None:
        return []

    import numpy as np

    lexeme = _nlp.vocab[word]
    if not lexeme.has_vector or lexeme.vector_norm == 0:
        return []

    # Query the vectors for most similar keys
    vec = lexeme.vector.reshape(1, -1)
    keys, _, scores = _nlp.vocab.vectors.most_similar(vec, n=top_n + 5)

    results: list[tuple[str, float]] = []
    for key, score in zip(keys[0], scores[0]):
        sim_word = _nlp.vocab.strings[key]
        sim = float(score)
        # Filter: must pass threshold, be alphabetic, different from input
        if sim >= threshold and sim_word.isalpha() and sim_word.lower() != word.lower():
            results.append((sim_word.lower(), sim))
            if len(results) >= top_n:
                break

    return results


@lru_cache(maxsize=2048)
def word_similarity(word_a: str, word_b: str) -> float:
    """Cosine similarity between two word vectors. Returns 0.0 if unavailable."""
    if not _available or _nlp is None:
        return 0.0

    lex_a = _nlp.vocab[word_a]
    lex_b = _nlp.vocab[word_b]

    if not lex_a.has_vector or not lex_b.has_vector:
        return 0.0
    if lex_a.vector_norm == 0 or lex_b.vector_norm == 0:
        return 0.0

    return float(lex_a.similarity(lex_b))


def reset() -> None:
    """Reset state (for tests)."""
    global _nlp, _available
    _nlp = None
    _available = False
    similar_words.cache_clear()
    word_similarity.cache_clear()
