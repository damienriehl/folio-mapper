"""Tests for the export service and router."""

from __future__ import annotations

import csv
import io
import json
from unittest.mock import MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient
from openpyxl import load_workbook

from app.main import app
from app.models.export_models import (
    ExportConcept,
    ExportOptions,
    ExportRequest,
    ExportRow,
)
from app.services.export_service import (
    generate_csv,
    generate_excel,
    generate_html,
    generate_json,
    generate_json_ld,
    generate_markdown,
    generate_rdf_turtle,
)


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


def _make_concept(**overrides) -> ExportConcept:
    defaults = {
        "label": "Criminal Law",
        "iri": "https://folio.openlegalstandard.org/RCriminalLaw",
        "iri_hash": "RCriminalLaw",
        "branch": "Area of Law",
        "score": 85.0,
        "definition": "Law dealing with crimes and punishments",
        "translations": {"es": "Derecho Penal", "fr": "Droit pénal"},
    }
    defaults.update(overrides)
    return ExportConcept(**defaults)


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


def _make_options(**overrides) -> ExportOptions:
    defaults = {
        "format": "csv",
        "include_confidence": True,
        "include_notes": True,
        "include_reasoning": False,
        "iri_format": "hash",
        "languages": [],
        "include_hierarchy": True,
    }
    defaults.update(overrides)
    return ExportOptions(**defaults)


def _make_request(**overrides) -> ExportRequest:
    defaults = {
        "rows": [_make_row()],
        "options": _make_options(),
        "source_file": "test.txt",
        "session_created": None,
    }
    defaults.update(overrides)
    return ExportRequest(**defaults)


# --- CSV tests ---


def test_csv_produces_valid_csv_with_bom():
    req = _make_request()
    data = generate_csv(req)
    # UTF-8 BOM
    assert data[:3] == b"\xef\xbb\xbf"
    text = data.decode("utf-8-sig")
    reader = csv.reader(io.StringIO(text))
    rows = list(reader)
    assert rows[0] == ["Source", "Label", "IRI", "Branch", "Confidence", "Notes"]
    assert rows[1][0] == "DUI Defense"
    assert rows[1][1] == "Criminal Law"
    assert rows[1][2] == "RCriminalLaw"


def test_csv_includes_language_columns():
    req = _make_request(options=_make_options(languages=["es", "fr"]))
    data = generate_csv(req)
    text = data.decode("utf-8-sig")
    reader = csv.reader(io.StringIO(text))
    rows = list(reader)
    assert "Label (Español)" in rows[0]
    assert "Label (Français)" in rows[0]
    # Check translation values
    es_idx = rows[0].index("Label (Español)")
    assert rows[1][es_idx] == "Derecho Penal"


def test_csv_empty_selections():
    row = _make_row(selected_concepts=[], note="Skipped")
    req = _make_request(rows=[row])
    data = generate_csv(req)
    text = data.decode("utf-8-sig")
    reader = csv.reader(io.StringIO(text))
    rows = list(reader)
    assert len(rows) == 2  # header + 1 row
    assert rows[1][0] == "DUI Defense"
    assert rows[1][1] == ""  # empty label


# --- Excel tests ---


def test_excel_produces_valid_workbook():
    req = _make_request()
    data = generate_excel(req)
    wb = load_workbook(io.BytesIO(data))
    ws = wb.active
    assert ws.title == "FOLIO Mappings"
    assert ws.cell(1, 1).value == "Source"
    assert ws.cell(1, 1).font.bold is True
    assert ws.cell(2, 1).value == "DUI Defense"
    assert ws.cell(2, 2).value == "Criminal Law"


# --- JSON tests ---


def test_json_produces_valid_structure():
    req = _make_request()
    data = generate_json(req)
    parsed = json.loads(data)
    assert "exported" in parsed
    assert parsed["source_file"] == "test.txt"
    assert parsed["total_items"] == 1
    assert len(parsed["mappings"]) == 1
    mapping = parsed["mappings"][0]
    assert mapping["source"] == "DUI Defense"
    assert len(mapping["concepts"]) == 1
    assert mapping["concepts"][0]["label"] == "Criminal Law"


# --- RDF/Turtle tests ---


def test_rdf_turtle_has_valid_syntax():
    req = _make_request(options=_make_options(format="rdf_turtle"))
    data = generate_rdf_turtle(req)
    text = data.decode("utf-8")
    assert "@prefix folio:" in text
    assert "folio:RCriminalLaw" in text
    assert 'rdfs:label "Criminal Law"' in text
    assert 'dcterms:subject "DUI Defense"' in text


def test_rdf_turtle_escapes_quotes():
    concept = _make_concept(label='Law of "Torts"', definition=None)
    row = _make_row(selected_concepts=[concept])
    req = _make_request(rows=[row])
    data = generate_rdf_turtle(req)
    text = data.decode("utf-8")
    assert r'Law of \"Torts\"' in text


# --- JSON-LD tests ---


def test_json_ld_has_context_and_graph():
    req = _make_request(options=_make_options(format="json_ld"))
    data = generate_json_ld(req)
    parsed = json.loads(data)
    assert "@context" in parsed
    assert "@graph" in parsed
    assert "folio" in parsed["@context"]
    node = parsed["@graph"][0]
    assert node["@id"] == "folio:RCriminalLaw"
    assert node["rdfs:label"] == "Criminal Law"


def test_json_ld_includes_translations():
    req = _make_request(options=_make_options(format="json_ld"))
    data = generate_json_ld(req)
    parsed = json.loads(data)
    node = parsed["@graph"][0]
    assert "skos:altLabel" in node
    labels = {e["@language"]: e["@value"] for e in node["skos:altLabel"]}
    assert labels["es"] == "Derecho Penal"


# --- Markdown tests ---


def test_markdown_generates_table():
    req = _make_request(options=_make_options(format="markdown"))
    data = generate_markdown(req)
    text = data.decode("utf-8")
    assert "# FOLIO Mapping Results" in text
    assert "| Source | Label | IRI | Branch | Confidence | Notes |" in text
    assert "| DUI Defense | Criminal Law |" in text


# --- HTML tests ---


def test_html_generates_valid_document():
    req = _make_request(options=_make_options(format="html"))
    data = generate_html(req)
    text = data.decode("utf-8")
    assert "<!DOCTYPE html>" in text
    assert "<title>FOLIO Mapping Report</title>" in text
    assert "DUI Defense" in text
    assert "Criminal Law" in text


def test_html_confidence_color_classes():
    concepts = [
        _make_concept(score=95.0),
        _make_concept(iri_hash="R2", score=78.0),
        _make_concept(iri_hash="R3", score=63.0),
        _make_concept(iri_hash="R4", score=50.0),
        _make_concept(iri_hash="R5", score=30.0),
    ]
    rows = [_make_row(selected_concepts=[c]) for c in concepts]
    req = _make_request(rows=rows, options=_make_options(format="html"))
    data = generate_html(req)
    text = data.decode("utf-8")
    assert 'class="conf-90"' in text
    assert 'class="conf-75"' in text
    assert 'class="conf-60"' in text
    assert 'class="conf-45"' in text
    assert 'class="conf-low"' in text


# --- IRI format tests ---


def test_iri_format_full_url():
    req = _make_request(options=_make_options(iri_format="full_url"))
    data = generate_csv(req)
    text = data.decode("utf-8-sig")
    assert "https://folio.openlegalstandard.org/RCriminalLaw" in text


def test_iri_format_both():
    req = _make_request(options=_make_options(iri_format="both"))
    data = generate_csv(req)
    text = data.decode("utf-8-sig")
    assert "RCriminalLaw (https://folio.openlegalstandard.org/RCriminalLaw)" in text


# --- Column toggle tests ---


def test_exclude_confidence():
    req = _make_request(options=_make_options(include_confidence=False))
    data = generate_csv(req)
    text = data.decode("utf-8-sig")
    reader = csv.reader(io.StringIO(text))
    headers = next(reader)
    assert "Confidence" not in headers


def test_exclude_notes():
    req = _make_request(options=_make_options(include_notes=False))
    data = generate_csv(req)
    text = data.decode("utf-8-sig")
    reader = csv.reader(io.StringIO(text))
    headers = next(reader)
    assert "Notes" not in headers


# --- Preview endpoint tests ---


@pytest.mark.anyio
async def test_preview_endpoint_returns_rows(client: AsyncClient):
    req = _make_request()
    resp = await client.post("/api/export/preview", json=req.model_dump())
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["source"] == "DUI Defense"
    assert data[0]["label"] == "Criminal Law"


@pytest.mark.anyio
async def test_preview_limits_to_5_rows(client: AsyncClient):
    rows = [_make_row(item_index=i, source_text=f"Item {i}") for i in range(10)]
    req = _make_request(rows=rows)
    resp = await client.post("/api/export/preview", json=req.model_dump())
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) <= 5


# --- Generate endpoint tests ---


@pytest.mark.anyio
async def test_generate_csv_endpoint(client: AsyncClient):
    req = _make_request()
    resp = await client.post("/api/export/generate", json=req.model_dump())
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]
    assert "folio-mappings.csv" in resp.headers.get("content-disposition", "")


@pytest.mark.anyio
async def test_generate_unsupported_format(client: AsyncClient):
    req = _make_request(options=_make_options(format="invalid"))
    resp = await client.post("/api/export/generate", json=req.model_dump())
    assert resp.status_code == 400


# --- Translation endpoint test ---


@pytest.mark.anyio
async def test_translations_endpoint(client: AsyncClient):
    mock_folio = MagicMock()
    mock_class = MagicMock()
    mock_class.translations = {"es": "Derecho Penal"}
    mock_folio.__getitem__ = MagicMock(return_value=mock_class)

    with patch("app.services.export_service.get_folio", return_value=mock_folio):
        resp = await client.post(
            "/api/export/translations",
            json={"iri_hashes": ["RCriminalLaw"], "languages": ["es"]},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["RCriminalLaw"]["es"] == "Derecho Penal"
