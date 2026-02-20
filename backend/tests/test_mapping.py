"""Tests for the mapping endpoints with mocked FOLIO service."""

from unittest.mock import MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models.mapping_models import BranchGroup, BranchInfo, ConceptDetail, FolioCandidate, FolioStatus, HierarchyPathEntry, ItemMappingResult
from app.services.branch_config import BRANCH_CONFIG, get_branch_color, get_branch_display_name


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


# --- Unit tests for branch_config ---


def test_branch_config_has_26_entries():
    assert len(BRANCH_CONFIG) == 26


def test_get_branch_color_known():
    assert get_branch_color("Actor / Player") == "#1e6fa0"
    assert get_branch_color("Area of Law") == "#1a5276"
    assert get_branch_color("Financial Concepts and Metrics") == "#6e4b00"
    assert get_branch_color("Legal Use Cases") == "#4a3570"


def test_get_branch_color_unknown():
    assert get_branch_color("Nonexistent Branch") == "#4a5568"


def test_get_branch_display_name():
    assert get_branch_display_name("ACTOR_PLAYER") == "Actor / Player"
    assert get_branch_display_name("SERVICE") == "Service"


def test_get_branch_display_name_unknown():
    assert get_branch_display_name("UNKNOWN") == "UNKNOWN"


# --- Unit tests for mapping models ---


def test_folio_candidate_model():
    c = FolioCandidate(
        label="Contract Law",
        iri="https://folio.openlegalstandard.org/RCIPwpgRpMs1eVz4vPid0pV",
        iri_hash="RCIPwpgRpMs1eVz4vPid0pV",
        definition="The law of contracts",
        synonyms=["General Theory of Contracts"],
        branch="Area of Law",
        branch_color="#1A5276",
        hierarchy_path=[{"label": "Area of Law", "iri_hash": "RAoL"}, {"label": "Contract Law", "iri_hash": "RCIPwpgRpMs1eVz4vPid0pV"}],
        score=100.0,
    )
    assert c.label == "Contract Law"
    assert c.score == 100.0
    assert len(c.synonyms) == 1


def test_item_mapping_result():
    result = ItemMappingResult(
        item_index=0,
        item_text="Contract Law",
        branch_groups=[
            BranchGroup(
                branch="Area of Law",
                branch_color="#1A5276",
                candidates=[],
            )
        ],
        total_candidates=0,
    )
    assert result.item_text == "Contract Law"
    assert len(result.branch_groups) == 1


# --- API endpoint tests (mocked FOLIO) ---


MOCK_CANDIDATES = [
    ItemMappingResult(
        item_index=0,
        item_text="Dog Bite Law",
        branch_groups=[
            BranchGroup(
                branch="Area of Law",
                branch_color="#1A5276",
                candidates=[
                    FolioCandidate(
                        label="Animal Law",
                        iri="https://folio.openlegalstandard.org/Rtest1",
                        iri_hash="Rtest1",
                        definition="Law relating to animals",
                        synonyms=[],
                        branch="Area of Law",
                        branch_color="#1A5276",
                        hierarchy_path=[{"label": "Area of Law", "iri_hash": "RAoL"}, {"label": "Animal Law", "iri_hash": "Rtest1"}],
                        score=75.0,
                    ),
                ],
            )
        ],
        total_candidates=1,
    ),
]

MOCK_BRANCHES = [
    BranchInfo(name="Area of Law", color="#1a5276", concept_count=500),
    BranchInfo(name="Service", color="#065e4e", concept_count=200),
]


@pytest.mark.anyio
@patch("app.routers.mapping.search_all_items", return_value=MOCK_CANDIDATES)
@patch("app.routers.mapping.get_all_branches", return_value=MOCK_BRANCHES)
async def test_post_candidates(mock_branches, mock_search, client: AsyncClient):
    resp = await client.post(
        "/api/mapping/candidates",
        json={
            "items": [{"text": "Dog Bite Law", "index": 0, "ancestry": []}],
            "threshold": 0.3,
            "max_per_branch": 10,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_items"] == 1
    assert len(data["items"]) == 1
    assert data["items"][0]["item_text"] == "Dog Bite Law"
    assert len(data["items"][0]["branch_groups"]) == 1
    assert data["items"][0]["branch_groups"][0]["branch"] == "Area of Law"


@pytest.mark.anyio
@patch(
    "app.routers.mapping.get_folio_status",
    return_value=FolioStatus(loaded=True, concept_count=18000),
)
async def test_get_status(mock_status, client: AsyncClient):
    resp = await client.get("/api/mapping/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["loaded"] is True
    assert data["concept_count"] == 18000


@pytest.mark.anyio
@patch(
    "app.routers.mapping.warmup_folio",
    return_value=FolioStatus(loaded=False, loading=True),
)
async def test_post_warmup(mock_warmup, client: AsyncClient):
    resp = await client.post("/api/mapping/warmup")
    assert resp.status_code == 200
    data = resp.json()
    assert data["loading"] is True


@pytest.mark.anyio
@patch("app.routers.mapping.get_all_branches", return_value=MOCK_BRANCHES)
async def test_get_branches(mock_branches, client: AsyncClient):
    resp = await client.get("/api/mapping/branches")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert data[0]["name"] == "Area of Law"


# --- ConceptDetail model tests ---


def test_concept_detail_model():
    cd = ConceptDetail(
        label="Contract Law",
        iri="https://folio.openlegalstandard.org/RCIPwpgRpMs1eVz4vPid0pV",
        iri_hash="RCIPwpgRpMs1eVz4vPid0pV",
        definition="The law of contracts",
        synonyms=["General Theory of Contracts"],
        branch="Area of Law",
        branch_color="#1A5276",
        hierarchy_path=[
            {"label": "Area of Law", "iri_hash": "RAoL"},
            {"label": "Contract Law", "iri_hash": "RCIPwpgRpMs1eVz4vPid0pV"},
        ],
        score=-1,
        all_parents=[
            HierarchyPathEntry(label="Area of Law", iri_hash="RAoL"),
        ],
        children=[
            HierarchyPathEntry(label="Commercial Contracts", iri_hash="Rchild1"),
            HierarchyPathEntry(label="Consumer Contracts", iri_hash="Rchild2"),
        ],
        siblings=[
            HierarchyPathEntry(label="Tort Law", iri_hash="Rsib1"),
        ],
        related=[
            HierarchyPathEntry(label="Business Law", iri_hash="Rrel1"),
        ],
        examples=["Sale of goods", "Employment agreements"],
        translations={"es": "Derecho Contractual", "fr": "Droit des contrats"},
    )
    assert cd.label == "Contract Law"
    assert len(cd.all_parents) == 1
    assert cd.all_parents[0].label == "Area of Law"
    assert len(cd.children) == 2
    assert cd.children[0].label == "Commercial Contracts"
    assert len(cd.siblings) == 1
    assert len(cd.related) == 1
    assert len(cd.examples) == 2
    assert cd.translations["es"] == "Derecho Contractual"


def test_concept_detail_defaults():
    cd = ConceptDetail(
        label="Test",
        iri="https://folio.openlegalstandard.org/Rtest",
        iri_hash="Rtest",
        branch="Area of Law",
        branch_color="#1A5276",
        score=-1,
    )
    assert cd.all_parents == []
    assert cd.children == []
    assert cd.siblings == []
    assert cd.related == []
    assert cd.examples == []
    assert cd.translations == {}


# --- /concept/{iri_hash}/detail endpoint tests ---


MOCK_CONCEPT_DETAIL = ConceptDetail(
    label="Animal Law",
    iri="https://folio.openlegalstandard.org/Rtest1",
    iri_hash="Rtest1",
    definition="Law relating to animals",
    synonyms=["Animal Rights Law"],
    branch="Area of Law",
    branch_color="#1A5276",
    hierarchy_path=[
        {"label": "Area of Law", "iri_hash": "RAoL"},
        {"label": "Animal Law", "iri_hash": "Rtest1"},
    ],
    score=-1,
    all_parents=[HierarchyPathEntry(label="Area of Law", iri_hash="RAoL")],
    children=[HierarchyPathEntry(label="Wildlife Law", iri_hash="Rchild1")],
    siblings=[HierarchyPathEntry(label="Environmental Law", iri_hash="Rsib1")],
    related=[],
    examples=["Animal cruelty cases"],
    translations={"es": "Derecho Animal"},
)


@pytest.mark.anyio
@patch("app.routers.mapping.lookup_concept_detail", return_value=MOCK_CONCEPT_DETAIL)
async def test_get_concept_detail(mock_lookup, client: AsyncClient):
    resp = await client.get("/api/mapping/concept/Rtest1/detail")
    assert resp.status_code == 200
    data = resp.json()
    assert data["label"] == "Animal Law"
    assert len(data["all_parents"]) == 1
    assert data["all_parents"][0]["label"] == "Area of Law"
    assert len(data["children"]) == 1
    assert data["children"][0]["label"] == "Wildlife Law"
    assert len(data["siblings"]) == 1
    assert data["siblings"][0]["label"] == "Environmental Law"
    assert data["related"] == []
    assert data["examples"] == ["Animal cruelty cases"]
    assert data["translations"]["es"] == "Derecho Animal"


@pytest.mark.anyio
@patch("app.routers.mapping.lookup_concept_detail", return_value=None)
async def test_get_concept_detail_not_found(mock_lookup, client: AsyncClient):
    resp = await client.get("/api/mapping/concept/Rnonexistent/detail")
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Concept not found"
