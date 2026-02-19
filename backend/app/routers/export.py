from fastapi import APIRouter, Request
from fastapi.responses import Response

from app.rate_limit import limiter

from app.models.export_models import ExportPreviewRow, ExportRequest, TranslationRequest
from app.services.branch_config import get_branch_color
from app.services.branch_sort import sort_branches
from app.services.export_scope import collect_ancestor_metadata, expand_scope
from app.services.export_service import (
    generate_csv,
    generate_excel,
    generate_html,
    generate_json,
    generate_json_ld,
    generate_markdown,
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
}


@router.post("/generate")
@limiter.limit("60/minute")
async def export_generate(request: Request, body: ExportRequest) -> Response:
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


@router.post("/tree-data")
async def export_tree_data(body: ExportRequest) -> dict:
    """Return enriched, branch-grouped concepts for tree rendering."""
    expanded = expand_scope(body)

    # Group all concepts by branch, deduplicate by iri_hash (keep highest score)
    branch_seen: dict[str, dict[str, dict]] = {}  # branch -> {iri_hash -> concept_dict}
    mapped_count = 0

    for row in expanded.rows:
        for concept in row.selected_concepts:
            d = concept.model_dump()
            branch = concept.branch
            h = concept.iri_hash
            existing = branch_seen.setdefault(branch, {}).get(h)
            if existing is None or d.get("score", 0) > existing.get("score", 0):
                branch_seen.setdefault(branch, {})[h] = d

    branch_concepts: dict[str, list[dict]] = {}
    total_concepts = 0
    for branch, concepts_map in branch_seen.items():
        deduped = list(concepts_map.values())
        branch_concepts[branch] = deduped
        total_concepts += len(deduped)
        mapped_count += sum(1 for c in deduped if c.get("is_mapped"))

    # Sort branches
    sorted_branch_names = sort_branches(
        list(branch_concepts.keys()),
        mode=body.options.branch_sort_mode,
        custom_order=body.options.custom_branch_order or None,
    )

    branches = []
    for branch_name in sorted_branch_names:
        concepts = branch_concepts.get(branch_name, [])
        branches.append({
            "branch": branch_name,
            "branch_color": get_branch_color(branch_name),
            "concepts": concepts,
        })

    # Collect ancestor metadata for all concepts
    all_concepts = [
        concept
        for row in expanded.rows
        for concept in row.selected_concepts
    ]
    ancestor_metadata = collect_ancestor_metadata(all_concepts)

    return {
        "branches": branches,
        "total_concepts": total_concepts,
        "mapped_count": mapped_count,
        "ancestor_metadata": ancestor_metadata,
    }
