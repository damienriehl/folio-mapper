"""Tests for domain-aware search expansion and re-scoring."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from app.services.folio_service import (
    LEGAL_TERM_EXPANSIONS,
    _compute_relevance_score,
    _content_words,
    _generate_search_terms,
)


# --- Search term generation ---


def test_generate_search_terms_includes_expansions():
    """Legal terms like 'litigation' should generate expanded phrases."""
    terms = _generate_search_terms("Commercial Litigation")
    terms_lower = [t.lower() for t in terms]
    assert "litigation practice" in terms_lower
    assert "litigation service" in terms_lower


def test_generate_search_terms_no_expansion_for_non_legal_terms():
    """Non-legal terms should not generate expansion phrases."""
    terms = _generate_search_terms("Dog Bite Injury")
    terms_lower = [t.lower() for t in terms]
    # None of these words are in LEGAL_TERM_EXPANSIONS
    for t in terms_lower:
        assert "practice" not in t
        assert "service" not in t


# --- Expansion scoring ---


def test_expansion_scoring_boosts_exact_match():
    """'Litigation Practice' scored against 'litigation practice' should get ~99."""
    # Score against original query: only partial overlap
    original_content = _content_words("Commercial Litigation")
    original_score = _compute_relevance_score(
        original_content,
        "Commercial Litigation",
        "Litigation Practice",
        None,
        [],
    )

    # Score against expanded query: near-exact match
    expanded_content = _content_words("litigation practice")
    expanded_score = _compute_relevance_score(
        expanded_content,
        "litigation practice",
        "Litigation Practice",
        None,
        [],
    )

    assert expanded_score > original_score
    assert expanded_score >= 95.0  # Near-exact match


def test_expansion_dedup_keeps_best_score():
    """When a candidate is scored against multiple queries, best score wins.

    Simulates the Phase 2.1 dedup logic from search_candidates().
    """
    label = "Litigation Practice"
    definition = None
    synonyms: list[str] = []

    # Original query score
    original_content = _content_words("Commercial Litigation")
    score_original = _compute_relevance_score(
        original_content, "Commercial Litigation", label, definition, synonyms,
    )

    # Expansion query scores
    scores = [score_original]
    for suffix in LEGAL_TERM_EXPANSIONS.get("litigation", []):
        eq = f"litigation {suffix}"
        eq_content = _content_words(eq)
        s = _compute_relevance_score(eq_content, eq, label, definition, synonyms)
        scores.append(s)

    best = max(scores)

    # The best score should come from the expansion, not the original
    assert best > score_original
    assert best >= 95.0


# --- Integration-style: search_candidates with mock FOLIO ---


def _mock_owl_class(label, iri, definition=None, alt_labels=None, sub_class_of=None, parent_class_of=None):
    owl = MagicMock()
    owl.label = label
    owl.iri = iri
    owl.definition = definition
    owl.alternative_labels = alt_labels or []
    owl.sub_class_of = sub_class_of or []
    owl.parent_class_of = parent_class_of or []
    return owl


def test_search_candidates_expansion_rescoring():
    """search_candidates should re-score 'Litigation Practice' highly for 'Commercial Litigation'."""
    litigation_practice = _mock_owl_class(
        "Litigation Practice",
        "http://example.org/LP",
        "A practice area focused on litigation",
    )
    commercial_law = _mock_owl_class(
        "Commercial Law",
        "http://example.org/CL",
        "Law governing commercial transactions",
    )

    mock_folio = MagicMock()

    # search_by_label returns both candidates for any search term
    def mock_search_by_label(term, include_alt_labels=True, limit=25):
        return [(litigation_practice, 80.0), (commercial_law, 75.0)]

    def mock_search_by_prefix(term):
        return [litigation_practice, commercial_law]

    def mock_search_by_definition(term, limit=20):
        return [(litigation_practice, 50.0)]

    mock_folio.search_by_label = mock_search_by_label
    mock_folio.search_by_prefix = mock_search_by_prefix
    mock_folio.search_by_definition = mock_search_by_definition
    mock_folio.__getitem__ = lambda self, h: None  # No parent lookups needed

    with (
        patch("app.services.folio_service.get_folio", return_value=mock_folio),
        patch("app.services.folio_service.get_branch_for_class", return_value="Service"),
        patch("app.services.folio_service._build_hierarchy_path", return_value=[]),
        patch("app.services.folio_service.get_branch_color", return_value="#888"),
    ):
        from app.services.folio_service import search_candidates
        candidates = search_candidates("Commercial Litigation", threshold=0.3)

    # Find the Litigation Practice candidate
    lp = next((c for c in candidates if c.label == "Litigation Practice"), None)
    assert lp is not None, "Litigation Practice should appear in results"
    assert lp.score >= 95.0, f"Expected score >= 95.0, got {lp.score}"
