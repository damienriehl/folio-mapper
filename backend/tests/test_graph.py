"""Tests for the entity graph endpoint and models."""

from unittest.mock import MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models.graph_models import EntityGraphResponse, GraphEdge, GraphNode


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


# --- Model unit tests ---


def test_graph_node_model():
    node = GraphNode(
        id="Rtest1",
        label="Contract Law",
        iri="https://folio.openlegalstandard.org/Rtest1",
        definition="The law of contracts",
        branch="Area of Law",
        branch_color="#1a5276",
        is_focus=True,
        is_branch_root=False,
        depth=0,
    )
    assert node.id == "Rtest1"
    assert node.label == "Contract Law"
    assert node.is_focus is True
    assert node.depth == 0


def test_graph_node_defaults():
    node = GraphNode(
        id="Rtest2",
        label="Tort Law",
        iri="https://folio.openlegalstandard.org/Rtest2",
        branch="Area of Law",
        branch_color="#1a5276",
    )
    assert node.definition is None
    assert node.is_focus is False
    assert node.is_branch_root is False
    assert node.depth == 0


def test_graph_edge_model():
    edge = GraphEdge(
        id="Rparent->Rchild:subClassOf",
        source="Rparent",
        target="Rchild",
        edge_type="subClassOf",
    )
    assert edge.source == "Rparent"
    assert edge.target == "Rchild"
    assert edge.edge_type == "subClassOf"
    assert edge.label is None


def test_graph_edge_with_label():
    edge = GraphEdge(
        id="Ra->Rb:seeAlso",
        source="Ra",
        target="Rb",
        edge_type="seeAlso",
        label="rdfs:seeAlso",
    )
    assert edge.label == "rdfs:seeAlso"
    assert edge.edge_type == "seeAlso"


def test_entity_graph_response_model():
    resp = EntityGraphResponse(
        focus_iri_hash="Rfocus",
        focus_label="Focus Concept",
        nodes=[
            GraphNode(
                id="Rfocus",
                label="Focus Concept",
                iri="https://folio.openlegalstandard.org/Rfocus",
                branch="Area of Law",
                branch_color="#1a5276",
                is_focus=True,
            ),
        ],
        edges=[],
        truncated=False,
        total_concept_count=1,
    )
    assert resp.focus_iri_hash == "Rfocus"
    assert len(resp.nodes) == 1
    assert len(resp.edges) == 0
    assert resp.truncated is False


def test_entity_graph_response_defaults():
    resp = EntityGraphResponse(
        focus_iri_hash="Rfocus",
        focus_label="Focus",
        nodes=[],
        edges=[],
    )
    assert resp.truncated is False
    assert resp.total_concept_count == 0


# --- build_entity_graph unit tests ---


def _mock_owl_class(
    label,
    iri_hash,
    sub_class_of=None,
    parent_class_of=None,
    see_also=None,
    definition=None,
):
    """Create a mock OWL class."""
    cls = MagicMock()
    cls.label = label
    cls.iri = f"https://folio.openlegalstandard.org/{iri_hash}"
    cls.definition = definition
    cls.sub_class_of = sub_class_of or []
    cls.parent_class_of = parent_class_of or []
    cls.see_also = see_also or []
    cls.alternative_labels = []
    cls.examples = []
    cls.translations = {}
    return cls


BASE_IRI = "https://folio.openlegalstandard.org"
OWL_THING = "http://www.w3.org/2002/07/owl#Thing"


def _make_mock_folio(classes: dict[str, MagicMock]) -> MagicMock:
    """Create a mock FOLIO object that returns classes by iri_hash."""
    folio = MagicMock()
    folio.__getitem__ = lambda self, key: classes.get(key)
    return folio


@patch("app.services.folio_service._branch_root_iris", {"Rbranch": "Area of Law"})
@patch("app.services.folio_service._branch_cache", {})
@patch("app.services.folio_service.get_branch_color", return_value="#1a5276")
@patch("app.services.folio_service.get_branch_for_class", return_value="Area of Law")
def test_build_graph_single_concept(mock_branch, mock_color):
    """Focus node with no parents/children returns a single-node graph."""
    from app.services.folio_service import build_entity_graph

    classes = {
        "Rfocus": _mock_owl_class("Focus", "Rfocus", sub_class_of=[OWL_THING]),
    }
    with patch("app.services.folio_service.get_folio", return_value=_make_mock_folio(classes)):
        result = build_entity_graph("Rfocus")

    assert result is not None
    assert result.focus_iri_hash == "Rfocus"
    assert len(result.nodes) == 1
    assert result.nodes[0].is_focus is True
    assert len(result.edges) == 0
    assert result.truncated is False


@patch("app.services.folio_service._branch_root_iris", {"Rbranch": "Area of Law"})
@patch("app.services.folio_service._branch_cache", {})
@patch("app.services.folio_service.get_branch_color", return_value="#1a5276")
@patch("app.services.folio_service.get_branch_for_class", return_value="Area of Law")
def test_build_graph_with_parents(mock_branch, mock_color):
    """BFS upward discovers parent nodes."""
    from app.services.folio_service import build_entity_graph

    classes = {
        "Rfocus": _mock_owl_class("Focus", "Rfocus", sub_class_of=[f"{BASE_IRI}/Rparent"]),
        "Rparent": _mock_owl_class("Parent", "Rparent", sub_class_of=[OWL_THING]),
    }
    with patch("app.services.folio_service.get_folio", return_value=_make_mock_folio(classes)):
        result = build_entity_graph("Rfocus", ancestors_depth=2)

    assert result is not None
    assert len(result.nodes) == 2
    ids = {n.id for n in result.nodes}
    assert "Rfocus" in ids
    assert "Rparent" in ids
    assert len(result.edges) == 1
    assert result.edges[0].source == "Rparent"
    assert result.edges[0].target == "Rfocus"
    assert result.edges[0].edge_type == "subClassOf"


@patch("app.services.folio_service._branch_root_iris", {"Rbranch": "Area of Law"})
@patch("app.services.folio_service._branch_cache", {})
@patch("app.services.folio_service.get_branch_color", return_value="#1a5276")
@patch("app.services.folio_service.get_branch_for_class", return_value="Area of Law")
def test_build_graph_with_children(mock_branch, mock_color):
    """BFS downward discovers child nodes."""
    from app.services.folio_service import build_entity_graph

    classes = {
        "Rfocus": _mock_owl_class(
            "Focus", "Rfocus",
            sub_class_of=[OWL_THING],
            parent_class_of=[f"{BASE_IRI}/Rchild1", f"{BASE_IRI}/Rchild2"],
        ),
        "Rchild1": _mock_owl_class("Child 1", "Rchild1", sub_class_of=[f"{BASE_IRI}/Rfocus"]),
        "Rchild2": _mock_owl_class("Child 2", "Rchild2", sub_class_of=[f"{BASE_IRI}/Rfocus"]),
    }
    with patch("app.services.folio_service.get_folio", return_value=_make_mock_folio(classes)):
        result = build_entity_graph("Rfocus", descendants_depth=1)

    assert result is not None
    assert len(result.nodes) == 3
    assert len(result.edges) == 2
    for edge in result.edges:
        assert edge.source == "Rfocus"
        assert edge.edge_type == "subClassOf"


@patch("app.services.folio_service._branch_root_iris", {"Rbranch": "Area of Law"})
@patch("app.services.folio_service._branch_cache", {})
@patch("app.services.folio_service.get_branch_color", return_value="#1a5276")
@patch("app.services.folio_service.get_branch_for_class", return_value="Area of Law")
def test_build_graph_with_see_also(mock_branch, mock_color):
    """seeAlso cross-links are included when include_see_also=True."""
    from app.services.folio_service import build_entity_graph

    classes = {
        "Rfocus": _mock_owl_class(
            "Focus", "Rfocus",
            sub_class_of=[OWL_THING],
            see_also=[f"{BASE_IRI}/Rrelated"],
        ),
        "Rrelated": _mock_owl_class("Related", "Rrelated", sub_class_of=[OWL_THING]),
    }
    with patch("app.services.folio_service.get_folio", return_value=_make_mock_folio(classes)):
        result = build_entity_graph("Rfocus", include_see_also=True)

    assert result is not None
    see_also_edges = [e for e in result.edges if e.edge_type == "seeAlso"]
    assert len(see_also_edges) == 1
    assert see_also_edges[0].label == "rdfs:seeAlso"
    # Related node should be in the graph
    ids = {n.id for n in result.nodes}
    assert "Rrelated" in ids


@patch("app.services.folio_service._branch_root_iris", {"Rbranch": "Area of Law"})
@patch("app.services.folio_service._branch_cache", {})
@patch("app.services.folio_service.get_branch_color", return_value="#1a5276")
@patch("app.services.folio_service.get_branch_for_class", return_value="Area of Law")
def test_build_graph_see_also_disabled(mock_branch, mock_color):
    """seeAlso edges are excluded when include_see_also=False."""
    from app.services.folio_service import build_entity_graph

    classes = {
        "Rfocus": _mock_owl_class(
            "Focus", "Rfocus",
            sub_class_of=[OWL_THING],
            see_also=[f"{BASE_IRI}/Rrelated"],
        ),
        "Rrelated": _mock_owl_class("Related", "Rrelated", sub_class_of=[OWL_THING]),
    }
    with patch("app.services.folio_service.get_folio", return_value=_make_mock_folio(classes)):
        result = build_entity_graph("Rfocus", include_see_also=False)

    assert result is not None
    see_also_edges = [e for e in result.edges if e.edge_type == "seeAlso"]
    assert len(see_also_edges) == 0
    # Related node should NOT be in the graph
    ids = {n.id for n in result.nodes}
    assert "Rrelated" not in ids


@patch("app.services.folio_service._branch_root_iris", {"Rbranch": "Area of Law"})
@patch("app.services.folio_service._branch_cache", {})
@patch("app.services.folio_service.get_branch_color", return_value="#1a5276")
@patch("app.services.folio_service.get_branch_for_class", return_value="Area of Law")
def test_build_graph_depth_limits(mock_branch, mock_color):
    """BFS stops at the configured depth."""
    from app.services.folio_service import build_entity_graph

    classes = {
        "Rfocus": _mock_owl_class(
            "Focus", "Rfocus",
            sub_class_of=[f"{BASE_IRI}/Rparent1"],
            parent_class_of=[f"{BASE_IRI}/Rchild1"],
        ),
        "Rparent1": _mock_owl_class(
            "Parent 1", "Rparent1",
            sub_class_of=[f"{BASE_IRI}/Rgrandparent"],
        ),
        "Rgrandparent": _mock_owl_class("Grandparent", "Rgrandparent", sub_class_of=[OWL_THING]),
        "Rchild1": _mock_owl_class(
            "Child 1", "Rchild1",
            sub_class_of=[f"{BASE_IRI}/Rfocus"],
            parent_class_of=[f"{BASE_IRI}/Rgrandchild"],
        ),
        "Rgrandchild": _mock_owl_class("Grandchild", "Rgrandchild", sub_class_of=[f"{BASE_IRI}/Rchild1"]),
    }
    with patch("app.services.folio_service.get_folio", return_value=_make_mock_folio(classes)):
        # Depth 1 should get parent1 and child1, but NOT grandparent or grandchild
        result = build_entity_graph("Rfocus", ancestors_depth=1, descendants_depth=1, include_see_also=False)

    assert result is not None
    ids = {n.id for n in result.nodes}
    assert "Rfocus" in ids
    assert "Rparent1" in ids
    assert "Rchild1" in ids
    assert "Rgrandparent" not in ids
    assert "Rgrandchild" not in ids


@patch("app.services.folio_service._branch_root_iris", {"Rbranch": "Area of Law"})
@patch("app.services.folio_service._branch_cache", {})
@patch("app.services.folio_service.get_branch_color", return_value="#1a5276")
@patch("app.services.folio_service.get_branch_for_class", return_value="Area of Law")
def test_build_graph_max_nodes_truncation(mock_branch, mock_color):
    """Graph is truncated when max_nodes is reached."""
    from app.services.folio_service import build_entity_graph

    # Focus with many children
    child_iris = [f"{BASE_IRI}/Rchild{i}" for i in range(10)]
    classes = {
        "Rfocus": _mock_owl_class(
            "Focus", "Rfocus",
            sub_class_of=[OWL_THING],
            parent_class_of=child_iris,
        ),
    }
    for i in range(10):
        classes[f"Rchild{i}"] = _mock_owl_class(
            f"Child {i}", f"Rchild{i}",
            sub_class_of=[f"{BASE_IRI}/Rfocus"],
        )

    with patch("app.services.folio_service.get_folio", return_value=_make_mock_folio(classes)):
        # Allow only 5 nodes total (focus + 4 children)
        result = build_entity_graph("Rfocus", max_nodes=5, include_see_also=False)

    assert result is not None
    assert len(result.nodes) <= 5
    assert result.truncated is True


@patch("app.services.folio_service._branch_root_iris", {"Rbranch": "Area of Law"})
@patch("app.services.folio_service._branch_cache", {})
@patch("app.services.folio_service.get_branch_color", return_value="#1a5276")
@patch("app.services.folio_service.get_branch_for_class", return_value="Area of Law")
def test_build_graph_cycle_handling(mock_branch, mock_color):
    """Polyhierarchy cycles don't cause infinite loops."""
    from app.services.folio_service import build_entity_graph

    # Create a cycle: A -> B -> C -> A
    classes = {
        "Ra": _mock_owl_class(
            "A", "Ra",
            sub_class_of=[f"{BASE_IRI}/Rc"],
            parent_class_of=[f"{BASE_IRI}/Rb"],
        ),
        "Rb": _mock_owl_class(
            "B", "Rb",
            sub_class_of=[f"{BASE_IRI}/Ra"],
            parent_class_of=[f"{BASE_IRI}/Rc"],
        ),
        "Rc": _mock_owl_class(
            "C", "Rc",
            sub_class_of=[f"{BASE_IRI}/Rb"],
            parent_class_of=[f"{BASE_IRI}/Ra"],
        ),
    }
    with patch("app.services.folio_service.get_folio", return_value=_make_mock_folio(classes)):
        result = build_entity_graph("Ra", ancestors_depth=5, descendants_depth=5, include_see_also=False)

    assert result is not None
    # Should terminate and include all 3 nodes
    assert len(result.nodes) == 3


@patch("app.services.folio_service._branch_root_iris", {"Rbranch": "Area of Law"})
@patch("app.services.folio_service._branch_cache", {})
@patch("app.services.folio_service.get_branch_color", return_value="#1a5276")
@patch("app.services.folio_service.get_branch_for_class", return_value="Area of Law")
def test_build_graph_not_found(mock_branch, mock_color):
    """Returns None for unknown iri_hash."""
    from app.services.folio_service import build_entity_graph

    classes = {}
    with patch("app.services.folio_service.get_folio", return_value=_make_mock_folio(classes)):
        result = build_entity_graph("Rnonexistent")

    assert result is None


@patch("app.services.folio_service._branch_root_iris", {"Rbranch": "Area of Law"})
@patch("app.services.folio_service._branch_cache", {})
@patch("app.services.folio_service.get_branch_color", return_value="#1a5276")
@patch("app.services.folio_service.get_branch_for_class", return_value="Area of Law")
def test_build_graph_see_also_cap(mock_branch, mock_color):
    """seeAlso edges are capped per node."""
    from app.services.folio_service import build_entity_graph

    see_also_iris = [f"{BASE_IRI}/Rrel{i}" for i in range(10)]
    classes = {
        "Rfocus": _mock_owl_class("Focus", "Rfocus", sub_class_of=[OWL_THING], see_also=see_also_iris),
    }
    for i in range(10):
        classes[f"Rrel{i}"] = _mock_owl_class(f"Related {i}", f"Rrel{i}", sub_class_of=[OWL_THING])

    with patch("app.services.folio_service.get_folio", return_value=_make_mock_folio(classes)):
        result = build_entity_graph("Rfocus", include_see_also=True, max_see_also_per_node=3)

    assert result is not None
    see_also_edges = [e for e in result.edges if e.edge_type == "seeAlso"]
    assert len(see_also_edges) == 3


@patch("app.services.folio_service._branch_root_iris", {"RbranchRoot": "Area of Law"})
@patch("app.services.folio_service._branch_cache", {})
@patch("app.services.folio_service.get_branch_color", return_value="#1a5276")
@patch("app.services.folio_service.get_branch_for_class", return_value="Area of Law")
def test_build_graph_branch_root_flagged(mock_branch, mock_color):
    """Branch root nodes have is_branch_root=True."""
    from app.services.folio_service import build_entity_graph

    classes = {
        "Rfocus": _mock_owl_class("Focus", "Rfocus", sub_class_of=[f"{BASE_IRI}/RbranchRoot"]),
        "RbranchRoot": _mock_owl_class("Area of Law", "RbranchRoot", sub_class_of=[OWL_THING]),
    }
    with patch("app.services.folio_service.get_folio", return_value=_make_mock_folio(classes)):
        result = build_entity_graph("Rfocus", ancestors_depth=2)

    assert result is not None
    root_nodes = [n for n in result.nodes if n.is_branch_root]
    assert len(root_nodes) == 1
    assert root_nodes[0].id == "RbranchRoot"


# --- API endpoint tests ---


MOCK_GRAPH = EntityGraphResponse(
    focus_iri_hash="Rtest1",
    focus_label="Contract Law",
    nodes=[
        GraphNode(
            id="Rtest1",
            label="Contract Law",
            iri="https://folio.openlegalstandard.org/Rtest1",
            branch="Area of Law",
            branch_color="#1a5276",
            is_focus=True,
        ),
        GraphNode(
            id="Rparent",
            label="Area of Law",
            iri="https://folio.openlegalstandard.org/Rparent",
            branch="Area of Law",
            branch_color="#1a5276",
            depth=-1,
        ),
    ],
    edges=[
        GraphEdge(
            id="Rparent->Rtest1:subClassOf",
            source="Rparent",
            target="Rtest1",
            edge_type="subClassOf",
        ),
    ],
    total_concept_count=2,
)


@pytest.mark.anyio
@patch("app.routers.mapping.build_entity_graph", return_value=MOCK_GRAPH)
async def test_get_concept_graph_endpoint(mock_build, client: AsyncClient):
    resp = await client.get("/api/mapping/concept/Rtest1/graph")
    assert resp.status_code == 200
    data = resp.json()
    assert data["focus_iri_hash"] == "Rtest1"
    assert len(data["nodes"]) == 2
    assert len(data["edges"]) == 1
    assert data["edges"][0]["edge_type"] == "subClassOf"


@pytest.mark.anyio
@patch("app.routers.mapping.build_entity_graph", return_value=None)
async def test_get_concept_graph_404(mock_build, client: AsyncClient):
    resp = await client.get("/api/mapping/concept/Rnonexistent/graph")
    assert resp.status_code == 404


@pytest.mark.anyio
@patch("app.routers.mapping.build_entity_graph", return_value=MOCK_GRAPH)
async def test_get_concept_graph_with_query_params(mock_build, client: AsyncClient):
    resp = await client.get(
        "/api/mapping/concept/Rtest1/graph",
        params={
            "ancestors_depth": 3,
            "descendants_depth": 1,
            "max_nodes": 100,
            "include_see_also": False,
        },
    )
    assert resp.status_code == 200
    # Verify that the service was called with capped params
    mock_build.assert_called_once_with(
        "Rtest1",
        ancestors_depth=3,
        descendants_depth=1,
        max_nodes=100,
        include_see_also=False,
    )


@pytest.mark.anyio
@patch("app.routers.mapping.build_entity_graph", return_value=MOCK_GRAPH)
async def test_get_concept_graph_caps_params(mock_build, client: AsyncClient):
    """Server-side caps prevent abuse of depth/max_nodes."""
    resp = await client.get(
        "/api/mapping/concept/Rtest1/graph",
        params={
            "ancestors_depth": 99,
            "descendants_depth": 99,
            "max_nodes": 9999,
        },
    )
    assert resp.status_code == 200
    mock_build.assert_called_once_with(
        "Rtest1",
        ancestors_depth=5,  # capped
        descendants_depth=5,  # capped
        max_nodes=500,  # capped
        include_see_also=True,
    )
