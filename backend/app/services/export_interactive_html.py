"""Generate self-contained interactive HTML section for 3-panel input→output mapping view."""

from __future__ import annotations

import html as html_mod
import json

from app.models.export_models import ExportRequest, InputHierarchyNode
from app.services.branch_config import get_branch_color
from app.services.folio_service import build_entity_graph


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


def _build_graph_data(concept_hashes: list[str]) -> dict[str, dict]:
    """Pre-compute mini entity graphs for all unique concepts."""
    graphs: dict[str, dict] = {}
    for h in concept_hashes:
        try:
            result = build_entity_graph(
                h, ancestors_depth=2, descendants_depth=1,
                max_nodes=30, include_see_also=False,
            )
            if result:
                graphs[h] = {
                    "nodes": [
                        {
                            "id": n.id, "label": n.label, "branch": n.branch,
                            "branch_color": n.branch_color, "is_focus": n.is_focus,
                            "is_branch_root": n.is_branch_root, "depth": n.depth,
                        }
                        for n in result.nodes
                    ],
                    "edges": [
                        {"source": e.source, "target": e.target, "edge_type": e.edge_type}
                        for e in result.edges
                    ],
                }
        except Exception:
            pass
    return graphs


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

    # Pre-compute entity graphs for each unique concept
    graph_data = _build_graph_data(list(concept_metadata.keys()))

    input_json = json.dumps(input_data, ensure_ascii=False).replace("</", "<\\/")
    mapping_json = json.dumps(mapping_data, ensure_ascii=False).replace("</", "<\\/")
    metadata_json = json.dumps(concept_metadata, ensure_ascii=False).replace("</", "<\\/")
    graph_json = json.dumps(graph_data, ensure_ascii=False).replace("</", "<\\/")

    return f"""<div id="interactive-section">
<style>
  #interactive-section {{
    display: flex;
    position: relative;
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
    border-left: 1px solid #e5e7eb;
  }}
  .int-right {{
    width: 320px;
    flex-shrink: 0;
    background: #f9fafb;
    border-left: 1px solid #e5e7eb;
    display: flex;
    flex-direction: column;
  }}
  .int-right-top {{
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transition: flex 0.15s;
  }}
  .int-right-top.half {{ flex: 1; }}
  .int-right-top.full {{ flex: 1; }}
  .int-detail-scroll {{
    flex: 1;
    overflow-y: auto;
    padding: 16px;
  }}
  .int-section-bar {{
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #6b7280;
    padding: 6px 16px;
    background: #e5e7eb;
    border-bottom: 1px solid #d1d5db;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }}
  .int-right-bottom {{
    flex: 1;
    display: flex;
    flex-direction: column;
    border-top: 1px solid #e5e7eb;
    overflow: hidden;
  }}
  .int-graph-container {{
    flex: 1;
    overflow: auto;
    padding: 8px;
  }}
  .int-graph-container svg {{
    display: block;
    margin: 0 auto;
  }}
  .int-expand-btn {{
    background: none;
    border: none;
    cursor: pointer;
    color: #9ca3af;
    padding: 2px 4px;
    border-radius: 4px;
    line-height: 1;
  }}
  .int-expand-btn:hover {{
    background: #d1d5db;
    color: #4b5563;
  }}
  .int-graph-modal {{
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0,0,0,0.4);
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
  }}
  .int-graph-modal-inner {{
    width: 96vw;
    height: 94vh;
    background: white;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 25px 50px rgba(0,0,0,0.25);
  }}
  .int-graph-modal-header {{
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 16px;
    border-bottom: 1px solid #e5e7eb;
    background: #f3f4f6;
    flex-shrink: 0;
  }}
  .int-graph-modal-body {{
    flex: 1;
    overflow: auto;
    padding: 16px;
  }}
  .int-graph-modal-body svg {{
    display: block;
    margin: 0 auto;
  }}
  .int-graph-node {{ cursor: pointer; }}
  .int-graph-node:hover rect {{ filter: brightness(0.95); }}
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
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 5;
  }}
</style>

<script id="interactive-input-data" type="application/json">{input_json}</script>
<script id="interactive-mapping-data" type="application/json">{mapping_json}</script>
<script id="interactive-concept-metadata" type="application/json">{metadata_json}</script>
<script id="interactive-graph-data" type="application/json">{graph_json}</script>

<svg class="int-svg-overlay" id="int-svg-overlay"></svg>
<div class="int-left" id="int-left-pane">
  <div class="int-section-title">Input Items</div>
  <div id="int-input-tree"></div>
</div>
<div class="int-gutter" id="int-gutter"></div>
<div class="int-middle" id="int-middle-pane">
  <div class="int-section-title">Mapped FOLIO Concepts</div>
  <div id="int-output-tree">
    <div class="int-placeholder">Select an input item to see its mapped concepts</div>
  </div>
</div>
<div class="int-right">
  <div class="int-right-top full" id="int-right-top">
    <div class="int-section-bar">Concept Details</div>
    <div class="int-detail-scroll" id="int-detail-panel">
      <div class="int-placeholder">Click a concept to see details</div>
    </div>
  </div>
  <div class="int-right-bottom" id="int-graph-section" style="display:none">
    <div class="int-section-bar">
      <span>Entity Graph</span>
      <button class="int-expand-btn" onclick="window._expandGraph()" title="Expand to full screen">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5"/>
        </svg>
      </button>
    </div>
    <div class="int-graph-container" id="int-graph-panel"></div>
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

  function buildTree(concepts) {{
    var roots = [];
    for (var i = 0; i < concepts.length; i++) {{
      var c = concepts[i];
      var segments = (c.hierarchy_path || []).slice(1);
      if (segments.length === 0) continue;
      var siblings = roots;
      for (var s = 0; s < segments.length; s++) {{
        var seg = segments[s];
        var found = null;
        for (var f = 0; f < siblings.length; f++) {{
          if (siblings[f].label === seg) {{ found = siblings[f]; break; }}
        }}
        if (!found) {{
          found = {{ label: seg, concept: null, children: [] }};
          siblings.push(found);
        }}
        if (s === segments.length - 1) found.concept = c;
        siblings = found.children;
      }}
    }}
    return roots;
  }}

  function renderTreeNode(node, depth, parent) {{
    var isMapped = node.concept !== null;
    var hasChildren = node.children.length > 0;
    var el = document.createElement('div');

    if (isMapped) {{
      el.className = 'int-concept';
      el.setAttribute('data-iri', node.concept.iri_hash);
      if (node.concept.iri_hash === selectedConceptIri) el.classList.add('selected');
      el.style.paddingLeft = (depth * 16 + (hasChildren ? 4 : 8)) + 'px';
      el.style.marginLeft = '0';
      el.style.border = 'none';
      el.style.borderRadius = '4px';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.gap = '6px';

      if (hasChildren) {{
        var toggle = document.createElement('button');
        toggle.className = 'int-toggle-btn';
        toggle.textContent = '\\u25BC';
        toggle.style.flexShrink = '0';
        toggle.setAttribute('data-iri-target', node.concept.iri_hash);
        el.appendChild(toggle);
      }} else {{
        var bullet = document.createElement('span');
        bullet.textContent = '\\u25CF';
        bullet.style.fontSize = '11px';
        bullet.style.color = '#d1d5db';
        bullet.style.flexShrink = '0';
        bullet.setAttribute('data-iri-target', node.concept.iri_hash);
        el.appendChild(bullet);
      }}

      var lbl = document.createElement('span');
      lbl.textContent = node.concept.label;
      lbl.style.flex = '1';
      lbl.style.fontWeight = '500';
      lbl.style.overflow = 'hidden';
      lbl.style.textOverflow = 'ellipsis';
      lbl.style.whiteSpace = 'nowrap';
      el.appendChild(lbl);

      var score = document.createElement('span');
      score.className = 'int-concept-score';
      score.textContent = Math.round(node.concept.score) + '%';
      score.style.flexShrink = '0';
      el.appendChild(score);

      (function(iri) {{
        el.onclick = function(e) {{
          if (e.target.tagName === 'BUTTON') return;
          selectedConceptIri = iri;
          highlightConcept();
          renderDetail();
        }};
      }})(node.concept.iri_hash);
    }} else {{
      el.style.paddingLeft = (depth * 16 + 4) + 'px';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.gap = '6px';
      el.style.padding = '4px';
      el.style.paddingLeft = (depth * 16 + 4) + 'px';
      el.style.fontSize = '13px';
      el.style.color = '#6b7280';

      if (hasChildren) {{
        var toggle = document.createElement('button');
        toggle.className = 'int-toggle-btn';
        toggle.textContent = '\\u25BC';
        toggle.style.flexShrink = '0';
        el.appendChild(toggle);
      }}

      var lbl = document.createElement('span');
      lbl.textContent = node.label;
      lbl.style.flex = '1';
      el.appendChild(lbl);
    }}

    parent.appendChild(el);

    if (hasChildren) {{
      var childWrap = document.createElement('div');
      childWrap.style.marginLeft = '8px';
      childWrap.className = 'int-tree-children';
      for (var i = 0; i < node.children.length; i++) {{
        renderTreeNode(node.children[i], depth + 1, childWrap);
      }}
      parent.appendChild(childWrap);

      if (el.querySelector('button')) {{
        el.querySelector('button').onclick = function(e) {{
          e.stopPropagation();
          var hidden = childWrap.style.display === 'none';
          childWrap.style.display = hidden ? '' : 'none';
          this.textContent = hidden ? '\\u25BC' : '\\u25B6';
        }};
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
      header.style.borderLeft = '4px solid ' + color;
      header.innerHTML = '<span class="int-branch-dot" style="background:' + color + '"></span>'
        + '<span class="int-branch-name" style="color:' + color + '">' + escapeHtml(branch) + '</span>'
        + '<span class="int-branch-count">' + branchConcepts.length + ' concept' + (branchConcepts.length !== 1 ? 's' : '') + '</span>';
      container.appendChild(header);

      var treeWrap = document.createElement('div');
      treeWrap.style.marginLeft = '16px';
      treeWrap.style.borderLeft = '1px solid #f3f4f6';
      treeWrap.style.paddingLeft = '4px';
      var tree = buildTree(branchConcepts);
      for (var t = 0; t < tree.length; t++) {{
        renderTreeNode(tree[t], 0, treeWrap);
      }}
      container.appendChild(treeWrap);
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
    renderGraphInline();
  }}

  // --- Entity Graph rendering ---
  var graphData = JSON.parse(document.getElementById('interactive-graph-data').textContent);

  function renderGraphSVG(iriHash, targetEl, scale) {{
    var gd = graphData[iriHash];
    if (!gd || !gd.nodes || gd.nodes.length === 0) {{
      targetEl.innerHTML = '<div class="int-placeholder">No graph data</div>';
      return;
    }}
    var nodes = gd.nodes;
    var edges = gd.edges;
    scale = scale || 1;

    // Group nodes by depth layer
    var layers = {{}};
    for (var i = 0; i < nodes.length; i++) {{
      var d = nodes[i].depth;
      if (!layers[d]) layers[d] = [];
      layers[d].push(nodes[i]);
    }}
    var depths = Object.keys(layers).map(Number).sort(function(a,b) {{ return a - b; }});

    var nodeW = 150 * scale;
    var nodeH = 28 * scale;
    var layerGap = 44 * scale;
    var nodeGap = 12 * scale;
    var padX = 20 * scale;
    var padY = 16 * scale;
    var fs = 11 * scale;
    var radius = 4 * scale;

    // Compute max row width
    var maxRowW = 0;
    for (var di = 0; di < depths.length; di++) {{
      var row = layers[depths[di]];
      var w = row.length * (nodeW + nodeGap) - nodeGap;
      if (w > maxRowW) maxRowW = w;
    }}

    var svgW = maxRowW + padX * 2;
    var svgH = depths.length * (nodeH + layerGap) - layerGap + padY * 2;

    // Position nodes
    var pos = {{}};
    for (var di = 0; di < depths.length; di++) {{
      var row = layers[depths[di]];
      var rowW = row.length * (nodeW + nodeGap) - nodeGap;
      var sx = (svgW - rowW) / 2;
      var y = padY + di * (nodeH + layerGap);
      for (var ni = 0; ni < row.length; ni++) {{
        var nx = sx + ni * (nodeW + nodeGap);
        pos[row[ni].id] = {{ x: nx, y: y, cx: nx + nodeW / 2, cy: y + nodeH / 2 }};
      }}
    }}

    var svg = '<svg width="' + svgW + '" height="' + svgH + '" xmlns="http://www.w3.org/2000/svg">';

    // Edges
    for (var ei = 0; ei < edges.length; ei++) {{
      var e = edges[ei];
      var sp = pos[e.source];
      var tp = pos[e.target];
      if (!sp || !tp) continue;
      var sY = sp.cy + nodeH / 2;
      var tY = tp.cy - nodeH / 2;
      var cpY = (sY + tY) / 2;
      var sc = e.edge_type === 'seeAlso' ? '#8b5cf6' : '#3b82f6';
      var dash = e.edge_type === 'seeAlso' ? ' stroke-dasharray="4,3"' : '';
      svg += '<path d="M' + sp.cx + ',' + sY + ' C' + sp.cx + ',' + cpY + ' ' + tp.cx + ',' + cpY + ' ' + tp.cx + ',' + tY + '" stroke="' + sc + '" stroke-width="' + (1.5 * scale) + '" fill="none" opacity="0.4"' + dash + '/>';
    }}

    // Nodes
    for (var ni = 0; ni < nodes.length; ni++) {{
      var n = nodes[ni];
      var p = pos[n.id];
      if (!p) continue;
      var fill = n.is_focus ? '#eff6ff' : (n.is_branch_root ? '#fef2f2' : '#ffffff');
      var stroke = n.is_focus ? '#60a5fa' : (n.is_branch_root ? '#ef4444' : '#d1d5db');
      var fw = n.is_focus ? 'bold' : 'normal';
      var maxC = Math.floor(nodeW / (fs * 0.62));
      var lbl = n.label.length > maxC ? n.label.substring(0, maxC - 1) + '\u2026' : n.label;

      svg += '<g class="int-graph-node" data-node-id="' + n.id + '">';
      svg += '<rect x="' + p.x + '" y="' + p.y + '" width="' + nodeW + '" height="' + nodeH + '" rx="' + radius + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + (1.5 * scale) + '"/>';
      svg += '<text x="' + p.cx + '" y="' + (p.cy + fs * 0.35) + '" text-anchor="middle" font-size="' + fs + '" font-weight="' + fw + '" fill="#1f2937" font-family="-apple-system,sans-serif">' + escapeHtml(lbl) + '</text>';
      svg += '</g>';
    }}

    svg += '</svg>';
    targetEl.innerHTML = svg;

    // Click handler for graph nodes
    var gnodes = targetEl.querySelectorAll('.int-graph-node');
    for (var gi = 0; gi < gnodes.length; gi++) {{
      (function(g) {{
        g.addEventListener('click', function() {{
          var id = g.getAttribute('data-node-id');
          if (conceptMeta[id]) {{
            selectedConceptIri = id;
            highlightConcept();
            renderDetail();
          }}
        }});
      }})(gnodes[gi]);
    }}
  }}

  function renderGraphInline() {{
    var section = document.getElementById('int-graph-section');
    var topPane = document.getElementById('int-right-top');
    if (!selectedConceptIri || !graphData[selectedConceptIri]) {{
      section.style.display = 'none';
      topPane.className = 'int-right-top full';
      return;
    }}
    section.style.display = '';
    topPane.className = 'int-right-top half';
    var panel = document.getElementById('int-graph-panel');
    renderGraphSVG(selectedConceptIri, panel, 1);
  }}

  window._expandGraph = function() {{
    if (!selectedConceptIri || !graphData[selectedConceptIri]) return;

    var modal = document.createElement('div');
    modal.className = 'int-graph-modal';
    modal.onclick = function(e) {{ if (e.target === modal) modal.remove(); }};

    var inner = document.createElement('div');
    inner.className = 'int-graph-modal-inner';

    var header = document.createElement('div');
    header.className = 'int-graph-modal-header';
    var meta = conceptMeta[selectedConceptIri];
    var title = meta ? meta.label : selectedConceptIri;
    var titleDiv = document.createElement('div');
    titleDiv.style.cssText = 'display:flex;align-items:center;gap:12px';
    titleDiv.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2"><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><line x1="8" y1="7" x2="11" y2="16" stroke-linecap="round"/><line x1="16" y1="7" x2="13" y2="16" stroke-linecap="round"/></svg>'
      + '<span style="font-size:16px;font-weight:600"><span style="color:#9ca3af;font-weight:400">Entity Graph</span><span style="color:#d1d5db;margin:0 8px">|</span><span style="color:#1d4ed8">' + escapeHtml(title) + '</span></span>';
    header.appendChild(titleDiv);

    var closeBtn = document.createElement('button');
    closeBtn.innerHTML = 'Close <kbd style="margin-left:4px;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:4px;padding:2px 6px;font-size:11px;font-family:monospace;color:#6b7280">Esc</kbd>';
    closeBtn.style.cssText = 'padding:6px 12px;border:1px solid #d1d5db;border-radius:8px;background:white;cursor:pointer;font-size:13px;color:#374151;display:flex;align-items:center;gap:4px';
    closeBtn.onmouseover = function() {{ this.style.background = '#f9fafb'; }};
    closeBtn.onmouseout = function() {{ this.style.background = 'white'; }};
    closeBtn.onclick = function() {{ modal.remove(); }};
    header.appendChild(closeBtn);

    var body = document.createElement('div');
    body.className = 'int-graph-modal-body';

    inner.appendChild(header);
    inner.appendChild(body);
    modal.appendChild(inner);
    document.body.appendChild(modal);

    renderGraphSVG(selectedConceptIri, body, 1.6);

    function onKey(e) {{ if (e.key === 'Escape') {{ modal.remove(); document.removeEventListener('keydown', onKey); }} }}
    document.addEventListener('keydown', onKey);
  }};

  function drawLines() {{
    var svg = document.getElementById('int-svg-overlay');
    if (!svg || selectedItemIndex === null) {{
      if (svg) svg.innerHTML = '';
      return;
    }}
    var section = document.getElementById('interactive-section');
    var leftPane = document.getElementById('int-left-pane');
    var middlePane = document.getElementById('int-middle-pane');
    if (!section || !leftPane || !middlePane) return;

    var sectionRect = section.getBoundingClientRect();

    var inputEl = leftPane.querySelector('[data-item-index="' + selectedItemIndex + '"]');
    var outputEls = middlePane.querySelectorAll('[data-iri-target]');

    if (!inputEl || outputEls.length === 0) {{
      svg.innerHTML = '';
      return;
    }}

    var inputElRect = inputEl.getBoundingClientRect();
    var startX = inputElRect.right - sectionRect.left;
    var startY = inputElRect.top + inputElRect.height / 2 - sectionRect.top;

    var paths = '';
    for (var i = 0; i < outputEls.length; i++) {{
      var el = outputEls[i];
      var rect = el.getBoundingClientRect();
      var endX = rect.left - sectionRect.left;
      var endY = rect.top + rect.height / 2 - sectionRect.top;
      var color = '#6b7280';
      var iriHash = el.getAttribute('data-iri-target');
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
