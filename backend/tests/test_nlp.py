"""Tests for the spaCy NLP helper module."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from app.services import nlp


@pytest.fixture(autouse=True)
def _reset_nlp():
    """Reset NLP module state before each test."""
    nlp.reset()
    yield
    nlp.reset()


# --- Graceful degradation ---


def test_not_available_by_default():
    """Module starts unavailable before warmup."""
    assert nlp.is_available() is False


def test_similar_words_returns_empty_when_unavailable():
    assert nlp.similar_words("surgical") == []


def test_word_similarity_returns_zero_when_unavailable():
    assert nlp.word_similarity("surgical", "surgery") == 0.0


def test_warmup_handles_missing_spacy():
    """Graceful degradation when spaCy is not installed."""
    with patch.dict("sys.modules", {"spacy": None}):
        nlp.reset()
        nlp.warmup()
        assert nlp.is_available() is False


def test_warmup_handles_missing_model():
    """Graceful degradation when en_core_web_md is not installed."""
    mock_spacy = MagicMock()
    mock_spacy.load.side_effect = OSError("Can't find model 'en_core_web_md'")
    with patch.dict("sys.modules", {"spacy": mock_spacy}):
        nlp.reset()
        nlp.warmup()
        assert nlp.is_available() is False


# --- With spaCy available (integration tests, skipped if model missing) ---


def _spacy_available():
    try:
        import spacy

        # Try lg first (preferred), then md
        for model in ["en_core_web_lg", "en_core_web_md"]:
            try:
                spacy.load(model)
                return True
            except OSError:
                continue
        return False
    except ImportError:
        return False


def _has_lg_model():
    try:
        import spacy

        spacy.load("en_core_web_lg")
        return True
    except (ImportError, OSError):
        return False


spacy_required = pytest.mark.skipif(
    not _spacy_available(), reason="No spaCy model installed"
)

lg_required = pytest.mark.skipif(
    not _has_lg_model(), reason="spaCy en_core_web_lg not installed"
)


@spacy_required
def test_warmup_loads_model():
    nlp.warmup()
    assert nlp.is_available() is True


@lg_required
def test_similar_words_surgical():
    """'surgical' should have 'surgery' among similar words (requires lg model)."""
    nlp.warmup()
    results = nlp.similar_words("surgical", top_n=5, threshold=0.4)
    words = [w for w, _ in results]
    assert "surgery" in words, f"Expected 'surgery' in {words}"


@lg_required
def test_word_similarity_surgical_surgery():
    nlp.warmup()
    sim = nlp.word_similarity("surgical", "surgery")
    assert sim > 0.7, f"Expected > 0.7, got {sim}"


@spacy_required
def test_word_similarity_error_malpractice():
    nlp.warmup()
    sim = nlp.word_similarity("error", "malpractice")
    assert sim > 0.15, f"Expected > 0.15, got {sim}"


@spacy_required
def test_word_similarity_unrelated_words():
    nlp.warmup()
    sim = nlp.word_similarity("surgical", "bicycle")
    assert sim < 0.3, f"Expected < 0.3, got {sim}"


@spacy_required
def test_caching_works():
    """lru_cache should return same result on repeated calls."""
    nlp.warmup()
    r1 = nlp.similar_words("litigation")
    r2 = nlp.similar_words("litigation")
    assert r1 == r2
    # Check cache info
    info = nlp.similar_words.cache_info()
    assert info.hits >= 1


@spacy_required
def test_similar_words_filters_non_alpha():
    """Results should only contain alphabetic words."""
    nlp.warmup()
    results = nlp.similar_words("contract", top_n=5, threshold=0.3)
    for word, _ in results:
        assert word.isalpha(), f"Non-alpha word in results: {word}"


@spacy_required
def test_similar_words_excludes_input():
    """Input word should not appear in its own similar words."""
    nlp.warmup()
    results = nlp.similar_words("litigation", top_n=5, threshold=0.3)
    words = [w for w, _ in results]
    assert "litigation" not in words
