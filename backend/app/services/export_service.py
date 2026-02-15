"""Export service: generates CSV, Excel, JSON, RDF/Turtle, JSON-LD, Markdown, HTML, PDF."""

from __future__ import annotations

import csv
import io
import json
from datetime import datetime, timezone

from openpyxl import Workbook
from openpyxl.styles import Font

from app.models.export_models import ExportOptions, ExportRequest, ExportRow
from app.services.folio_service import get_folio


# --- Translation support ---


def get_translations(
    iri_hashes: list[str], languages: list[str]
) -> dict[str, dict[str, str]]:
    """Fetch translations for concepts from FOLIO ontology.

    Returns: { iri_hash: { lang_code: translated_label } }
    """
    folio = get_folio()
    result: dict[str, dict[str, str]] = {}

    for iri_hash in iri_hashes:
        owl_class = folio[iri_hash]
        if not owl_class:
            continue

        translations: dict[str, str] = {}
        owl_translations = getattr(owl_class, "translations", None)
        if owl_translations:
            for lang in languages:
                if lang in owl_translations:
                    translations[lang] = owl_translations[lang]

        if translations:
            result[iri_hash] = translations

    return result


# --- Column headers ---

LANG_NAMES: dict[str, str] = {
    "en": "English",
    "es": "Español",
    "fr": "Français",
    "de": "Deutsch",
    "zh": "中文",
    "ja": "日本語",
    "pt": "Português",
    "ar": "العربية",
    "ru": "Русский",
    "hi": "हिन्दी",
}


def _build_headers(options: ExportOptions) -> list[str]:
    headers = ["Source", "Label", "IRI", "Branch"]
    if options.include_confidence:
        headers.append("Confidence")
    if options.include_notes:
        headers.append("Notes")
    for lang in options.languages:
        headers.append(f"Label ({LANG_NAMES.get(lang, lang)})")
    return headers


# --- Row flattening (one concept per row) ---


def _flatten_rows(
    rows: list[ExportRow], options: ExportOptions
) -> list[list[str]]:
    flat: list[list[str]] = []
    for row in rows:
        if not row.selected_concepts:
            line: list[str] = [row.source_text, "", "", ""]
            if options.include_confidence:
                line.append("")
            if options.include_notes:
                line.append(row.note or "")
            for _ in options.languages:
                line.append("")
            flat.append(line)
        else:
            for concept in row.selected_concepts:
                if options.iri_format == "hash":
                    iri_display = concept.iri_hash
                elif options.iri_format == "full_url":
                    iri_display = concept.iri
                else:
                    iri_display = f"{concept.iri_hash} ({concept.iri})"

                line = [
                    row.source_text,
                    concept.label,
                    iri_display,
                    concept.branch,
                ]
                if options.include_confidence:
                    line.append(str(round(concept.score, 1)))
                if options.include_notes:
                    line.append(row.note or "")
                for lang in options.languages:
                    line.append(concept.translations.get(lang, ""))
                flat.append(line)
    return flat


# --- Format generators ---


def generate_csv(request: ExportRequest) -> bytes:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(_build_headers(request.options))
    writer.writerows(_flatten_rows(request.rows, request.options))
    return output.getvalue().encode("utf-8-sig")  # BOM for Excel compat


def generate_excel(request: ExportRequest) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "FOLIO Mappings"
    headers = _build_headers(request.options)
    ws.append(headers)
    for cell in ws[1]:
        cell.font = Font(bold=True)
    for row_data in _flatten_rows(request.rows, request.options):
        ws.append(row_data)
    for col in ws.columns:
        max_len = max(len(str(cell.value or "")) for cell in col)
        ws.column_dimensions[col[0].column_letter].width = min(max_len + 2, 50)
    output = io.BytesIO()
    wb.save(output)
    return output.getvalue()


def generate_json(request: ExportRequest) -> bytes:
    now = datetime.now(timezone.utc).isoformat()
    data = {
        "exported": now,
        "source_file": request.source_file,
        "total_items": len(request.rows),
        "mappings": [
            {
                "source": row.source_text,
                "ancestry": row.ancestry,
                "status": row.status,
                "note": row.note,
                "concepts": [
                    {
                        "label": c.label,
                        "iri": c.iri,
                        "iri_hash": c.iri_hash,
                        "branch": c.branch,
                        "score": c.score,
                        "definition": c.definition,
                        "translations": c.translations,
                    }
                    for c in row.selected_concepts
                ],
            }
            for row in request.rows
        ],
    }
    return json.dumps(data, indent=2, ensure_ascii=False).encode("utf-8")


def _escape_turtle(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")


def generate_rdf_turtle(request: ExportRequest) -> bytes:
    lines = [
        "@prefix folio: <https://folio.openlegalstandard.org/> .",
        "@prefix skos: <http://www.w3.org/2004/02/skos/core#> .",
        "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .",
        "@prefix dcterms: <http://purl.org/dc/terms/> .",
        "",
    ]
    for row in request.rows:
        for concept in row.selected_concepts:
            lines.append(f"folio:{concept.iri_hash}")
            lines.append(
                f'    rdfs:label "{_escape_turtle(concept.label)}" ;'
            )
            if concept.definition:
                lines.append(
                    f'    skos:definition "{_escape_turtle(concept.definition)}" ;'
                )
            lines.append(
                f'    dcterms:subject "{_escape_turtle(row.source_text)}" .'
            )
            lines.append("")
    return "\n".join(lines).encode("utf-8")


def generate_json_ld(request: ExportRequest) -> bytes:
    doc = {
        "@context": {
            "folio": "https://folio.openlegalstandard.org/",
            "skos": "http://www.w3.org/2004/02/skos/core#",
            "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
            "dcterms": "http://purl.org/dc/terms/",
        },
        "@graph": [],
    }
    for row in request.rows:
        for concept in row.selected_concepts:
            node: dict = {
                "@id": f"folio:{concept.iri_hash}",
                "rdfs:label": concept.label,
                "dcterms:subject": row.source_text,
            }
            if concept.definition:
                node["skos:definition"] = concept.definition
            if concept.translations:
                node["skos:altLabel"] = [
                    {"@value": label, "@language": lang}
                    for lang, label in concept.translations.items()
                ]
            doc["@graph"].append(node)
    return json.dumps(doc, indent=2, ensure_ascii=False).encode("utf-8")


def generate_markdown(request: ExportRequest) -> bytes:
    now = datetime.now(timezone.utc).isoformat()
    lines = ["# FOLIO Mapping Results", ""]
    if request.source_file:
        lines.append(f"**Source:** {request.source_file}")
    lines.append(f"**Exported:** {now}")
    lines.append(f"**Total items:** {len(request.rows)}")
    lines.append("")

    headers = _build_headers(request.options)
    lines.append("| " + " | ".join(headers) + " |")
    lines.append("| " + " | ".join(["---"] * len(headers)) + " |")
    for flat_row in _flatten_rows(request.rows, request.options):
        lines.append("| " + " | ".join(str(c) for c in flat_row) + " |")
    lines.append("")
    return "\n".join(lines).encode("utf-8")


def _confidence_css_class(score_str: str) -> str:
    try:
        score = float(score_str)
        if score >= 90:
            return "conf-90"
        if score >= 75:
            return "conf-75"
        if score >= 60:
            return "conf-60"
        if score >= 45:
            return "conf-45"
        return "conf-low"
    except ValueError:
        return ""


def generate_html(request: ExportRequest) -> bytes:
    headers = _build_headers(request.options)
    flat = _flatten_rows(request.rows, request.options)
    now = datetime.now(timezone.utc).isoformat()

    parts = [
        "<!DOCTYPE html>",
        "<html><head><meta charset='utf-8'>",
        "<title>FOLIO Mapping Report</title>",
        "<style>",
        "  body { font-family: -apple-system, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; }",
        "  table { border-collapse: collapse; width: 100%; }",
        "  th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }",
        "  th { background: #f8f9fa; font-weight: 600; }",
        "  .conf-90 { background: #228B22; color: white; }",
        "  .conf-75 { background: #90EE90; }",
        "  .conf-60 { background: #FFD700; }",
        "  .conf-45 { background: #FF8C00; color: white; }",
        "  .conf-low { background: #D3D3D3; }",
        "</style></head><body>",
        "<h1>FOLIO Mapping Report</h1>",
        f"<p>Source: {_html_escape(request.source_file or 'N/A')} | "
        f"Items: {len(request.rows)} | Exported: {now}</p>",
        "<table>",
        "<thead><tr>"
        + "".join(f"<th>{_html_escape(h)}</th>" for h in headers)
        + "</tr></thead>",
        "<tbody>",
    ]
    for row_data in flat:
        parts.append("<tr>")
        for i, cell in enumerate(row_data):
            css = ""
            if i < len(headers) and headers[i] == "Confidence" and cell:
                cls = _confidence_css_class(cell)
                if cls:
                    css = f' class="{cls}"'
            parts.append(f"<td{css}>{_html_escape(str(cell))}</td>")
        parts.append("</tr>")
    parts.append("</tbody></table></body></html>")
    return "\n".join(parts).encode("utf-8")


def _html_escape(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def generate_pdf(request: ExportRequest) -> bytes:
    # For MVP, generate print-friendly HTML; true PDF requires weasyprint
    return generate_html(request)
