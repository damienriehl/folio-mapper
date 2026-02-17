"""Tests for export tree data endpoint, branch sorting, and HTML tree section."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models.export_models import (
    ExportConcept,
    ExportOptions,
    ExportRequest,
    ExportRow,
    HierarchyPathEntryDict,
)
from app.services.branch_sort import DEFAULT_BRANCH_ORDER, sort_branches
from app.services.export_service import generate_html
from app.services.export_tree_html import generate_tree_html_section


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


# --- Test helpers ---


def _make_concept(**overrides) -> ExportConcept:
    defaults = {
        "label": "Criminal Law",
        "iri": "https://folio.openlegalstandard.org/RCriminalLaw",
        "iri_hash": "RCriminalLaw",
        "branch": "Area of Law",
        "score": 85.0,
        "definition": "Law dealing with crimes and punishments",
        "translations": {"es": "Derecho Penal"},
        "alternative_labels": ["Penal Law"],
        "examples": ["Murder", "Theft"],
        "hierarchy_path": ["Area of Law", "Criminal Law"],
        "hierarchy_path_entries": [
            {"label": "Area of Law", "iri_hash": "RAreaOfLaw"},
            {"label": "Criminal Law", "iri_hash": "RCriminalLaw"},
        ],
        "is_mapped": True,
        "relationship": "direct",
    }
    defaults.update(overrides)
    return ExportConcept(**defaults)


def _make_options(**overrides) -> ExportOptions:
    defaults = {
        "format": "csv",
        "include_confidence": True,
        "include_notes": True,
        "include_reasoning": False,
        "iri_format": "hash",
        "languages": [],
        "include_hierarchy": True,
        "export_scope": "mapped_only",
    }
    defaults.update(overrides)
    return ExportOptions(**defaults)


def _make_row(**overrides) -> ExportRow:
    defaults = {
        "item_index": 0,
        "source_text": "DUI Defense",
        "ancestry": ["Criminal Law"],
        "selected_concepts": [_make_concept()],
        "note": "Reviewed",
        "status": "completed",
    }
    defaults.update(overrides)
    return ExportRow(**defaults)


def _make_request(**overrides) -> ExportRequest:
    defaults = {
        "rows": [_make_row()],
        "options": _make_options(),
        "source_file": "test.txt",
        "session_created": None,
    }
    defaults.update(overrides)
    return ExportRequest(**defaults)


# --- Branch sorting tests ---


def test_sort_branches_default_follows_prd_order():
    branches = ["Service", "Area of Law", "Event"]
    result = sort_branches(branches, mode="default")
    assert result == ["Area of Law", "Service", "Event"]


def test_sort_branches_alphabetical():
    branches = ["Service", "Area of Law", "Event"]
    result = sort_branches(branches, mode="alphabetical")
    assert result == ["Area of Law", "Event", "Service"]


def test_sort_branches_custom_order():
    branches = ["Service", "Area of Law", "Event"]
    result = sort_branches(branches, mode="custom", custom_order=["Event", "Service"])
    assert result == ["Event", "Service", "Area of Law"]


def test_sort_branches_unknown_branches_sorted_alphabetically_at_end():
    branches = ["Zzz Unknown", "Area of Law"]
    result = sort_branches(branches, mode="default")
    assert result[0] == "Area of Law"
    assert result[1] == "Zzz Unknown"


def test_default_branch_order_has_23_entries():
    assert len(DEFAULT_BRANCH_ORDER) == 23


# --- ExportOptions new fields have correct defaults ---


def test_export_options_new_fields_defaults():
    opts = ExportOptions(format="csv")
    assert opts.branch_sort_mode == "default"
    assert opts.custom_branch_order == []
    assert opts.include_tree_section is True
    assert opts.include_table_section is True


# --- hierarchy_path_entries model ---


def test_hierarchy_path_entries_on_concept():
    concept = _make_concept()
    assert len(concept.hierarchy_path_entries) == 2
    assert concept.hierarchy_path_entries[0].label == "Area of Law"
    assert concept.hierarchy_path_entries[0].iri_hash == "RAreaOfLaw"
    assert concept.hierarchy_path_entries[1].label == "Criminal Law"
    assert concept.hierarchy_path_entries[1].iri_hash == "RCriminalLaw"


def test_hierarchy_path_entries_defaults_to_empty():
    concept = ExportConcept(
        label="Test", iri="http://test/R1", iri_hash="R1",
        branch="Test", score=50.0,
    )
    assert concept.hierarchy_path_entries == []


# --- Tree data endpoint tests ---


def _mock_owl_class(
    iri_hash: str = "RCriminalLaw",
    label: str = "Criminal Law",
    definition: str | None = "Law dealing with crimes",
    sub_class_of: list[str] | None = None,
    parent_class_of: list[str] | None = None,
    alternative_labels: list[str] | None = None,
    examples: list[str] | None = None,
    translations: dict | None = None,
    see_also: list[str] | None = None,
    deprecated: bool = False,
) -> MagicMock:
    cls = MagicMock()
    cls.iri = f"https://folio.openlegalstandard.org/{iri_hash}"
    cls.label = label
    cls.definition = definition
    cls.sub_class_of = sub_class_of or ["http://www.w3.org/2002/07/owl#Thing"]
    cls.parent_class_of = parent_class_of
    cls.alternative_labels = alternative_labels or []
    cls.examples = examples or []
    cls.translations = translations or {}
    cls.see_also = see_also
    cls.editorial_note = None
    cls.history_note = None
    cls.deprecated = deprecated
    return cls


def _make_mock_folio(classes_map: dict[str, MagicMock]) -> MagicMock:
    folio = MagicMock()
    folio.__getitem__ = MagicMock(side_effect=lambda h: classes_map.get(h))
    folio.classes = [classes_map[h] for h in classes_map]
    return folio


@pytest.mark.anyio
async def test_tree_data_endpoint_returns_branches(client: AsyncClient):
    """Tree-data endpoint returns branch-grouped concepts."""
    req = _make_request()
    resp = await client.post("/api/export/tree-data", json=req.model_dump())
    assert resp.status_code == 200
    data = resp.json()
    assert "branches" in data
    assert "total_concepts" in data
    assert "mapped_count" in data
    assert "ancestor_metadata" in data
    assert data["total_concepts"] >= 1


@pytest.mark.anyio
async def test_tree_data_mapped_count(client: AsyncClient):
    """mapped_count reflects number of mapped concepts in mapped_only scope."""
    c1 = _make_concept(is_mapped=True)
    c2 = _make_concept(iri_hash="RCivilLaw", label="Civil Law", is_mapped=True)
    row = _make_row(selected_concepts=[c1, c2])
    req = _make_request(rows=[row])
    resp = await client.post("/api/export/tree-data", json=req.model_dump())
    data = resp.json()
    # In mapped_only scope, all concepts are marked as mapped
    assert data["mapped_count"] == 2
    assert data["total_concepts"] == 2


@pytest.mark.anyio
async def test_tree_data_branch_sorting_alphabetical(client: AsyncClient):
    """Alphabetical branch sorting works."""
    c1 = _make_concept(branch="Service", iri_hash="R1", label="Service A")
    c2 = _make_concept(branch="Area of Law", iri_hash="R2", label="Law A")
    row = _make_row(selected_concepts=[c1, c2])
    opts = _make_options(branch_sort_mode="alphabetical")
    req = _make_request(rows=[row], options=opts)
    resp = await client.post("/api/export/tree-data", json=req.model_dump())
    data = resp.json()
    branch_names = [b["branch"] for b in data["branches"]]
    assert branch_names == ["Area of Law", "Service"]


@pytest.mark.anyio
async def test_tree_data_branches_have_color(client: AsyncClient):
    """Each branch in tree data has a branch_color."""
    req = _make_request()
    resp = await client.post("/api/export/tree-data", json=req.model_dump())
    data = resp.json()
    for branch in data["branches"]:
        assert "branch_color" in branch
        assert branch["branch_color"].startswith("#")


# --- HTML tree section generation tests ---


def test_tree_html_section_contains_branch_headers():
    branches = [{
        "branch": "Area of Law",
        "branch_color": "#1A5276",
        "concepts": [_make_concept().model_dump()],
    }]
    html = generate_tree_html_section(branches)
    assert "Area of Law" in html
    assert "#1A5276" in html


def test_tree_html_section_contains_concept_nodes():
    branches = [{
        "branch": "Area of Law",
        "branch_color": "#1A5276",
        "concepts": [_make_concept().model_dump()],
    }]
    html = generate_tree_html_section(branches)
    assert "Criminal Law" in html
    assert "RCriminalLaw" in html


def test_tree_html_section_embeds_metadata():
    concept = _make_concept()
    branches = [{
        "branch": "Area of Law",
        "branch_color": "#1A5276",
        "concepts": [concept.model_dump()],
    }]
    html = generate_tree_html_section(branches)
    assert 'id="tree-metadata"' in html
    assert '"RCriminalLaw"' in html


def test_tree_html_section_has_expand_collapse_controls():
    branches = [{
        "branch": "Area of Law",
        "branch_color": "#1A5276",
        "concepts": [_make_concept().model_dump()],
    }]
    html = generate_tree_html_section(branches)
    assert "Expand All" in html
    assert "Collapse All" in html


def test_tree_html_section_has_detail_panel():
    branches = [{
        "branch": "Area of Law",
        "branch_color": "#1A5276",
        "concepts": [_make_concept().model_dump()],
    }]
    html = generate_tree_html_section(branches)
    assert 'id="detail-panel"' in html
    assert "Click a concept to see details" in html


def test_tree_html_section_contains_vanilla_js():
    branches = [{
        "branch": "Area of Law",
        "branch_color": "#1A5276",
        "concepts": [_make_concept().model_dump()],
    }]
    html = generate_tree_html_section(branches)
    assert "showDetail" in html
    assert "addEventListener" in html


# --- HTML export with tree section toggle tests ---


def test_html_export_includes_tree_section():
    """HTML export with include_tree_section=True includes tree section."""
    req = _make_request(options=_make_options(
        format="html",
        include_tree_section=True,
        include_table_section=True,
    ))
    data = generate_html(req)
    text = data.decode("utf-8")
    assert 'id="tree-section"' in text
    assert 'id="table-section"' in text


def test_html_export_without_tree_section():
    """HTML export with include_tree_section=False excludes tree section."""
    req = _make_request(options=_make_options(
        format="html",
        include_tree_section=False,
        include_table_section=True,
    ))
    data = generate_html(req)
    text = data.decode("utf-8")
    assert 'id="tree-section"' not in text
    assert 'id="table-section"' in text


def test_html_export_toggle_bar_when_both_sections():
    """HTML export has toggle bar when both tree and table are enabled."""
    req = _make_request(options=_make_options(
        format="html",
        include_tree_section=True,
        include_table_section=True,
    ))
    data = generate_html(req)
    text = data.decode("utf-8")
    assert "Tree View" in text
    assert "Table View" in text
    assert "toggleView" in text


def test_html_export_no_toggle_bar_when_single_section():
    """HTML export has no toggle bar when only one section is enabled."""
    req = _make_request(options=_make_options(
        format="html",
        include_tree_section=True,
        include_table_section=False,
    ))
    data = generate_html(req)
    text = data.decode("utf-8")
    assert "toggleView" not in text


def test_html_export_still_generates_valid_html():
    """HTML export still generates a valid HTML document."""
    req = _make_request(options=_make_options(format="html"))
    data = generate_html(req)
    text = data.decode("utf-8")
    assert "<!DOCTYPE html>" in text
    assert "<title>FOLIO Mapping Report</title>" in text
    assert "</html>" in text


# --- enrich_concept hierarchy_path_entries tests ---


def test_enrich_concept_populates_hierarchy_path_entries():
    """enrich_concept populates both hierarchy_path and hierarchy_path_entries."""
    from app.services.export_scope import enrich_concept

    parent = _mock_owl_class(
        iri_hash="RAreaOfLaw", label="Area of Law",
        sub_class_of=["http://www.w3.org/2002/07/owl#Thing"],
    )
    child = _mock_owl_class(
        iri_hash="RCriminalLaw", label="Criminal Law",
        sub_class_of=["https://folio.openlegalstandard.org/RAreaOfLaw"],
    )
    folio = _make_mock_folio({"RCriminalLaw": child, "RAreaOfLaw": parent})

    with patch("app.services.export_scope.get_branch_for_class", return_value="Area of Law"):
        result = enrich_concept(folio, "RCriminalLaw", score=85.0)

    assert result is not None
    assert result.hierarchy_path == ["Area of Law", "Criminal Law"]
    assert len(result.hierarchy_path_entries) == 2
    assert result.hierarchy_path_entries[0].label == "Area of Law"
    assert result.hierarchy_path_entries[0].iri_hash == "RAreaOfLaw"
    assert result.hierarchy_path_entries[1].label == "Criminal Law"
    assert result.hierarchy_path_entries[1].iri_hash == "RCriminalLaw"


# --- collect_ancestor_metadata tests ---


def test_collect_ancestor_metadata_enriches_ancestors():
    """collect_ancestor_metadata returns enriched data for ancestors not in concepts list."""
    from app.services.export_scope import collect_ancestor_metadata, enrich_concept

    parent = _mock_owl_class(
        iri_hash="RAreaOfLaw", label="Area of Law",
        sub_class_of=["http://www.w3.org/2002/07/owl#Thing"],
    )
    child = _mock_owl_class(
        iri_hash="RCriminalLaw", label="Criminal Law",
        sub_class_of=["https://folio.openlegalstandard.org/RAreaOfLaw"],
    )
    folio = _make_mock_folio({"RCriminalLaw": child, "RAreaOfLaw": parent})

    # Build a concept with hierarchy_path_entries that includes an ancestor
    with patch("app.services.export_scope.get_branch_for_class", return_value="Area of Law"):
        concept = enrich_concept(folio, "RCriminalLaw", score=85.0)

    assert concept is not None
    # RAreaOfLaw is in hierarchy_path_entries but not in the concepts list
    with (
        patch("app.services.export_scope.get_folio", return_value=folio),
        patch("app.services.export_scope.get_branch_for_class", return_value="Area of Law"),
    ):
        ancestors = collect_ancestor_metadata([concept])

    # RAreaOfLaw should be enriched as an ancestor; RCriminalLaw should NOT (it's a concept)
    assert "RAreaOfLaw" in ancestors
    assert "RCriminalLaw" not in ancestors
    assert ancestors["RAreaOfLaw"]["label"] == "Area of Law"
    assert ancestors["RAreaOfLaw"]["is_mapped"] is False
    assert ancestors["RAreaOfLaw"]["relationship"] == "ancestor"


def test_collect_ancestor_metadata_empty_when_no_ancestors():
    """collect_ancestor_metadata returns empty dict when all path entries are concepts."""
    from app.services.export_scope import collect_ancestor_metadata

    # Concept whose only hierarchy_path_entry is itself
    concept = _make_concept(
        hierarchy_path=["Criminal Law"],
        hierarchy_path_entries=[
            {"label": "Criminal Law", "iri_hash": "RCriminalLaw"},
        ],
    )
    with patch("app.services.export_scope.get_folio"):
        ancestors = collect_ancestor_metadata([concept])

    assert ancestors == {}


def test_tree_html_section_includes_ancestor_metadata():
    """HTML tree section includes ancestor metadata in the JSON block."""
    concept = _make_concept()
    branches = [{
        "branch": "Area of Law",
        "branch_color": "#1A5276",
        "concepts": [concept.model_dump()],
    }]
    ancestor_meta = {
        "RAreaOfLaw": {
            "label": "Area of Law",
            "iri": "https://folio.openlegalstandard.org/RAreaOfLaw",
            "iri_hash": "RAreaOfLaw",
            "branch": "Area of Law",
            "score": 0,
            "definition": "Areas of legal practice",
            "alternative_labels": [],
            "examples": [],
            "hierarchy_path": ["Area of Law"],
            "translations": {},
            "is_mapped": False,
            "notes": None,
        },
    }
    html = generate_tree_html_section(branches, ancestor_metadata=ancestor_meta)
    # Ancestor should appear in the metadata JSON
    assert '"RAreaOfLaw"' in html
    assert "Areas of legal practice" in html
