from fastapi import APIRouter
from fastapi.responses import Response

from app.models.export_models import ExportPreviewRow, ExportRequest, TranslationRequest
from app.services.export_scope import expand_scope
from app.services.export_service import (
    generate_csv,
    generate_excel,
    generate_html,
    generate_json,
    generate_json_ld,
    generate_markdown,
    generate_pdf,
    generate_rdf_turtle,
    get_translations,
)

router = APIRouter(prefix="/api/export", tags=["export"])

FORMAT_GENERATORS = {
    "csv": (generate_csv, "text/csv", ".csv"),
    "excel": (
        generate_excel,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".xlsx",
    ),
    "json": (generate_json, "application/json", ".json"),
    "rdf_turtle": (generate_rdf_turtle, "text/turtle", ".ttl"),
    "json_ld": (generate_json_ld, "application/ld+json", ".jsonld"),
    "markdown": (generate_markdown, "text/markdown", ".md"),
    "html": (generate_html, "text/html", ".html"),
    "pdf": (generate_pdf, "application/pdf", ".pdf"),
}


@router.post("/generate")
async def export_generate(body: ExportRequest) -> Response:
    fmt = body.options.format
    if fmt not in FORMAT_GENERATORS:
        return Response(
            content=f'{{"detail":"Unsupported format: {fmt}"}}',
            status_code=400,
            media_type="application/json",
        )

    expanded = expand_scope(body)
    generator, mime_type, extension = FORMAT_GENERATORS[fmt]
    data = generator(expanded)

    filename = f"folio-mappings{extension}"
    return Response(
        content=data,
        media_type=mime_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/preview", response_model=list[ExportPreviewRow])
async def export_preview(body: ExportRequest) -> list[ExportPreviewRow]:
    """Return a preview of the export (default 5 rows)."""
    preview_count = body.preview_rows or 5
    expanded = expand_scope(body)
    preview_rows: list[ExportPreviewRow] = []

    for row in expanded.rows[:preview_count]:
        if row.selected_concepts:
            for concept in row.selected_concepts:
                preview_rows.append(
                    ExportPreviewRow(
                        source=row.source_text,
                        label=concept.label,
                        iri=(
                            concept.iri_hash
                            if expanded.options.iri_format == "hash"
                            else concept.iri
                        ),
                        branch=concept.branch,
                        confidence=(
                            concept.score
                            if expanded.options.include_confidence
                            else None
                        ),
                        note=row.note if expanded.options.include_notes else None,
                        translations=concept.translations,
                    )
                )
        else:
            preview_rows.append(
                ExportPreviewRow(
                    source=row.source_text,
                    label="",
                    iri="",
                    branch="",
                    confidence=None,
                    note=row.note,
                )
            )

    return preview_rows[:preview_count]


@router.post("/translations")
async def fetch_translations(
    body: TranslationRequest,
) -> dict[str, dict[str, str]]:
    """Fetch translations for a list of IRI hashes."""
    return get_translations(body.iri_hashes, body.languages)
