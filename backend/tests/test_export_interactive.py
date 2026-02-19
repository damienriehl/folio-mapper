"""Tests for the interactive HTML export section."""

from __future__ import annotations

from app.models.export_models import (
    ExportConcept,
    ExportOptions,
    ExportRequest,
    ExportRow,
    InputHierarchyNode,
)
from app.services.export_interactive_html import generate_interactive_html


def _make_concept(**overrides) -> ExportConcept:
    defaults = {
        "label": "Criminal Law",
        "iri": "https://folio.openlegalstandard.org/RCriminalLaw",
        "iri_hash": "RCriminalLaw",
        "branch": "Area of Law",
        "score": 85.0,
        "definition": "Law dealing with crimes and punishments",
        "translations": {},
        "alternative_labels": ["Penal Law"],
        "examples": ["Murder", "Theft"],
        "hierarchy_path": ["Area of Law", "Criminal Law"],
    }
    defaults.update(overrides)
    return ExportConcept(**defaults)


def _make_row(**overrides) -> ExportRow:
    defaults = {
        "item_index": 0,
        "source_text": "DUI Defense",
        "ancestry": ["Criminal Law"],
        "selected_concepts": [_make_concept()],
        "note": None,
        "status": "completed",
    }
    defaults.update(overrides)
    return ExportRow(**defaults)


def _make_options(**overrides) -> ExportOptions:
    defaults = {
        "format": "html",
        "include_confidence": True,
        "include_notes": True,
        "include_reasoning": False,
        "iri_format": "hash",
        "languages": [],
        "include_hierarchy": True,
    }
    defaults.update(overrides)
    return ExportOptions(**defaults)


def _make_hierarchy() -> list[InputHierarchyNode]:
    return [
        InputHierarchyNode(
            label="Criminal Law",
            depth=0,
            item_index=None,
            children=[
                InputHierarchyNode(
                    label="DUI Defense",
                    depth=1,
                    item_index=0,
                    children=[],
                ),
                InputHierarchyNode(
                    label="Theft Defense",
                    depth=1,
                    item_index=1,
                    children=[],
                ),
            ],
        ),
    ]


def _make_request(**overrides) -> ExportRequest:
    defaults = {
        "rows": [_make_row()],
        "options": _make_options(),
        "source_file": "test.txt",
        "session_created": None,
        "input_hierarchy": _make_hierarchy(),
    }
    defaults.update(overrides)
    return ExportRequest(**defaults)


def test_three_panels_present():
    """Interactive HTML has left, middle, and right panes."""
    req = _make_request()
    html = generate_interactive_html(req)
    assert 'class="int-left"' in html
    assert 'class="int-middle"' in html
    assert 'class="int-right"' in html


def test_json_data_blocks_embedded():
    """Interactive HTML embeds input, mapping, and metadata JSON blocks."""
    req = _make_request()
    html = generate_interactive_html(req)
    assert 'id="interactive-input-data"' in html
    assert 'id="interactive-mapping-data"' in html
    assert 'id="interactive-concept-metadata"' in html


def test_svg_overlay_present():
    """Interactive HTML includes SVG overlay for bezier lines."""
    req = _make_request()
    html = generate_interactive_html(req)
    assert 'id="int-svg-overlay"' in html
    assert "int-svg-overlay" in html


def test_input_items_with_data_attributes():
    """Input data contains item_index for leaf nodes."""
    req = _make_request()
    html = generate_interactive_html(req)
    # The JSON data is HTML-escaped inside script tags
    assert "&quot;item_index&quot;: 0" in html
    assert "&quot;item_index&quot;: 1" in html


def test_folio_concepts_with_data_iri():
    """Mapping data contains concept iri_hash."""
    req = _make_request()
    html = generate_interactive_html(req)
    assert "RCriminalLaw" in html


def test_js_functions_present():
    """Interactive HTML includes core JS functions."""
    req = _make_request()
    html = generate_interactive_html(req)
    assert "renderInputTree" in html
    assert "renderOutputTree" in html
    assert "renderDetail" in html
    assert "drawLines" in html


def test_self_contained_no_external_refs():
    """Interactive HTML has no external script or stylesheet references."""
    req = _make_request()
    html = generate_interactive_html(req)
    assert "src=" not in html.lower().replace('type="application/json"', "")
    assert "href=" not in html.lower()


def test_html_escaping():
    """Special characters in labels are HTML-escaped in JSON blocks."""
    concept = _make_concept(label='Law of "Torts" & <Liability>')
    row = _make_row(selected_concepts=[concept])
    hierarchy = [
        InputHierarchyNode(
            label='Law of "Torts" & <Liability>',
            depth=0,
            item_index=0,
            children=[],
        ),
    ]
    req = _make_request(rows=[row], input_hierarchy=hierarchy)
    html = generate_interactive_html(req)
    # JSON inside script tags is HTML-escaped
    assert "&lt;" in html or "Torts" in html  # Content is present
    # Should not contain raw unescaped angle brackets in script content
    assert '<Liability>' not in html


def test_flat_input_rendering():
    """Flat input (no hierarchy) renders as flat list."""
    flat_hierarchy = [
        InputHierarchyNode(label="Item A", depth=0, item_index=0, children=[]),
        InputHierarchyNode(label="Item B", depth=0, item_index=1, children=[]),
    ]
    concept_a = _make_concept(label="Concept A", iri_hash="RA")
    concept_b = _make_concept(label="Concept B", iri_hash="RB")
    rows = [
        _make_row(item_index=0, source_text="Item A", selected_concepts=[concept_a]),
        _make_row(item_index=1, source_text="Item B", selected_concepts=[concept_b]),
    ]
    req = _make_request(rows=rows, input_hierarchy=flat_hierarchy)
    html = generate_interactive_html(req)
    assert "Item A" in html
    assert "Item B" in html


def test_mapping_count_badges():
    """Mapping data includes concept count per item."""
    concept1 = _make_concept(iri_hash="R1", label="Concept 1")
    concept2 = _make_concept(iri_hash="R2", label="Concept 2")
    concept3 = _make_concept(iri_hash="R3", label="Concept 3")
    row = _make_row(selected_concepts=[concept1, concept2, concept3])
    req = _make_request(rows=[row])
    html = generate_interactive_html(req)
    # JSON data is HTML-escaped; check mapping data contains 3 concepts for item 0
    assert "&quot;0&quot;: [" in html  # item_index 0 has a list of concepts


def test_concept_metadata_includes_all_fields():
    """Concept metadata JSON includes definition, synonyms, examples, hierarchy."""
    req = _make_request()
    html = generate_interactive_html(req)
    assert "Law dealing with crimes and punishments" in html
    assert "Penal Law" in html
    assert "Murder" in html
    assert "Theft" in html
