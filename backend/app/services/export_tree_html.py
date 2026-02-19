"""Generate self-contained HTML tree section for export files."""

from __future__ import annotations

import json

from app.models.export_models import ExportConcept


def _html_escape(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;").replace("'", "&#x27;")


def _confidence_color(score: float) -> str:
    if score >= 90:
        return "#228B22"
    if score >= 75:
        return "#4CAF50"
    if score >= 60:
        return "#FF9800"
    if score >= 45:
        return "#FF5722"
    return "#9E9E9E"


def _build_tree_nodes(concepts: list[dict]) -> list[dict]:
    """Build a nested tree from flat concepts using hierarchy_path_entries."""
    roots: list[dict] = []

    for concept in concepts:
        entries = concept.get("hierarchy_path_entries", [])
        # Skip the first entry (branch root — shown as section header)
        segments = entries[1:] if len(entries) > 1 else []
        if not segments:
            # Direct child of branch root
            roots.append({
                "label": concept["label"],
                "iri_hash": concept["iri_hash"],
                "concept": concept,
                "children": [],
            })
            continue

        siblings = roots
        for i, seg in enumerate(segments):
            existing = None
            for node in siblings:
                if node["label"] == seg["label"]:
                    existing = node
                    break
            if existing is None:
                existing = {
                    "label": seg["label"],
                    "iri_hash": seg["iri_hash"],
                    "concept": None,
                    "children": [],
                }
                siblings.append(existing)
            if i == len(segments) - 1:
                existing["concept"] = concept
            siblings = existing["children"]

    return roots


def _render_tree_node_html(node: dict, depth: int = 0) -> str:
    """Render a tree node as nested HTML."""
    indent = depth * 16
    concept = node.get("concept")
    children = node.get("children", [])
    has_children = len(children) > 0

    parts: list[str] = []

    if concept:
        score = concept.get("score", 0)
        color = _confidence_color(score)
        iri_hash = _html_escape(concept["iri_hash"])
        label = _html_escape(node["label"])
        score_str = str(round(score, 1))

        if has_children:
            parts.append(
                f'<details open style="margin-left:{indent}px">'
                f'<summary class="tree-node tree-candidate" data-iri="{iri_hash}">'
                f'<span class="tree-toggle">&#9660;</span>'
                f'<span class="tree-label">{label}</span>'
                f'<span class="conf-badge" style="background:{color}28;color:{color};border-color:{color}70">{score_str}</span>'
                f'</summary>'
            )
            for child in children:
                parts.append(_render_tree_node_html(child, depth + 1))
            parts.append('</details>')
        else:
            parts.append(
                f'<div class="tree-node tree-leaf" style="margin-left:{indent}px" data-iri="{iri_hash}">'
                f'<span class="tree-dot">&#9679;</span>'
                f'<span class="tree-label">{label}</span>'
                f'<span class="conf-badge" style="background:{color}28;color:{color};border-color:{color}70">{score_str}</span>'
                f'</div>'
            )
    else:
        label = _html_escape(node["label"])
        if has_children:
            iri_hash_attr = f' data-iri="{_html_escape(node["iri_hash"])}"' if node.get("iri_hash") else ''
            parts.append(
                f'<details open style="margin-left:{indent}px">'
                f'<summary class="tree-node tree-structural"{iri_hash_attr}>'
                f'<span class="tree-toggle">&#9660;</span>'
                f'<span class="tree-label">{label}</span>'
                f'</summary>'
            )
            for child in children:
                parts.append(_render_tree_node_html(child, depth + 1))
            parts.append('</details>')
        else:
            parts.append(
                f'<div class="tree-node tree-structural" style="margin-left:{indent}px">'
                f'<span class="tree-label">{label}</span>'
                f'</div>'
            )

    return "\n".join(parts)


def generate_tree_html_section(
    branches_data: list[dict],
    ancestor_metadata: dict[str, dict] | None = None,
) -> str:
    """Generate a self-contained HTML tree section.

    Args:
        branches_data: List of {branch, branch_color, concepts: [dict...]}.
        ancestor_metadata: Optional dict of {iri_hash: enriched_concept_dict} for ancestor nodes.

    Returns:
        HTML string with inline styles and vanilla JS for interactivity.
    """
    # Build metadata lookup for detail panel
    metadata: dict[str, dict] = {}

    def _extract_meta(concept: dict) -> dict:
        return {
            "label": concept.get("label", ""),
            "iri": concept.get("iri", ""),
            "iri_hash": concept.get("iri_hash", ""),
            "branch": concept.get("branch", ""),
            "score": concept.get("score", 0),
            "definition": concept.get("definition"),
            "alternative_labels": concept.get("alternative_labels", []),
            "examples": concept.get("examples", []),
            "hierarchy_path": concept.get("hierarchy_path", []),
            "translations": concept.get("translations", {}),
            "is_mapped": concept.get("is_mapped", True),
            "notes": concept.get("notes"),
        }

    # Ancestor metadata first (so concepts can override if overlapping)
    if ancestor_metadata:
        for iri_hash, meta in ancestor_metadata.items():
            metadata[iri_hash] = _extract_meta(meta)

    for branch_data in branches_data:
        for concept in branch_data.get("concepts", []):
            iri_hash = concept.get("iri_hash", "")
            metadata[iri_hash] = _extract_meta(concept)

    parts: list[str] = []

    # Style block
    parts.append("""<style>
.tree-section { font-family: -apple-system, sans-serif; }
.tree-controls { display: flex; gap: 8px; margin-bottom: 12px; }
.tree-controls button {
  padding: 4px 12px; border: 1px solid #d1d5db; border-radius: 6px;
  background: #f9fafb; cursor: pointer; font-size: 13px; color: #374151;
}
.tree-controls button:hover { background: #e5e7eb; }
.tree-container { display: flex; gap: 16px; height: calc(100vh - 180px); min-height: 400px; }
.tree-panel { flex: 1; overflow-y: auto; border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px; }
.detail-panel { width: 320px; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; overflow-y: auto; }
.detail-panel.empty { display: flex; align-items: center; justify-content: center; color: #9ca3af; font-size: 13px; }
.branch-header {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 12px; margin: 4px 0; border-radius: 6px;
  font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;
  cursor: pointer; border-left: 4px solid;
}
.branch-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.branch-count { opacity: 0.7; }
details > summary { list-style: none; cursor: pointer; }
details > summary::-webkit-details-marker { display: none; }
.tree-toggle { font-size: 10px; color: #9ca3af; margin-right: 4px; cursor: pointer; flex-shrink: 0; }
details:not([open]) > summary .tree-toggle { display: inline-block; transform: rotate(-90deg); }
.tree-node { display: flex; align-items: center; gap: 6px; padding: 3px 4px; border-radius: 4px; font-size: 13px; }
.tree-candidate, .tree-leaf { cursor: pointer; }
.tree-candidate:hover, .tree-leaf:hover { background: #f3f4f6; }
.tree-leaf .tree-dot { font-size: 8px; color: #9ca3af; }
.tree-structural { color: #6b7280; }
.conf-badge {
  display: inline-flex; padding: 1px 6px; border-radius: 9999px;
  font-size: 11px; font-weight: 600; border: 1.5px solid;
  flex-shrink: 0;
}
.detail-section { margin-bottom: 12px; }
.detail-section-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; margin-bottom: 2px; }
.detail-section-value { font-size: 13px; color: #374151; }
.detail-pill { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 500; margin: 1px 2px; }
.detail-title { font-size: 15px; font-weight: 600; color: #111827; margin-bottom: 4px; }
.detail-breadcrumb { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; font-size: 12px; }
.detail-breadcrumb span { background: #eff6ff; color: #2563eb; padding: 2px 6px; border-radius: 4px; }
.detail-breadcrumb .sep { background: none; color: #93c5fd; }
</style>""")

    # Tree section container
    parts.append('<div class="tree-section" id="tree-section">')
    parts.append('<div class="tree-controls">')
    parts.append('<button onclick="document.querySelectorAll(\'#tree-section details\').forEach(d=>d.open=true)">Expand All</button>')
    parts.append('<button onclick="document.querySelectorAll(\'#tree-section details\').forEach(d=>d.open=false)">Collapse All</button>')
    parts.append('</div>')

    parts.append('<div class="tree-container">')
    parts.append('<div class="tree-panel">')

    # Render branches
    for branch_data in branches_data:
        branch = _html_escape(branch_data["branch"])
        color = branch_data.get("branch_color", "#9E9E9E")
        concepts = branch_data.get("concepts", [])
        count = len(concepts)

        parts.append(f'<details open>')
        parts.append(
            f'<summary class="branch-header" style="border-left-color:{color};background:{color}15;color:{color}">'
            f'<span class="tree-toggle" style="color:{color}90">&#9660;</span>'
            f'<span class="branch-dot" style="background:{color}"></span>'
            f'<span>{branch}</span>'
            f'<span class="branch-count">({count})</span>'
            f'</summary>'
        )

        tree_nodes = _build_tree_nodes(concepts)
        for node in tree_nodes:
            parts.append(_render_tree_node_html(node, depth=1))

        parts.append('</details>')

    parts.append('</div>')  # tree-panel

    # Detail panel
    parts.append('<div class="detail-panel empty" id="detail-panel">')
    parts.append('Click a concept to see details')
    parts.append('</div>')

    parts.append('</div>')  # tree-container

    # Metadata JSON block
    parts.append(f'<script type="application/json" id="tree-metadata">{json.dumps(metadata)}</script>')

    # Vanilla JS for interactivity
    parts.append("""<script>
(function() {
  var meta = JSON.parse(document.getElementById('tree-metadata').textContent);
  var panel = document.getElementById('detail-panel');

  function showDetail(iri) {
    var d = meta[iri];
    if (!d) return;
    panel.className = 'detail-panel';
    var h = '<div class="detail-title">' + esc(d.label) + '</div>';
    if (d.score > 0) {
      h += '<div class="detail-section"><span class="conf-badge" style="background:' + confColor(d.score) + '28;color:' + confColor(d.score) + ';border-color:' + confColor(d.score) + '70">' + Math.round(d.score) + '</span></div>';
    }
    if (d.branch) {
      h += '<div class="detail-section"><div class="detail-section-label">Branch</div><div class="detail-section-value">' + esc(d.branch) + '</div></div>';
    }
    if (d.iri) {
      h += '<div class="detail-section"><div class="detail-section-label">IRI</div><div class="detail-section-value" style="word-break:break-all;font-family:monospace;font-size:11px">' + esc(d.iri) + '</div></div>';
    }
    if (d.definition) {
      h += '<div class="detail-section"><div class="detail-section-label">Definition</div><div class="detail-section-value">' + esc(d.definition) + '</div></div>';
    }
    if (d.alternative_labels && d.alternative_labels.length) {
      h += '<div class="detail-section"><div class="detail-section-label">Synonyms</div><div class="detail-section-value">';
      d.alternative_labels.forEach(function(a) { h += '<span class="detail-pill" style="background:#f3f4f6;color:#374151">' + esc(a) + '</span>'; });
      h += '</div></div>';
    }
    if (d.translations && Object.keys(d.translations).length) {
      h += '<div class="detail-section"><div class="detail-section-label">Translations</div><div class="detail-section-value">';
      for (var lang in d.translations) { h += '<span class="detail-pill" style="background:#faf5ff;color:#7e22ce">' + esc(lang) + ': ' + esc(d.translations[lang]) + '</span>'; }
      h += '</div></div>';
    }
    if (d.hierarchy_path && d.hierarchy_path.length) {
      h += '<div class="detail-section"><div class="detail-section-label">Hierarchy</div><div class="detail-breadcrumb">';
      d.hierarchy_path.forEach(function(p, i) {
        if (i > 0) h += '<span class="sep">&rsaquo;</span>';
        h += '<span>' + esc(p) + '</span>';
      });
      h += '</div></div>';
    }
    if (d.examples && d.examples.length) {
      h += '<div class="detail-section"><div class="detail-section-label">Examples</div><div class="detail-section-value">';
      d.examples.forEach(function(e) { h += '<div style="font-size:12px;color:#6b7280">' + esc(e) + '</div>'; });
      h += '</div></div>';
    }
    panel.innerHTML = h;
  }

  function confColor(s) {
    if (s >= 90) return '#228B22';
    if (s >= 75) return '#4CAF50';
    if (s >= 60) return '#FF9800';
    if (s >= 45) return '#FF5722';
    return '#9E9E9E';
  }

  function esc(s) { return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : ''; }

  // Intercept summary clicks: only toggle collapse when clicking the triangle
  document.querySelector('.tree-panel').addEventListener('click', function(e) {
    var summary = e.target.closest('summary');
    if (summary) {
      var clickedToggle = e.target.closest('.tree-toggle');
      if (clickedToggle) {
        // Allow native <details> toggle (triangle clicked)
        return;
      }
      // Prevent native toggle — only show detail
      e.preventDefault();
      var iri = summary.getAttribute('data-iri');
      if (iri) showDetail(iri);
    } else {
      // Non-summary element (leaf nodes)
      var el = e.target.closest('[data-iri]');
      if (el) showDetail(el.getAttribute('data-iri'));
    }
  });
})();
</script>""")

    parts.append('</div>')  # tree-section

    return "\n".join(parts)
