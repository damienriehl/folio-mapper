"""Tests for _see_also_within_branch() OWL see_also traversal."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from app.services.folio_service import _see_also_within_branch


def _mock_owl_class(
    label="Test",
    iri="http://example.org/Test",
    definition=None,
    alt_labels=None,
    sub_class_of=None,
    see_also=None,
    preferred_label=None,
):
    owl = MagicMock()
    owl.label = label
    owl.iri = iri
    owl.definition = definition
    owl.alternative_labels = alt_labels or []
    owl.sub_class_of = sub_class_of or []
    owl.see_also = see_also or []
    owl.preferred_label = preferred_label
    return owl


class TestSeeAlsoWithinBranch:
    """Tests for the _see_also_within_branch() helper."""

    def _setup_folio_mock(self, classes_by_hash: dict[str, object]):
        """Create a mock FOLIO that resolves classes by hash."""
        mock_folio = MagicMock()
        mock_folio.__getitem__ = MagicMock(side_effect=lambda h: classes_by_hash.get(h))
        return mock_folio

    def test_direct_see_also_target_in_branch(self):
        """A seed's direct see_also target in branch_hashes should be included."""
        # Seed: "Drug Crimes" has see_also → "Criminal Law" (in Area of Law branch)
        seed = _mock_owl_class(
            label="Drug Crimes",
            iri="http://example.org/RDrugCrimes",
            definition="Crimes involving drugs",
            see_also=["http://example.org/RCriminalLaw"],
        )
        target = _mock_owl_class(
            label="Criminal Law",
            iri="http://example.org/RCriminalLaw",
            definition="Criminal law area",
        )

        folio = self._setup_folio_mock({"RCriminalLaw": target})
        branch_hashes = {"RAreaOfLaw", "RCriminalLaw", "RTaxLaw"}

        with (
            patch(
                "app.services.folio_service._content_words",
                return_value={"drug", "offenses"},
            ),
            patch(
                "app.services.folio_service._compute_relevance_score",
                return_value=75.0,
            ),
        ):
            # Mock search_by_label to return our seed
            folio.search_by_label = MagicMock(return_value=[(seed, 90.0)])

            results = _see_also_within_branch(
                folio,
                "Drug Offenses",
                branch_hashes,
                existing_hashes=set(),
            )

        assert len(results) == 1
        assert results[0][0] == "RCriminalLaw"
        assert results[0][1] == target
        # Score = 75.0 * 0.70 * (0.85^0) = 52.5
        assert results[0][2] == 52.5

    def test_see_also_via_parent_depth_1(self):
        """see_also on a seed's parent (depth=1) should be included with discounted score."""
        # Seed: "Drug Crimes" → parent "Criminal Claims" has see_also → "Criminal Law"
        seed = _mock_owl_class(
            label="Drug Crimes",
            iri="http://example.org/RDrugCrimes",
            definition="Crimes involving drugs",
            sub_class_of=["http://example.org/RCriminalClaims"],
        )
        parent = _mock_owl_class(
            label="Criminal Claims",
            iri="http://example.org/RCriminalClaims",
            see_also=["http://example.org/RCriminalLaw"],
        )
        target = _mock_owl_class(
            label="Criminal Law",
            iri="http://example.org/RCriminalLaw",
        )

        folio = self._setup_folio_mock({
            "RCriminalClaims": parent,
            "RCriminalLaw": target,
        })
        branch_hashes = {"RAreaOfLaw", "RCriminalLaw"}

        with (
            patch(
                "app.services.folio_service._content_words",
                return_value={"drug", "offenses"},
            ),
            patch(
                "app.services.folio_service._compute_relevance_score",
                return_value=70.0,
            ),
        ):
            folio.search_by_label = MagicMock(return_value=[(seed, 80.0)])

            results = _see_also_within_branch(
                folio,
                "Drug Offenses",
                branch_hashes,
                existing_hashes=set(),
            )

        assert len(results) == 1
        assert results[0][0] == "RCriminalLaw"
        # Score = 70.0 * 0.70 * (0.85^1) = 41.6 (rounded to 41.6)
        assert results[0][2] == 41.6

    def test_see_also_target_not_in_branch_excluded(self):
        """see_also targets NOT in branch_hashes should be excluded."""
        seed = _mock_owl_class(
            label="Drug Crimes",
            iri="http://example.org/RDrugCrimes",
            see_also=["http://example.org/RSomeOtherConcept"],
        )
        other = _mock_owl_class(
            label="Some Other Concept",
            iri="http://example.org/RSomeOtherConcept",
        )

        folio = self._setup_folio_mock({"RSomeOtherConcept": other})
        # Target is NOT in branch_hashes
        branch_hashes = {"RAreaOfLaw", "RCriminalLaw"}

        with (
            patch(
                "app.services.folio_service._content_words",
                return_value={"drug", "crimes"},
            ),
            patch(
                "app.services.folio_service._compute_relevance_score",
                return_value=80.0,
            ),
        ):
            folio.search_by_label = MagicMock(return_value=[(seed, 90.0)])

            results = _see_also_within_branch(
                folio,
                "Drug Crimes",
                branch_hashes,
                existing_hashes=set(),
            )

        assert len(results) == 0

    def test_see_also_target_already_existing_excluded(self):
        """see_also targets already in existing_hashes should be excluded."""
        seed = _mock_owl_class(
            label="Drug Crimes",
            iri="http://example.org/RDrugCrimes",
            see_also=["http://example.org/RCriminalLaw"],
        )
        target = _mock_owl_class(
            label="Criminal Law",
            iri="http://example.org/RCriminalLaw",
        )

        folio = self._setup_folio_mock({"RCriminalLaw": target})
        branch_hashes = {"RAreaOfLaw", "RCriminalLaw"}

        with (
            patch(
                "app.services.folio_service._content_words",
                return_value={"drug", "crimes"},
            ),
            patch(
                "app.services.folio_service._compute_relevance_score",
                return_value=80.0,
            ),
        ):
            folio.search_by_label = MagicMock(return_value=[(seed, 90.0)])

            results = _see_also_within_branch(
                folio,
                "Drug Crimes",
                branch_hashes,
                existing_hashes={"RCriminalLaw"},  # Already found
            )

        assert len(results) == 0

    def test_low_scoring_seed_not_used(self):
        """Seeds scoring below source_threshold (50) should not be used for traversal."""
        seed = _mock_owl_class(
            label="Unrelated Concept",
            iri="http://example.org/RUnrelated",
            see_also=["http://example.org/RCriminalLaw"],
        )
        target = _mock_owl_class(
            label="Criminal Law",
            iri="http://example.org/RCriminalLaw",
        )

        folio = self._setup_folio_mock({"RCriminalLaw": target})
        branch_hashes = {"RAreaOfLaw", "RCriminalLaw"}

        with (
            patch(
                "app.services.folio_service._content_words",
                return_value={"drug", "offenses"},
            ),
            patch(
                "app.services.folio_service._compute_relevance_score",
                return_value=30.0,  # Below default threshold of 50
            ),
        ):
            folio.search_by_label = MagicMock(return_value=[(seed, 40.0)])

            results = _see_also_within_branch(
                folio,
                "Drug Offenses",
                branch_hashes,
                existing_hashes=set(),
            )

        assert len(results) == 0

    def test_no_see_also_attribute(self):
        """Seeds without see_also attribute should be gracefully skipped."""
        seed = MagicMock()
        seed.label = "Drug Crimes"
        seed.iri = "http://example.org/RDrugCrimes"
        seed.definition = None
        seed.alternative_labels = []
        seed.sub_class_of = []
        # No see_also attribute at all
        del seed.see_also

        folio = self._setup_folio_mock({})
        branch_hashes = {"RAreaOfLaw", "RCriminalLaw"}

        with (
            patch(
                "app.services.folio_service._content_words",
                return_value={"drug", "crimes"},
            ),
            patch(
                "app.services.folio_service._compute_relevance_score",
                return_value=80.0,
            ),
        ):
            folio.search_by_label = MagicMock(return_value=[(seed, 90.0)])

            results = _see_also_within_branch(
                folio,
                "Drug Crimes",
                branch_hashes,
                existing_hashes=set(),
            )

        assert len(results) == 0

    def test_empty_search_results(self):
        """When fuzzy search returns no results, should return empty list."""
        folio = self._setup_folio_mock({})
        branch_hashes = {"RAreaOfLaw"}

        with patch(
            "app.services.folio_service._content_words",
            return_value={"xyz"},
        ):
            folio.search_by_label = MagicMock(return_value=[])

            results = _see_also_within_branch(
                folio,
                "xyz",
                branch_hashes,
                existing_hashes=set(),
            )

        assert len(results) == 0

    def test_deduplication_keeps_best_score(self):
        """When multiple seeds point to the same target, keep the best score."""
        # Two seeds both have see_also → Criminal Law
        seed1 = _mock_owl_class(
            label="Drug Crimes",
            iri="http://example.org/RDrugCrimes",
            see_also=["http://example.org/RCriminalLaw"],
        )
        seed2 = _mock_owl_class(
            label="Criminal Offenses",
            iri="http://example.org/RCrimOffenses",
            see_also=["http://example.org/RCriminalLaw"],
        )
        target = _mock_owl_class(
            label="Criminal Law",
            iri="http://example.org/RCriminalLaw",
        )

        folio = self._setup_folio_mock({"RCriminalLaw": target})
        branch_hashes = {"RAreaOfLaw", "RCriminalLaw"}

        call_count = [0]
        scores = [80.0, 60.0]

        def mock_score(*args, **kwargs):
            score = scores[min(call_count[0], len(scores) - 1)]
            call_count[0] += 1
            return score

        with (
            patch(
                "app.services.folio_service._content_words",
                return_value={"drug", "offenses"},
            ),
            patch(
                "app.services.folio_service._compute_relevance_score",
                side_effect=mock_score,
            ),
        ):
            folio.search_by_label = MagicMock(
                return_value=[(seed1, 90.0), (seed2, 85.0)]
            )

            results = _see_also_within_branch(
                folio,
                "Drug Offenses",
                branch_hashes,
                existing_hashes=set(),
            )

        # Should have exactly 1 result (deduplicated)
        assert len(results) == 1
        assert results[0][0] == "RCriminalLaw"
        # Best score should win: 80.0 * 0.70 = 56.0
        assert results[0][2] == 56.0
