"""Export scope expansion: enrich concepts with full metadata and expand scope."""

from __future__ import annotations

import logging

from folio import FOLIO

from app.models.export_models import ExportConcept, ExportRequest, ExportRow, HierarchyPathEntryDict
from app.services.folio_service import get_branch_for_class, get_folio

logger = logging.getLogger(__name__)


def _extract_iri_hash(iri: str) -> str:
    return iri.rsplit("/", 1)[-1]


def _build_hierarchy_path(
    folio: FOLIO, iri_hash: str
) -> tuple[list[str], list[HierarchyPathEntryDict]]:
    """Build hierarchy path from root branch down to this class.

    Returns:
        (labels_list, entries_list) where entries_list includes iri_hash for each node.
    """
    labels: list[str] = []
    entries: list[HierarchyPathEntryDict] = []
    owl_class = folio[iri_hash]
    if not owl_class:
        return labels, entries

    current = owl_class
    visited: set[str] = set()
    while current and len(labels) < 10:
        current_hash = _extract_iri_hash(current.iri)
        if current_hash in visited:
            break
        visited.add(current_hash)
        label = current.label or current_hash
        labels.append(label)
        entries.append(HierarchyPathEntryDict(label=label, iri_hash=current_hash))

        if not current.sub_class_of:
            break
        parent_iri = current.sub_class_of[0]
        if "owl#Thing" in parent_iri:
            break
        parent_hash = _extract_iri_hash(parent_iri)
        current = folio[parent_hash]

    labels.reverse()
    entries.reverse()
    return labels, entries


def enrich_concept(
    folio: FOLIO,
    iri_hash: str,
    *,
    score: float = 0.0,
    is_mapped: bool = True,
    mapping_source_text: str | None = None,
    relationship: str | None = None,
) -> ExportConcept | None:
    """Look up a FOLIO class by iri_hash and build a fully-enriched ExportConcept."""
    owl_class = folio[iri_hash]
    if not owl_class:
        return None

    branch = get_branch_for_class(folio, iri_hash)
    hierarchy_path, hierarchy_path_entries = _build_hierarchy_path(folio, iri_hash)

    # Parent IRI hash
    parent_iri_hash = None
    if owl_class.sub_class_of:
        parent_iri = owl_class.sub_class_of[0]
        if "owl#Thing" not in parent_iri:
            parent_iri_hash = _extract_iri_hash(parent_iri)

    # See also
    see_also: list[str] = []
    if hasattr(owl_class, "see_also") and owl_class.see_also:
        see_also = [_extract_iri_hash(sa) for sa in owl_class.see_also]

    # Notes: combine editorial_note and history_note
    notes_parts: list[str] = []
    for attr in ("editorial_note", "history_note"):
        val = getattr(owl_class, attr, None)
        if val:
            if isinstance(val, list):
                notes_parts.extend(val)
            else:
                notes_parts.append(str(val))
    notes = "; ".join(notes_parts) if notes_parts else None

    # Deprecated
    deprecated = bool(getattr(owl_class, "deprecated", False))

    # Alternative labels, examples, translations
    alt_labels = list(owl_class.alternative_labels) if owl_class.alternative_labels else []
    examples = list(owl_class.examples) if hasattr(owl_class, "examples") and owl_class.examples else []
    translations = dict(owl_class.translations) if hasattr(owl_class, "translations") and owl_class.translations else {}

    return ExportConcept(
        label=owl_class.label or iri_hash,
        iri=owl_class.iri,
        iri_hash=iri_hash,
        branch=branch,
        score=score,
        definition=owl_class.definition,
        translations=translations,
        alternative_labels=alt_labels,
        examples=examples,
        hierarchy_path=hierarchy_path,
        hierarchy_path_entries=hierarchy_path_entries,
        parent_iri_hash=parent_iri_hash,
        see_also=see_also,
        notes=notes,
        deprecated=deprecated,
        is_mapped=is_mapped,
        mapping_source_text=mapping_source_text,
        relationship=relationship,
    )


def _enrich_mapped_only(request: ExportRequest, folio: FOLIO) -> ExportRequest:
    """Enrich each mapped concept with full metadata."""
    new_rows: list[ExportRow] = []
    for row in request.rows:
        enriched_concepts: list[ExportConcept] = []
        for concept in row.selected_concepts:
            try:
                enriched = enrich_concept(
                    folio,
                    concept.iri_hash,
                    score=concept.score,
                    is_mapped=True,
                    mapping_source_text=row.source_text,
                    relationship="direct",
                )
            except Exception:
                logger.exception("enrich_concept failed for %s", concept.iri_hash)
                enriched = None
            if enriched:
                enriched_concepts.append(enriched)
            else:
                # Fallback: keep original concept with scope fields
                concept.is_mapped = True
                concept.mapping_source_text = row.source_text
                concept.relationship = "direct"
                enriched_concepts.append(concept)

        new_rows.append(ExportRow(
            item_index=row.item_index,
            source_text=row.source_text,
            ancestry=row.ancestry,
            selected_concepts=enriched_concepts,
            note=row.note,
            status=row.status,
        ))
    return ExportRequest(
        rows=new_rows,
        options=request.options,
        source_file=request.source_file,
        session_created=request.session_created,
        preview_rows=request.preview_rows,
    )


def _is_branch_root(folio: FOLIO, iri_hash: str) -> bool:
    """Check if a class is a branch root (direct child of owl#Thing)."""
    owl_class = folio[iri_hash]
    if not owl_class or not owl_class.sub_class_of:
        return True
    return any("owl#Thing" in s for s in owl_class.sub_class_of)


def _enrich_mapped_with_related(request: ExportRequest, folio: FOLIO) -> ExportRequest:
    """Enrich mapped concepts + add direct ancestors and direct descendants."""
    new_rows: list[ExportRow] = []
    for row in request.rows:
        concepts: list[ExportConcept] = []
        seen_hashes: set[str] = set()

        for concept in row.selected_concepts:
            # Enrich the mapped concept
            try:
                enriched = enrich_concept(
                    folio,
                    concept.iri_hash,
                    score=concept.score,
                    is_mapped=True,
                    mapping_source_text=row.source_text,
                    relationship="direct",
                )
            except Exception:
                logger.exception("enrich_concept failed for %s", concept.iri_hash)
                enriched = None
            if enriched and enriched.iri_hash not in seen_hashes:
                concepts.append(enriched)
                seen_hashes.add(enriched.iri_hash)
            elif not enriched and concept.iri_hash not in seen_hashes:
                concept.is_mapped = True
                concept.mapping_source_text = row.source_text
                concept.relationship = "direct"
                concepts.append(concept)
                seen_hashes.add(concept.iri_hash)

            owl_class = folio[concept.iri_hash]
            if not owl_class:
                continue

            # --- Direct descendants: children of the mapped concept ---
            if hasattr(owl_class, "parent_class_of") and owl_class.parent_class_of:
                for child_iri in owl_class.parent_class_of:
                    child_hash = _extract_iri_hash(child_iri)
                    if child_hash in seen_hashes:
                        continue
                    try:
                        child = enrich_concept(
                            folio,
                            child_hash,
                            score=0.0,
                            is_mapped=False,
                            mapping_source_text=row.source_text,
                            relationship="child",
                        )
                    except Exception:
                        logger.exception("enrich_concept failed for child %s", child_hash)
                        continue
                    if child:
                        concepts.append(child)
                        seen_hashes.add(child_hash)

            # --- Direct ancestors: walk up the parent chain, stop before branch root ---
            if owl_class.sub_class_of:
                parent_iri = owl_class.sub_class_of[0]
                if "owl#Thing" not in parent_iri:
                    current_hash = _extract_iri_hash(parent_iri)
                    visited_ancestors: set[str] = set()
                    while current_hash and len(visited_ancestors) < 10:
                        if current_hash in seen_hashes or current_hash in visited_ancestors:
                            break
                        ancestor_class = folio[current_hash]
                        if not ancestor_class:
                            break
                        # Stop at branch root (parent is owl#Thing) — it's already the branch header
                        if not ancestor_class.sub_class_of or any(
                            "owl#Thing" in s for s in ancestor_class.sub_class_of
                        ):
                            break
                        visited_ancestors.add(current_hash)
                        try:
                            ancestor = enrich_concept(
                                folio,
                                current_hash,
                                score=0.0,
                                is_mapped=False,
                                mapping_source_text=row.source_text,
                                relationship="ancestor",
                            )
                        except Exception:
                            logger.exception("enrich_concept failed for ancestor %s", current_hash)
                            break
                        if ancestor:
                            concepts.append(ancestor)
                            seen_hashes.add(current_hash)
                        # Move up
                        current_hash = _extract_iri_hash(ancestor_class.sub_class_of[0])

        new_rows.append(ExportRow(
            item_index=row.item_index,
            source_text=row.source_text,
            ancestry=row.ancestry,
            selected_concepts=concepts,
            note=row.note,
            status=row.status,
        ))

    return ExportRequest(
        rows=new_rows,
        options=request.options,
        source_file=request.source_file,
        session_created=request.session_created,
        preview_rows=request.preview_rows,
    )


def _build_full_ontology(request: ExportRequest, folio: FOLIO) -> ExportRequest:
    """Export all FOLIO classes, with mapped items flagged."""
    # Build lookup of mapped iri_hashes -> (source_text, score)
    mapped_lookup: dict[str, tuple[str, float]] = {}
    for row in request.rows:
        for concept in row.selected_concepts:
            if concept.iri_hash not in mapped_lookup:
                mapped_lookup[concept.iri_hash] = (row.source_text, concept.score)

    # Iterate all classes, group by branch
    branch_concepts: dict[str, list[ExportConcept]] = {}
    for owl_class in folio.classes:
        iri_hash = _extract_iri_hash(owl_class.iri)
        is_mapped = iri_hash in mapped_lookup
        source_text = mapped_lookup[iri_hash][0] if is_mapped else None
        score = mapped_lookup[iri_hash][1] if is_mapped else 0.0

        try:
            enriched = enrich_concept(
                folio,
                iri_hash,
                score=score,
                is_mapped=is_mapped,
                mapping_source_text=source_text,
                relationship="direct" if is_mapped else "ontology",
            )
        except Exception:
            logger.exception("enrich_concept failed for %s in full ontology", iri_hash)
            continue
        if enriched:
            branch_concepts.setdefault(enriched.branch, []).append(enriched)

    # Build rows: one row per concept, grouped by branch
    new_rows: list[ExportRow] = []
    idx = 0
    for branch in sorted(branch_concepts.keys()):
        for concept in branch_concepts[branch]:
            new_rows.append(ExportRow(
                item_index=idx,
                source_text=concept.mapping_source_text or "",
                ancestry=[],
                selected_concepts=[concept],
                note=None,
                status="completed" if concept.is_mapped else "ontology",
            ))
            idx += 1

    return ExportRequest(
        rows=new_rows,
        options=request.options,
        source_file=request.source_file,
        session_created=request.session_created,
        preview_rows=request.preview_rows,
    )


def collect_ancestor_metadata(concepts: list[ExportConcept]) -> dict[str, dict]:
    """Collect and enrich ancestor nodes from hierarchy_path_entries not in the concepts list."""
    folio = get_folio()
    concept_hashes: set[str] = set()
    ancestor_hashes: set[str] = set()

    for concept in concepts:
        concept_hashes.add(concept.iri_hash)
        for entry in concept.hierarchy_path_entries:
            ancestor_hashes.add(entry.iri_hash)

    result: dict[str, dict] = {}
    for iri_hash in ancestor_hashes - concept_hashes:
        try:
            enriched = enrich_concept(
                folio, iri_hash, score=0.0, is_mapped=False, relationship="ancestor"
            )
            if enriched:
                result[iri_hash] = enriched.model_dump()
        except Exception:
            logger.exception("Failed to enrich ancestor %s", iri_hash)

    return result


def expand_scope(request: ExportRequest) -> ExportRequest:
    """Dispatch to the appropriate scope expansion strategy."""
    scope = request.options.export_scope
    folio = get_folio()

    if scope == "mapped_with_related":
        return _enrich_mapped_with_related(request, folio)
    elif scope == "full_ontology":
        return _build_full_ontology(request, folio)
    else:
        return _enrich_mapped_only(request, folio)
