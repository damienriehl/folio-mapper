"""Core FOLIO integration: singleton loader, candidate search, branch detection."""

from __future__ import annotations

import asyncio
import logging
import re
import threading
from functools import lru_cache

from folio import FOLIO, FOLIO_TYPE_IRIS, FOLIOTypes

from app.models.graph_models import EntityGraphResponse, GraphEdge, GraphNode
from app.models.mapping_models import (
    BranchGroup,
    BranchInfo,
    ConceptDetail,
    FolioCandidate,
    FolioStatus,
    HierarchyPathEntry,
    ItemMappingResult,
)
from app.models.parse_models import ParseItem
from app.services.branch_config import BRANCH_CONFIG, EXCLUDED_BRANCHES, get_branch_color, get_branch_display_name

logger = logging.getLogger(__name__)

# Words too common to be useful for individual search or scoring
SEARCH_STOPWORDS = frozenset({
    "a", "an", "the", "of", "and", "or", "in", "for", "to", "with", "by", "on", "at",
    "is", "are", "was", "were", "be", "been", "being",
    "not", "no", "has", "have", "had", "do", "does", "did",
    "this", "that", "it", "its", "their", "other", "such", "than",
    "law", "legal", "type", "types", "general",
})

# Domain-aware expansions: common legal content words → FOLIO label suffixes.
# When a content word matches a key, we also search compound phrases like
# "litigation practice" and re-score candidates against those expansions.
LEGAL_TERM_EXPANSIONS: dict[str, list[str]] = {
    # Core practice types
    "litigation": ["practice", "service"],
    "transactional": ["practice", "service"],
    "transaction": ["practice", "service"],
    "transactions": ["practice", "service"],
    "regulatory": ["practice", "compliance"],
    "compliance": ["practice", "service"],
    "advisory": ["practice", "service"],
    # Dispute resolution
    "dispute": ["service", "resolution"],
    "disputes": ["service", "resolution"],
    "mediation": ["service"],
    "arbitration": ["service"],
    "negotiation": ["service"],
    "settlement": ["service", "practice"],
    "appellate": ["practice", "service"],
    "trial": ["practice", "service"],
    "appeals": ["practice", "service"],
    # Enforcement & prosecution
    "prosecution": ["service"],
    "enforcement": ["service", "action"],
    "investigation": ["service"],
    # Practice areas
    "corporate": ["practice", "service", "law"],
    "employment": ["practice", "service", "law"],
    "intellectual": ["property", "practice"],
    "bankruptcy": ["practice", "service", "law"],
    "family": ["practice", "law"],
    "immigration": ["practice", "service", "law"],
    "environmental": ["practice", "law", "compliance"],
    "antitrust": ["practice", "law", "compliance"],
    "tax": ["practice", "service", "law"],
    "real": ["estate", "property"],
    "estate": ["planning", "practice", "law"],
    # Advisory & counseling
    "counsel": ["service", "practice"],
    "counseling": ["service", "practice"],
    "consulting": ["service", "practice"],
    # Recovery & collections
    "collection": ["service", "practice"],
    "recovery": ["service", "practice"],
    "foreclosure": ["service", "practice"],
    # Investigation & due diligence
    "discovery": ["service", "practice"],
    "diligence": ["service", "practice"],
    "audit": ["service", "practice"],
    # Documentation & filing
    "drafting": ["service", "practice"],
    "documentation": ["service", "practice"],
    "filing": ["service", "practice"],
    # Strategy & planning
    "strategy": ["service", "practice"],
    "planning": ["service", "practice"],
    "risk": ["service", "management"],
    "structuring": ["service", "practice"],
}

# Module-level singleton
_folio_instance: FOLIO | None = None
_folio_lock = threading.Lock()
_folio_loading = False
_folio_error: str | None = None

# IRI hash -> branch display name cache
_branch_cache: dict[str, str] = {}

# Branch root IRI hashes (set after FOLIO loads)
_branch_root_iris: dict[str, str] = {}  # iri_hash -> branch display name


def _extract_iri_hash(iri: str) -> str:
    """Extract the hash portion from a full FOLIO IRI."""
    return iri.rsplit("/", 1)[-1]


def _init_branch_roots() -> None:
    """Build the mapping of branch root IRI hashes to display names.

    Uses FOLIO_TYPE_IRIS as the primary source, then discovers any additional
    root classes (sub_class_of = owl:Thing) not in the enum.
    """
    global _branch_root_iris
    _branch_root_iris.clear()

    # Primary: from the library's enum
    for ft, iri_hash in FOLIO_TYPE_IRIS.items():
        display_name = get_branch_display_name(ft.name)
        _branch_root_iris[iri_hash] = display_name

    # Secondary: discover any additional root classes from the ontology
    # (classes whose sub_class_of is owl:Thing but not in FOLIO_TYPE_IRIS)
    if _folio_instance:
        owl_thing = "http://www.w3.org/2002/07/owl#Thing"
        for owl_class in _folio_instance.classes:
            iri_hash = _extract_iri_hash(owl_class.iri)
            if iri_hash in _branch_root_iris:
                continue
            if owl_class.sub_class_of and owl_class.sub_class_of == [owl_thing]:
                label = owl_class.label or iri_hash
                _branch_root_iris[iri_hash] = label
                logger.info("Discovered additional branch root: %s (%s)", label, iri_hash)


def get_folio() -> FOLIO:
    """Get the cached FOLIO singleton. Loads from GitHub on first call."""
    global _folio_instance, _folio_loading, _folio_error
    if _folio_instance is not None:
        return _folio_instance

    with _folio_lock:
        if _folio_instance is not None:
            return _folio_instance

        _folio_loading = True
        _folio_error = None
        try:
            logger.info("Loading FOLIO ontology from GitHub...")
            _folio_instance = FOLIO()
            _init_branch_roots()
            logger.info("FOLIO ontology loaded: %d classes", len(_folio_instance.classes))
            return _folio_instance
        except Exception as e:
            _folio_error = str(e)
            logger.error("Failed to load FOLIO: %s", e)
            raise
        finally:
            _folio_loading = False


def get_folio_status() -> FolioStatus:
    """Return whether FOLIO is loaded and basic stats."""
    return FolioStatus(
        loaded=_folio_instance is not None,
        concept_count=len(_folio_instance.classes) if _folio_instance else 0,
        loading=_folio_loading,
        error=_folio_error,
    )


async def warmup_folio() -> FolioStatus:
    """Trigger FOLIO loading in background thread. Returns current status."""
    loop = asyncio.get_event_loop()
    try:
        await loop.run_in_executor(None, get_folio)
    except Exception:
        pass  # Error captured in _folio_error
    return get_folio_status()


def get_branch_for_class(folio: FOLIO, iri_hash: str) -> str:
    """Walk parent chain to find which branch a class belongs to. Cached."""
    if iri_hash in _branch_cache:
        return _branch_cache[iri_hash]

    # Check if this IS a branch root
    if iri_hash in _branch_root_iris:
        _branch_cache[iri_hash] = _branch_root_iris[iri_hash]
        return _branch_root_iris[iri_hash]

    owl_class = folio[iri_hash]
    if not owl_class or not owl_class.sub_class_of:
        _branch_cache[iri_hash] = "Unknown"
        return "Unknown"

    # Walk up the parent chain (max 20 levels to avoid infinite loops)
    visited: set[str] = {iri_hash}
    current_parents = owl_class.sub_class_of

    for _ in range(20):
        if not current_parents:
            break

        next_parents: list[str] = []
        for parent_iri in current_parents:
            parent_hash = _extract_iri_hash(parent_iri)
            if parent_hash in visited:
                continue
            visited.add(parent_hash)

            if parent_hash in _branch_root_iris:
                branch_name = _branch_root_iris[parent_hash]
                _branch_cache[iri_hash] = branch_name
                return branch_name

            parent_class = folio[parent_hash]
            if parent_class and parent_class.sub_class_of:
                next_parents.extend(parent_class.sub_class_of)

        current_parents = next_parents

    _branch_cache[iri_hash] = "Unknown"
    return "Unknown"


def _build_hierarchy_path(folio: FOLIO, iri_hash: str) -> list[HierarchyPathEntry]:
    """Build hierarchy path from root branch down to this class."""
    path: list[HierarchyPathEntry] = []
    owl_class = folio[iri_hash]
    if not owl_class:
        return path

    current = owl_class
    visited: set[str] = set()
    while current and len(path) < 10:
        current_hash = _extract_iri_hash(current.iri)
        if current_hash in visited:
            break
        visited.add(current_hash)
        path.append(HierarchyPathEntry(
            label=current.label or current_hash,
            iri_hash=current_hash,
        ))

        if current_hash in _branch_root_iris:
            break

        if current.sub_class_of:
            parent_hash = _extract_iri_hash(current.sub_class_of[0])
            current = folio[parent_hash]
        else:
            break

    path.reverse()
    return path


def _get_all_parents(folio: FOLIO, iri_hash: str) -> list[HierarchyPathEntry]:
    """Return all immediate parents of a class (for polyhierarchy DAG display)."""
    owl_class = folio[iri_hash]
    if not owl_class or not owl_class.sub_class_of:
        return []

    owl_thing = "http://www.w3.org/2002/07/owl#Thing"
    parents: list[HierarchyPathEntry] = []
    for parent_iri in owl_class.sub_class_of:
        if parent_iri == owl_thing:
            continue
        parent_hash = _extract_iri_hash(parent_iri)
        parent_class = folio[parent_hash]
        if parent_class:
            parents.append(HierarchyPathEntry(
                label=parent_class.label or parent_hash,
                iri_hash=parent_hash,
            ))
    parents.sort(key=lambda e: e.label)
    return parents


def _tokenize(text: str) -> list[str]:
    """Split text into lowercase alphabetic tokens (2+ chars)."""
    return [w.lower() for w in re.findall(r"[a-zA-Z]+", text) if len(w) >= 2]


def _content_words(text: str) -> set[str]:
    """Extract meaningful (non-stopword) words from text."""
    return {w for w in _tokenize(text) if w not in SEARCH_STOPWORDS}


def _word_overlap(query_words: set[str], target_words: set[str]) -> float:
    """Bidirectional word overlap with prefix-match credit.

    Computes both forward (query→target) and reverse (target→query) overlap.
    Reverse overlap helps multi-concept queries (e.g. "Small Business Formation
    (LLC / Corp)") match narrower targets (e.g. "Business Organizations Law")
    where only a fraction of query words match but a large fraction of the
    target's words are covered.
    """
    if not query_words or not target_words:
        return 0.0

    def _directional_overlap(source: set[str], dest: set[str]) -> float:
        matched = 0.0
        for sw in source:
            best = 0.0
            for dw in dest:
                if sw == dw:
                    best = 1.0
                    break
                elif len(sw) >= 3 and len(dw) >= 3:
                    if sw.startswith(dw) or dw.startswith(sw):
                        best = max(best, 0.8)
                    elif len(sw) >= 5 and len(dw) >= 5:
                        # Common-stem credit for morphological variants
                        # e.g., "defense"/"defendant" share prefix "defen"
                        pfx = 0
                        for c1, c2 in zip(sw, dw):
                            if c1 == c2:
                                pfx += 1
                            else:
                                break
                        if pfx >= 4 and pfx / min(len(sw), len(dw)) >= 0.7:
                            best = max(best, 0.7)
            matched += best
        return matched / len(source)

    forward = _directional_overlap(query_words, target_words)

    # Reverse overlap: what fraction of the target's words appear in the query.
    # Only applied when the target has 2+ content words to avoid inflating
    # single-word labels. Discounted by 0.75 since reverse is a weaker signal.
    reverse = 0.0
    if len(target_words) >= 2:
        reverse = _directional_overlap(target_words, query_words) * 0.75

    return max(forward, reverse)


def _compute_relevance_score(
    query_content: set[str],
    query_full: str,
    label: str,
    definition: str | None,
    synonyms: list[str],
) -> float:
    """Score 0-100 based on word overlap between query and candidate."""
    if not label:
        return 0.0

    query_lower = query_full.lower().strip()
    label_lower = label.lower()

    # Exact match
    if query_lower == label_lower:
        return 99.0

    label_content = _content_words(label)

    # --- Label scoring ---
    label_score = 0.0
    # Full query contained in label (e.g. "Dog Bite" in "Dog Bite Strict Liability")
    if len(query_lower) >= 4 and query_lower in label_lower:
        label_score = 92.0
    # Label contained in query, but only for substantial labels (not abbreviations)
    elif (
        len(label_lower) >= 4
        and label_lower in query_lower
        and len(label_lower) / len(query_lower) > 0.3
    ):
        label_score = 88.0
    overlap = _word_overlap(query_content, label_content)
    if overlap > 0:
        label_score = max(label_score, overlap * 88)

    # --- Synonym scoring (word overlap only, no raw substring matching) ---
    syn_score = 0.0
    for syn in synonyms:
        syn_content = _content_words(syn)
        s_overlap = _word_overlap(query_content, syn_content)
        if s_overlap > 0:
            syn_score = max(syn_score, s_overlap * 82)

    # --- Definition scoring ---
    def_score = 0.0
    if definition:
        def_lower = definition.lower()
        if query_lower in def_lower:
            def_score = 60.0
        def_content = _content_words(definition)
        d_overlap = _word_overlap(query_content, def_content)
        if d_overlap > 0:
            def_score = max(def_score, d_overlap * 55)

    # Combine: best of label/synonym, with small definition boost
    primary = max(label_score, syn_score)
    if primary > 0:
        final = primary + min(def_score * 0.12, 8)
    else:
        final = def_score

    return round(min(final, 99.0), 1)


def _generate_search_terms(term: str) -> list[str]:
    """Generate search terms: full phrase, sub-phrases, individual content words."""
    words = _tokenize(term)
    content = _content_words(term)

    terms = [term]  # Always search full phrase

    # Sub-phrases (windows of 2..n-1 consecutive words)
    if len(words) >= 3:
        for n in range(len(words) - 1, 1, -1):
            for i in range(len(words) - n + 1):
                sub = " ".join(words[i : i + n])
                if _content_words(sub):  # Has at least one content word
                    terms.append(sub)

    # Individual content words (3+ chars to catch abbreviations like LLC, LLP, LTD)
    for w in sorted(content, key=len, reverse=True):
        if len(w) >= 3:
            terms.append(w)

    # Domain-aware expansions: "litigation" → "litigation practice", "litigation service"
    for w in content:
        suffixes = LEGAL_TERM_EXPANSIONS.get(w)
        if suffixes:
            for suffix in suffixes:
                terms.append(f"{w} {suffix}")

    # Deduplicate preserving order
    seen: set[str] = set()
    result: list[str] = []
    for t in terms:
        tl = t.lower()
        if tl not in seen:
            seen.add(tl)
            result.append(t)

    return result


def lookup_concept(iri_hash: str) -> FolioCandidate | None:
    """Look up a single FOLIO concept by IRI hash and return full details."""
    folio = get_folio()
    owl_class = folio[iri_hash]
    if not owl_class:
        return None

    branch_name = get_branch_for_class(folio, iri_hash)

    return FolioCandidate(
        label=owl_class.label or iri_hash,
        iri=owl_class.iri,
        iri_hash=iri_hash,
        definition=owl_class.definition,
        synonyms=owl_class.alternative_labels or [],
        branch=branch_name,
        branch_color=get_branch_color(branch_name),
        hierarchy_path=_build_hierarchy_path(folio, iri_hash),
        score=-1,
    )


def lookup_concept_detail(iri_hash: str) -> ConceptDetail | None:
    """Look up a FOLIO concept with extended detail: children, siblings, related, examples, translations."""
    folio = get_folio()
    owl_class = folio[iri_hash]
    if not owl_class:
        return None

    branch_name = get_branch_for_class(folio, iri_hash)

    # Children: classes where this concept is the parent
    children: list[HierarchyPathEntry] = []
    if owl_class.parent_class_of:
        for child_iri in owl_class.parent_class_of:
            child_hash = _extract_iri_hash(child_iri)
            child_class = folio[child_hash]
            if child_class:
                children.append(HierarchyPathEntry(
                    label=child_class.label or child_hash,
                    iri_hash=child_hash,
                ))
    children.sort(key=lambda e: e.label)

    # Siblings: other children of this concept's first parent (excluding self)
    siblings: list[HierarchyPathEntry] = []
    if owl_class.sub_class_of:
        parent_hash = _extract_iri_hash(owl_class.sub_class_of[0])
        parent_class = folio[parent_hash]
        if parent_class and parent_class.parent_class_of:
            for sibling_iri in parent_class.parent_class_of:
                sibling_hash = _extract_iri_hash(sibling_iri)
                if sibling_hash == iri_hash:
                    continue
                sibling_class = folio[sibling_hash]
                if sibling_class:
                    siblings.append(HierarchyPathEntry(
                        label=sibling_class.label or sibling_hash,
                        iri_hash=sibling_hash,
                    ))
    siblings.sort(key=lambda e: e.label)

    # Related: see_also links
    related: list[HierarchyPathEntry] = []
    if hasattr(owl_class, 'see_also') and owl_class.see_also:
        for related_iri in owl_class.see_also:
            related_hash = _extract_iri_hash(related_iri)
            related_class = folio[related_hash]
            if related_class:
                related.append(HierarchyPathEntry(
                    label=related_class.label or related_hash,
                    iri_hash=related_hash,
                ))
    related.sort(key=lambda e: e.label)

    # Examples and translations
    examples = list(owl_class.examples) if hasattr(owl_class, 'examples') and owl_class.examples else []
    translations = dict(owl_class.translations) if hasattr(owl_class, 'translations') and owl_class.translations else {}

    return ConceptDetail(
        label=owl_class.label or iri_hash,
        iri=owl_class.iri,
        iri_hash=iri_hash,
        definition=owl_class.definition,
        synonyms=owl_class.alternative_labels or [],
        branch=branch_name,
        branch_color=get_branch_color(branch_name),
        hierarchy_path=_build_hierarchy_path(folio, iri_hash),
        score=-1,
        all_parents=_get_all_parents(folio, iri_hash),
        children=children,
        siblings=siblings,
        related=related,
        examples=examples,
        translations=translations,
    )


def build_entity_graph(
    iri_hash: str,
    ancestors_depth: int = 2,
    descendants_depth: int = 2,
    max_nodes: int = 200,
    include_see_also: bool = True,
    max_see_also_per_node: int = 5,
) -> EntityGraphResponse | None:
    """Build a multi-hop graph around a FOLIO concept via BFS."""
    folio = get_folio()
    owl_class = folio[iri_hash]
    if not owl_class:
        return None

    owl_thing = "http://www.w3.org/2002/07/owl#Thing"
    visited: dict[str, GraphNode] = {}
    edges: list[GraphEdge] = {}
    edge_ids: set[str] = set()
    total_discovered = 0

    def _make_node(h: str, depth: int) -> GraphNode | None:
        if h in visited:
            return visited[h]
        oc = folio[h]
        if not oc:
            return None
        total_discovered_ref[0] += 1
        if len(visited) >= max_nodes:
            return None
        branch_name = get_branch_for_class(folio, h)
        node = GraphNode(
            id=h,
            label=oc.label or h,
            iri=oc.iri,
            definition=oc.definition,
            branch=branch_name,
            branch_color=get_branch_color(branch_name),
            is_focus=(h == iri_hash),
            is_branch_root=(h in _branch_root_iris),
            depth=depth,
        )
        visited[h] = node
        return node

    def _add_edge(source: str, target: str, edge_type: str, label: str | None = None) -> None:
        eid = f"{source}->{target}:{edge_type}"
        if eid in edge_ids:
            return
        edge_ids.add(eid)
        edges.append(GraphEdge(id=eid, source=source, target=target, edge_type=edge_type, label=label))

    # Mutable counter for total discovered (including beyond max_nodes)
    total_discovered_ref = [0]
    edges = []

    # Create focus node
    focus_node = _make_node(iri_hash, 0)
    if not focus_node:
        return None

    # BFS upward (ancestors): child -> parent edges become parent -> child in subClassOf direction
    ancestor_queue: list[tuple[str, int]] = [(iri_hash, 0)]
    ancestor_visited: set[str] = {iri_hash}
    while ancestor_queue:
        current_hash, current_depth = ancestor_queue.pop(0)
        if current_depth >= ancestors_depth:
            continue
        current_oc = folio[current_hash]
        if not current_oc or not current_oc.sub_class_of:
            continue
        for parent_iri in current_oc.sub_class_of:
            if parent_iri == owl_thing:
                continue
            parent_hash = _extract_iri_hash(parent_iri)
            parent_node = _make_node(parent_hash, -(current_depth + 1))
            if parent_node is None:
                continue
            # Edge: parent --subClassOf--> child (parent is superclass)
            _add_edge(parent_hash, current_hash, "subClassOf")
            if parent_hash not in ancestor_visited:
                ancestor_visited.add(parent_hash)
                ancestor_queue.append((parent_hash, current_depth + 1))

    # BFS downward (descendants)
    descendant_queue: list[tuple[str, int]] = [(iri_hash, 0)]
    descendant_visited: set[str] = {iri_hash}
    while descendant_queue:
        current_hash, current_depth = descendant_queue.pop(0)
        if current_depth >= descendants_depth:
            continue
        current_oc = folio[current_hash]
        if not current_oc or not current_oc.parent_class_of:
            continue
        for child_iri in current_oc.parent_class_of:
            child_hash = _extract_iri_hash(child_iri)
            child_node = _make_node(child_hash, current_depth + 1)
            if child_node is None:
                continue
            _add_edge(current_hash, child_hash, "subClassOf")
            if child_hash not in descendant_visited:
                descendant_visited.add(child_hash)
                descendant_queue.append((child_hash, current_depth + 1))

    # Collect rdfs:seeAlso cross-links for all visited nodes
    see_also_nodes: list[str] = []
    if include_see_also:
        for node_hash in list(visited.keys()):
            oc = folio[node_hash]
            if not oc or not hasattr(oc, "see_also") or not oc.see_also:
                continue
            sa_count = 0
            for related_iri in oc.see_also:
                if sa_count >= max_see_also_per_node:
                    break
                related_hash = _extract_iri_hash(related_iri)
                # Only add seeAlso edges between nodes already in the graph,
                # or create the target node if we have room
                was_new = related_hash not in visited
                if was_new:
                    related_node = _make_node(related_hash, 0)
                    if related_node is None:
                        continue
                    see_also_nodes.append(related_hash)
                # Deduplicate bidirectional: use sorted pair
                if node_hash < related_hash:
                    _add_edge(node_hash, related_hash, "seeAlso", "rdfs:seeAlso")
                else:
                    _add_edge(related_hash, node_hash, "seeAlso", "rdfs:seeAlso")
                sa_count += 1

    # BFS upward from seeAlso nodes to their branch roots
    if see_also_nodes:
        sa_ancestor_queue: list[tuple[str, int]] = [(h, 0) for h in see_also_nodes]
        sa_ancestor_visited: set[str] = set(see_also_nodes) | ancestor_visited
        while sa_ancestor_queue:
            current_hash, current_depth = sa_ancestor_queue.pop(0)
            if current_depth >= ancestors_depth:
                continue
            current_oc = folio[current_hash]
            if not current_oc or not current_oc.sub_class_of:
                continue
            for parent_iri in current_oc.sub_class_of:
                if parent_iri == owl_thing:
                    continue
                parent_hash = _extract_iri_hash(parent_iri)
                parent_node = _make_node(parent_hash, -(current_depth + 1))
                if parent_node is None:
                    continue
                _add_edge(parent_hash, current_hash, "subClassOf")
                if parent_hash not in sa_ancestor_visited:
                    sa_ancestor_visited.add(parent_hash)
                    sa_ancestor_queue.append((parent_hash, current_depth + 1))

    truncated = total_discovered_ref[0] > len(visited)

    return EntityGraphResponse(
        focus_iri_hash=iri_hash,
        focus_label=owl_class.label or iri_hash,
        focus_branch=get_branch_for_class(folio, iri_hash),
        nodes=list(visited.values()),
        edges=edges,
        truncated=truncated,
        total_concept_count=total_discovered_ref[0],
    )


def search_candidates(
    term: str,
    threshold: float = 0.3,
    max_per_branch: int = 10,
    use_bridging: bool = False,
) -> list[FolioCandidate]:
    """Search FOLIO for candidates matching the given term.

    Uses multi-strategy search (label, prefix, definition) across the full
    phrase, sub-phrases, and individual content words, then re-scores based
    on actual word overlap rather than raw fuzzy-match scores.
    """
    folio = get_folio()

    content_words = _content_words(term)
    if not content_words:
        # All words are stopwords; fall back to using all words
        content_words = set(_tokenize(term))

    search_terms = _generate_search_terms(term)

    # Phase 1: Gather raw candidates from multiple search strategies
    raw: dict[str, object] = {}  # iri_hash -> OWLClass (deduped)

    for st in search_terms:
        # Label search (fuzzy)
        for owl_class, _ in folio.search_by_label(st, include_alt_labels=True, limit=25):
            h = _extract_iri_hash(owl_class.iri)
            if h not in raw:
                raw[h] = owl_class

        # Prefix search (exact prefix)
        if len(st) >= 3:
            for owl_class in folio.search_by_prefix(st):
                h = _extract_iri_hash(owl_class.iri)
                if h not in raw:
                    raw[h] = owl_class

    # Stem prefix search: discover morphological variants by truncating content
    # words to their likely stem.  e.g., "defense" → prefix "defen" finds "Defendant"
    for cw in content_words:
        if len(cw) >= 6:
            stem = cw[: len(cw) - 2]
            for owl_class in folio.search_by_prefix(stem)[:50]:
                h = _extract_iri_hash(owl_class.iri)
                if h not in raw:
                    raw[h] = owl_class

    # Definition search (catches concepts that mention the term in their definition)
    def_terms = [term]
    cw_phrase = " ".join(sorted(content_words))
    if cw_phrase.lower() != term.lower():
        def_terms.append(cw_phrase)
    for st in def_terms:
        if len(st) >= 3:
            for owl_class, _ in folio.search_by_definition(st, limit=20):
                h = _extract_iri_hash(owl_class.iri)
                if h not in raw:
                    raw[h] = owl_class

    logger.debug("search_candidates(%r): %d raw candidates from search", term, len(raw))

    # Phase 2: Re-score all candidates using word-overlap scoring
    min_score = threshold * 100
    scored: list[tuple[str, object, float]] = []

    for iri_hash, owl_class in raw.items():
        score = _compute_relevance_score(
            content_words,
            term,
            owl_class.label or iri_hash,
            owl_class.definition,
            owl_class.alternative_labels or [],
        )
        if score >= min_score:
            scored.append((iri_hash, owl_class, score))

    # Phase 2.1: Expansion re-scoring — re-score candidates against expanded
    # queries (e.g. "litigation practice") so that exact-match labels aren't
    # crowded out by partial-overlap scores against the original query.
    expansion_queries: list[tuple[set[str], str]] = []
    for w in content_words:
        suffixes = LEGAL_TERM_EXPANSIONS.get(w)
        if suffixes:
            for suffix in suffixes:
                eq = f"{w} {suffix}"
                expansion_queries.append((_content_words(eq), eq))

    if expansion_queries:
        best_scores: dict[str, float] = {h: s for h, _, s in scored}
        # Also re-score candidates that were below threshold against original
        for iri_hash, owl_class in raw.items():
            for eq_content, eq_full in expansion_queries:
                exp_score = _compute_relevance_score(
                    eq_content,
                    eq_full,
                    owl_class.label or iri_hash,
                    owl_class.definition,
                    owl_class.alternative_labels or [],
                )
                if exp_score >= min_score and exp_score > best_scores.get(iri_hash, 0):
                    best_scores[iri_hash] = exp_score

        # Rebuild scored list with best scores
        scored_map: dict[str, tuple[str, object, float]] = {
            h: (h, c, s) for h, c, s in scored
        }
        for iri_hash, new_score in best_scores.items():
            if iri_hash in scored_map:
                _, owl_class, old_score = scored_map[iri_hash]
                if new_score > old_score:
                    scored_map[iri_hash] = (iri_hash, owl_class, new_score)
            elif new_score >= min_score:
                # Candidate was below threshold before but now qualifies
                scored_map[iri_hash] = (iri_hash, raw[iri_hash], new_score)

        scored = list(scored_map.values())

    # Phase 2.5: Surface ancestor concepts of high-scoring matches
    # (e.g., "Dog Bite Strict Liability" → parent "Personal Injury and Tort Law")
    ancestor_scores: dict[str, float] = {}
    for iri_hash, owl_class, score in scored:
        if score < 50:
            continue
        current = owl_class
        for depth in range(1, 4):
            if not current or not current.sub_class_of:
                break
            parent_hash = _extract_iri_hash(current.sub_class_of[0])
            if parent_hash in _branch_root_iris:
                break  # Don't surface branch roots as candidates
            if parent_hash not in raw:
                parent_score = score * (0.6 ** depth)
                if parent_score >= min_score:
                    ancestor_scores[parent_hash] = max(
                        ancestor_scores.get(parent_hash, 0), parent_score
                    )
            current = folio[parent_hash]

    for parent_hash, pscore in ancestor_scores.items():
        parent_class = folio[parent_hash]
        if parent_class:
            scored.append((parent_hash, parent_class, round(pscore, 1)))

    # Phase 2.6: Cross-branch keyword bridging (non-LLM path only)
    # When concepts are found, use their ancestor labels as additional search
    # terms to discover related concepts in branches that had NO direct results.
    # Skipped when LLM pipeline is active — the LLM handles semantic mapping.
    # e.g. "DUI/DWI Defense" → finds "Driving Under the Influence" (Objectives)
    #   → parent "Criminal Misdemeanor Offenses" → search "criminal" → "Criminal Law" (Area of Law)
    if use_bridging:
        existing_hashes = {h for h, _, _ in scored}
        bridged: dict[str, float] = {}
        searched_words: set[str] = set()
        bridge_sources = sorted(
            [(h, c, s) for h, c, s in scored if s >= 20],
            key=lambda x: x[2], reverse=True,
        )[:15]
        for iri_hash, owl_class, score in bridge_sources:
            current = owl_class
            for depth in range(1, 3):
                if not current or not current.sub_class_of:
                    break
                parent_hash = _extract_iri_hash(current.sub_class_of[0])
                if parent_hash in _branch_root_iris:
                    break
                parent_class = folio[parent_hash]
                if not parent_class:
                    break
                parent_label = parent_class.label or ""
                parent_words = _content_words(parent_label)
                for pw in parent_words:
                    if len(pw) < 4 or pw in searched_words:
                        continue
                    searched_words.add(pw)
                    for found_class, _ in folio.search_by_label(pw, include_alt_labels=True, limit=50):
                        fh = _extract_iri_hash(found_class.iri)
                        if fh in existing_hashes or fh in bridged:
                            continue
                        found_label_words = _content_words(found_class.label or "")
                        if pw in found_label_words:
                            bridge_score = round(score * (0.85 ** depth), 1)
                            if bridge_score >= min_score:
                                bridged[fh] = max(bridged.get(fh, 0), bridge_score)
                current = parent_class

        for bh, bscore in bridged.items():
            bridged_class = folio[bh]
            if bridged_class:
                scored.append((bh, bridged_class, bscore))

    # Sort by score descending
    scored.sort(key=lambda x: x[2], reverse=True)

    # Phase 3: Build FolioCandidate objects with per-branch limits
    candidates: list[FolioCandidate] = []
    branch_counts: dict[str, int] = {}

    for iri_hash, owl_class, score in scored:
        branch_name = get_branch_for_class(folio, iri_hash)
        if branch_name in EXCLUDED_BRANCHES:
            continue
        count = branch_counts.get(branch_name, 0)
        if count >= max_per_branch:
            continue
        branch_counts[branch_name] = count + 1

        candidates.append(
            FolioCandidate(
                label=owl_class.label or iri_hash,
                iri=owl_class.iri,
                iri_hash=iri_hash,
                definition=owl_class.definition,
                synonyms=owl_class.alternative_labels or [],
                branch=branch_name,
                branch_color=get_branch_color(branch_name),
                hierarchy_path=_build_hierarchy_path(folio, iri_hash),
                score=score,
            )
        )

    return candidates


def search_all_items(
    items: list[ParseItem],
    threshold: float = 0.3,
    max_per_branch: int = 10,
) -> list[ItemMappingResult]:
    """Search FOLIO candidates for all input items."""
    results: list[ItemMappingResult] = []

    for item in items:
        candidates = search_candidates(item.text, threshold, max_per_branch, use_bridging=True)

        # Group candidates by branch
        branch_groups_dict: dict[str, list[FolioCandidate]] = {}
        for c in candidates:
            branch_groups_dict.setdefault(c.branch, []).append(c)

        branch_groups = [
            BranchGroup(
                branch=branch,
                branch_color=get_branch_color(branch),
                candidates=cands,
            )
            for branch, cands in sorted(branch_groups_dict.items())
        ]

        results.append(
            ItemMappingResult(
                item_index=item.index,
                item_text=item.text,
                branch_groups=branch_groups,
                total_candidates=len(candidates),
            )
        )

    return results


def get_all_branches() -> list[BranchInfo]:
    """Get all available branches with concept counts."""
    folio = get_folio()
    branches_dict = folio.get_folio_branches(max_depth=16)

    result: list[BranchInfo] = []
    for ft_key, classes in branches_dict.items():
        # ft_key is like "FOLIOTypes.ACTOR_PLAYER"
        branch_key = ft_key.name if hasattr(ft_key, "name") else str(ft_key).split(".")[-1]
        display_name = get_branch_display_name(branch_key)
        if display_name in EXCLUDED_BRANCHES:
            continue
        color = get_branch_color(display_name)

        result.append(
            BranchInfo(
                name=display_name,
                color=color,
                concept_count=len(classes),
            )
        )

    result.sort(key=lambda b: b.name)
    return result
