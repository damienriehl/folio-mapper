"""Generate self-contained interactive HTML section for 3-panel input→output mapping view."""

from __future__ import annotations

import html as html_mod
import json

from app.models.export_models import ExportRequest, InputHierarchyNode
from app.services.branch_config import get_branch_color


def _html_escape(s: str) -> str:
    return html_mod.escape(s, quote=True)


def _build_input_tree_json(nodes: list[InputHierarchyNode]) -> list[dict]:
    """Convert InputHierarchyNode list to JSON-serializable dicts."""
    result = []
    for node in nodes:
        result.append({
            "label": node.label,
            "depth": node.depth,
            "item_index": node.item_index,
            "children": _build_input_tree_json(node.children),
        })
    return result


def _build_mapping_data(request: ExportRequest) -> dict[str, list[dict]]:
    """Build {item_index: [{iri_hash, label, branch, score, branch_color, ...}]}."""
    mapping: dict[str, list[dict]] = {}
    for row in request.rows:
        concepts = []
        for concept in row.selected_concepts:
            concepts.append({
                "iri_hash": concept.iri_hash,
                "label": concept.label,
                "branch": concept.branch,
                "score": concept.score,
                "branch_color": get_branch_color(concept.branch),
                "definition": concept.definition or "",
                "alternative_labels": concept.alternative_labels,
                "examples": concept.examples,
                "hierarchy_path": concept.hierarchy_path,
            })
        mapping[str(row.item_index)] = concepts
    return mapping


def generate_interactive_html(request: ExportRequest) -> str:
    """Generate a self-contained HTML section with 3-panel interactive mapping view."""
    input_nodes = request.input_hierarchy or []
    input_data = _build_input_tree_json(input_nodes)
    mapping_data = _build_mapping_data(request)

    # Concept metadata for detail panel
    concept_metadata: dict[str, dict] = {}
    for row in request.rows:
        for concept in row.selected_concepts:
            if concept.iri_hash not in concept_metadata:
                concept_metadata[concept.iri_hash] = {
                    "label": concept.label,
                    "iri": concept.iri,
                    "iri_hash": concept.iri_hash,
                    "branch": concept.branch,
                    "branch_color": get_branch_color(concept.branch),
                    "score": concept.score,
                    "definition": concept.definition or "",
                    "alternative_labels": concept.alternative_labels,
                    "examples": concept.examples,
                    "hierarchy_path": concept.hierarchy_path,
                }

    input_json = json.dumps(input_data, ensure_ascii=False)
    mapping_json = json.dumps(mapping_data, ensure_ascii=False)
    metadata_json = json.dumps(concept_metadata, ensure_ascii=False)

    return f"""<div id="interactive-section">
<style>
  #interactive-section {{
    display: flex;
    height: calc(100vh - 160px);
    min-height: 400px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }}
  .int-left {{
    width: 280px;
    flex-shrink: 0;
    overflow-y: auto;
    background: #f9fafb;
    border-right: 1px solid #e5e7eb;
    padding: 12px;
  }}
  .int-gutter {{
    width: 120px;
    flex-shrink: 0;
  }}
  .int-middle {{
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    position: relative;
    border-left: 1px solid #e5e7eb;
  }}
  .int-right {{
    width: 320px;
    flex-shrink: 0;
    overflow-y: auto;
    background: #f9fafb;
    border-left: 1px solid #e5e7eb;
    padding: 16px;
  }}
  .int-section-title {{
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #6b7280;
    margin-bottom: 8px;
  }}
  .int-input-item {{
    padding: 4px 8px;
    font-size: 13px;
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
  }}
  .int-input-item:hover {{
    background: #f3f4f6;
  }}
  .int-input-item.selected {{
    background: #dbeafe;
    font-weight: 600;
    color: #1e40af;
  }}
  .int-input-header {{
    padding: 4px 8px;
    font-size: 13px;
    font-weight: 500;
    color: #6b7280;
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
  }}
  .int-badge {{
    margin-left: auto;
    font-size: 10px;
    font-weight: 500;
    background: #bfdbfe;
    color: #1d4ed8;
    padding: 1px 6px;
    border-radius: 9999px;
  }}
  .int-branch-header {{
    padding: 4px 8px;
    border-radius: 4px;
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    gap: 8px;
  }}
  .int-branch-dot {{
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }}
  .int-branch-name {{
    font-size: 12px;
    font-weight: 600;
  }}
  .int-branch-count {{
    font-size: 10px;
    color: #9ca3af;
  }}
  .int-concept {{
    margin-left: 16px;
    padding: 8px 12px;
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    margin-bottom: 4px;
    cursor: pointer;
    font-size: 13px;
  }}
  .int-concept:hover {{
    border-color: #d1d5db;
    background: #f9fafb;
  }}
  .int-concept.selected {{
    border-color: #60a5fa;
    background: #eff6ff;
  }}
  .int-concept-label {{
    font-weight: 500;
    color: #1f2937;
    display: flex;
    justify-content: space-between;
  }}
  .int-concept-path {{
    font-size: 11px;
    color: #9ca3af;
    margin-top: 2px;
  }}
  .int-concept-score {{
    font-size: 12px;
    color: #9ca3af;
  }}
  .int-detail-field {{
    margin-bottom: 12px;
  }}
  .int-detail-label {{
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #9ca3af;
  }}
  .int-detail-value {{
    font-size: 12px;
    color: #374151;
    margin-top: 2px;
  }}
  .int-detail-title {{
    font-size: 14px;
    font-weight: 600;
    color: #1f2937;
  }}
  .int-detail-iri {{
    font-size: 11px;
    color: #6b7280;
    margin-top: 2px;
  }}
  .int-placeholder {{
    text-align: center;
    color: #9ca3af;
    font-size: 13px;
    margin-top: 40px;
  }}
  .int-toggle-btn {{
    background: none;
    border: none;
    font-size: 11px;
    color: #9ca3af;
    cursor: pointer;
    padding: 0;
  }}
  .int-svg-overlay {{
    position: absolute;
    top: 0;
    left: -400px;
    width: calc(100% + 400px);
    height: 100%;
    pointer-events: none;
    z-index: 5;
  }}
</style>

<script id="interactive-input-data" type="application/json">{_html_escape(input_json)}</script>
<script id="interactive-mapping-data" type="application/json">{_html_escape(mapping_json)}</script>
<script id="interactive-concept-metadata" type="application/json">{_html_escape(metadata_json)}</script>

<div class="int-left" id="int-left-pane">
  <div class="int-section-title">Input Items</div>
  <div id="int-input-tree"></div>
</div>
<div class="int-gutter" id="int-gutter"></div>
<div class="int-middle" id="int-middle-pane">
  <svg class="int-svg-overlay" id="int-svg-overlay"></svg>
  <div class="int-section-title">Mapped FOLIO Concepts</div>
  <div id="int-output-tree">
    <div class="int-placeholder">Select an input item to see its mapped concepts</div>
  </div>
</div>
<div class="int-right">
  <div class="int-section-title">Concept Details</div>
  <div id="int-detail-panel">
    <div class="int-placeholder">Click a concept to see details</div>
  </div>
</div>

<script>
(function() {{
  var inputData = JSON.parse(document.getElementById('interactive-input-data').textContent);
  var mappingData = JSON.parse(document.getElementById('interactive-mapping-data').textContent);
  var conceptMeta = JSON.parse(document.getElementById('interactive-concept-metadata').textContent);
  var selectedItemIndex = null;
  var selectedConceptIri = null;

  function renderInputTree() {{
    var container = document.getElementById('int-input-tree');
    container.innerHTML = '';
    function renderNode(node, parent) {{
      var isLeaf = node.item_index !== null && node.item_index !== undefined;
      var hasChildren = node.children && node.children.length > 0;
      var wrapper = document.createElement('div');
      wrapper.style.paddingLeft = (node.depth > 0 ? 16 : 0) + 'px';

      var el = document.createElement('div');
      el.className = isLeaf ? 'int-input-item' : 'int-input-header';
      if (isLeaf) el.setAttribute('data-item-index', node.item_index);

      if (hasChildren) {{
        var toggle = document.createElement('button');
        toggle.className = 'int-toggle-btn';
        toggle.textContent = '\\u25BC';
        toggle.onclick = function(e) {{
          e.stopPropagation();
          var childContainer = wrapper.querySelector('.int-children');
          if (childContainer) {{
            var hidden = childContainer.style.display === 'none';
            childContainer.style.display = hidden ? '' : 'none';
            toggle.textContent = hidden ? '\\u25BC' : '\\u25B6';
          }}
        }};
        el.appendChild(toggle);
      }}

      var label = document.createElement('span');
      label.textContent = node.label;
      label.style.overflow = 'hidden';
      label.style.textOverflow = 'ellipsis';
      label.style.whiteSpace = 'nowrap';
      el.appendChild(label);

      if (isLeaf) {{
        var concepts = mappingData[String(node.item_index)] || [];
        if (concepts.length > 0) {{
          var badge = document.createElement('span');
          badge.className = 'int-badge';
          badge.textContent = concepts.length + ' concept' + (concepts.length !== 1 ? 's' : '');
          el.appendChild(badge);
        }}
        el.onclick = function() {{
          selectedItemIndex = node.item_index;
          selectedConceptIri = null;
          highlightSelected();
          renderOutputTree();
          renderDetail();
          drawLines();
        }};
      }}

      wrapper.appendChild(el);

      if (hasChildren) {{
        var childContainer = document.createElement('div');
        childContainer.className = 'int-children';
        for (var i = 0; i < node.children.length; i++) {{
          renderNode(node.children[i], childContainer);
        }}
        wrapper.appendChild(childContainer);
      }}

      parent.appendChild(wrapper);
    }}

    for (var i = 0; i < inputData.length; i++) {{
      renderNode(inputData[i], container);
    }}
  }}

  function highlightSelected() {{
    var items = document.querySelectorAll('.int-input-item');
    for (var i = 0; i < items.length; i++) {{
      var idx = parseInt(items[i].getAttribute('data-item-index'), 10);
      if (idx === selectedItemIndex) {{
        items[i].classList.add('selected');
      }} else {{
        items[i].classList.remove('selected');
      }}
    }}
  }}

  function renderOutputTree() {{
    var container = document.getElementById('int-output-tree');
    if (selectedItemIndex === null) {{
      container.innerHTML = '<div class="int-placeholder">Select an input item to see its mapped concepts</div>';
      return;
    }}
    var concepts = mappingData[String(selectedItemIndex)] || [];
    if (concepts.length === 0) {{
      container.innerHTML = '<div class="int-placeholder">No concepts mapped for this item</div>';
      return;
    }}

    // Group by branch
    var groups = {{}};
    for (var i = 0; i < concepts.length; i++) {{
      var c = concepts[i];
      if (!groups[c.branch]) groups[c.branch] = [];
      groups[c.branch].push(c);
    }}

    container.innerHTML = '';
    var branches = Object.keys(groups);
    for (var b = 0; b < branches.length; b++) {{
      var branch = branches[b];
      var branchConcepts = groups[branch];
      var color = branchConcepts[0].branch_color || '#6b7280';

      var header = document.createElement('div');
      header.className = 'int-branch-header';
      header.style.backgroundColor = color + '15';
      header.innerHTML = '<span class="int-branch-dot" style="background:' + color + '"></span>'
        + '<span class="int-branch-name" style="color:' + color + '">' + escapeHtml(branch) + '</span>'
        + '<span class="int-branch-count">' + branchConcepts.length + ' concept' + (branchConcepts.length !== 1 ? 's' : '') + '</span>';
      container.appendChild(header);

      for (var j = 0; j < branchConcepts.length; j++) {{
        var concept = branchConcepts[j];
        var el = document.createElement('div');
        el.className = 'int-concept';
        el.setAttribute('data-iri', concept.iri_hash);
        if (concept.iri_hash === selectedConceptIri) el.classList.add('selected');

        var pathStr = '';
        if (concept.hierarchy_path && concept.hierarchy_path.length > 0) {{
          pathStr = concept.hierarchy_path.join(' &gt; ');
        }}

        el.innerHTML = '<div class="int-concept-label"><span>' + escapeHtml(concept.label) + '</span><span class="int-concept-score">' + Math.round(concept.score) + '%</span></div>'
          + (pathStr ? '<div class="int-concept-path">' + pathStr + '</div>' : '');

        (function(iri) {{
          el.onclick = function() {{
            selectedConceptIri = iri;
            highlightConcept();
            renderDetail();
          }};
        }})(concept.iri_hash);

        container.appendChild(el);
      }}
    }}
  }}

  function highlightConcept() {{
    var items = document.querySelectorAll('.int-concept');
    for (var i = 0; i < items.length; i++) {{
      if (items[i].getAttribute('data-iri') === selectedConceptIri) {{
        items[i].classList.add('selected');
      }} else {{
        items[i].classList.remove('selected');
      }}
    }}
  }}

  function renderDetail() {{
    var container = document.getElementById('int-detail-panel');
    if (!selectedConceptIri || !conceptMeta[selectedConceptIri]) {{
      container.innerHTML = '<div class="int-placeholder">Click a concept to see details</div>';
      return;
    }}
    var c = conceptMeta[selectedConceptIri];
    var html = '<div class="int-detail-field"><div class="int-detail-title">' + escapeHtml(c.label) + '</div>'
      + '<div class="int-detail-iri">' + escapeHtml(c.iri_hash) + '</div></div>';

    if (c.definition) {{
      html += '<div class="int-detail-field"><div class="int-detail-label">Definition</div>'
        + '<div class="int-detail-value">' + escapeHtml(c.definition) + '</div></div>';
    }}
    if (c.alternative_labels && c.alternative_labels.length > 0) {{
      html += '<div class="int-detail-field"><div class="int-detail-label">Synonyms</div>'
        + '<div class="int-detail-value">' + escapeHtml(c.alternative_labels.join(', ')) + '</div></div>';
    }}
    if (c.hierarchy_path && c.hierarchy_path.length > 0) {{
      html += '<div class="int-detail-field"><div class="int-detail-label">Hierarchy</div>'
        + '<div class="int-detail-value">' + escapeHtml(c.hierarchy_path.join(' > ')) + '</div></div>';
    }}
    if (c.examples && c.examples.length > 0) {{
      html += '<div class="int-detail-field"><div class="int-detail-label">Examples</div>'
        + '<div class="int-detail-value">' + escapeHtml(c.examples.join(', ')) + '</div></div>';
    }}
    html += '<div class="int-detail-field"><div class="int-detail-label">Branch</div>'
      + '<div class="int-detail-value" style="display:flex;align-items:center;gap:6px">'
      + '<span class="int-branch-dot" style="background:' + (c.branch_color || '#6b7280') + '"></span>'
      + escapeHtml(c.branch) + '</div></div>';
    html += '<div class="int-detail-field"><div class="int-detail-label">Confidence</div>'
      + '<div class="int-detail-value">' + Math.round(c.score) + '%</div></div>';

    container.innerHTML = html;
  }}

  function drawLines() {{
    var svg = document.getElementById('int-svg-overlay');
    if (!svg || selectedItemIndex === null) {{
      if (svg) svg.innerHTML = '';
      return;
    }}
    var middlePane = document.getElementById('int-middle-pane');
    var leftPane = document.getElementById('int-left-pane');
    if (!middlePane || !leftPane) return;

    var middleRect = middlePane.getBoundingClientRect();
    var leftRect = leftPane.getBoundingClientRect();

    var inputEl = leftPane.querySelector('[data-item-index="' + selectedItemIndex + '"]');
    var outputEls = middlePane.querySelectorAll('[data-iri]');

    if (!inputEl || outputEls.length === 0) {{
      svg.innerHTML = '';
      return;
    }}

    var inputElRect = inputEl.getBoundingClientRect();
    var startX = inputElRect.right - leftRect.left;
    var startY = inputElRect.top + inputElRect.height / 2 - middleRect.top;

    var paths = '';
    for (var i = 0; i < outputEls.length; i++) {{
      var el = outputEls[i];
      var rect = el.getBoundingClientRect();
      var endX = rect.left - leftRect.left;
      var endY = rect.top + rect.height / 2 - middleRect.top;
      var color = '#6b7280';
      var iriHash = el.getAttribute('data-iri');
      if (iriHash && conceptMeta[iriHash]) {{
        color = conceptMeta[iriHash].branch_color || color;
      }}
      var cp1x = startX + (endX - startX) * 0.4;
      var cp2x = startX + (endX - startX) * 0.6;
      paths += '<path d="M' + startX + ',' + startY + ' C' + cp1x + ',' + startY + ' ' + cp2x + ',' + endY + ' ' + endX + ',' + endY + '" stroke="' + color + '" stroke-width="1.5" fill="none" opacity="0.5"/>';
    }}
    svg.innerHTML = paths;
  }}

  function escapeHtml(s) {{
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }}

  // Redraw lines on scroll
  var raf;
  function onScroll() {{
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(drawLines);
  }}
  document.getElementById('int-left-pane').addEventListener('scroll', onScroll);
  document.getElementById('int-middle-pane').addEventListener('scroll', onScroll);

  // Initial render
  renderInputTree();
}})();
</script>
</div>"""
