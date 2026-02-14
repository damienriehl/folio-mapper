"""Static map of FOLIO branch names to display names and hex colors from PRD.

Keys match FOLIOTypes enum names from folio-python library.
"""

from __future__ import annotations

BRANCH_CONFIG: dict[str, dict[str, str]] = {
    "ACTOR_PLAYER": {"name": "Actor / Player", "color": "#2E86C1"},
    "AREA_OF_LAW": {"name": "Area of Law", "color": "#1A5276"},
    "ASSET_TYPE": {"name": "Asset Type", "color": "#D4AC0D"},
    "COMMUNICATION_MODALITY": {"name": "Communication Modality", "color": "#AF7AC5"},
    "CURRENCY": {"name": "Currency", "color": "#F39C12"},
    "DATA_FORMAT": {"name": "Data Format", "color": "#85929E"},
    "DOCUMENT_ARTIFACT": {"name": "Document / Artifact", "color": "#E67E22"},
    "ENGAGEMENT_TERMS": {"name": "Engagement Attributes", "color": "#2ECC71"},
    "EVENT": {"name": "Event", "color": "#E74C3C"},
    "FOLIO_TYPE": {"name": "FOLIO Type", "color": "#F1C40F"},
    "FORUMS_VENUES": {"name": "Forums and Venues", "color": "#8E44AD"},
    "GOVERNMENTAL_BODY": {"name": "Governmental Body", "color": "#3498DB"},
    "INDUSTRY": {"name": "Industry and Market", "color": "#1ABC9C"},
    "LANGUAGE": {"name": "Language", "color": "#D35400"},
    "LEGAL_AUTHORITIES": {"name": "Legal Authorities", "color": "#C0392B"},
    "LEGAL_ENTITY": {"name": "Legal Entity", "color": "#27AE60"},
    "LOCATION": {"name": "Location", "color": "#16A085"},
    "MATTER_NARRATIVE": {"name": "Matter Narrative", "color": "#7D3C98"},
    "MATTER_NARRATIVE_FORMAT": {"name": "Matter Narrative Format", "color": "#2980B9"},
    "OBJECTIVES": {"name": "Objectives", "color": "#CB4335"},
    "SERVICE": {"name": "Service", "color": "#138D75"},
    "STANDARDS_COMPATIBILITY": {"name": "Standards Compatibility", "color": "#5D6D7E"},
    "STATUS": {"name": "Status", "color": "#CA6F1E"},
    "SYSTEM_IDENTIFIERS": {"name": "System Identifiers", "color": "#7F8C8D"},
}

# Branches to exclude from search results and branch listings.
# Standards Compatibility merely reflects predecessor standards; FOLIO already
# has concepts that correspond to everything in that branch.
EXCLUDED_BRANCHES: frozenset[str] = frozenset({
    "Standards Compatibility",
    "ZZZ - SANDBOX: UNDER CONSTRUCTION",
})

# Lookup by display name -> branch key
_NAME_TO_KEY = {v["name"]: k for k, v in BRANCH_CONFIG.items()}


def get_branch_color(branch_name: str) -> str:
    """Get the hex color for a branch display name."""
    key = _NAME_TO_KEY.get(branch_name)
    if key:
        return BRANCH_CONFIG[key]["color"]
    return "#9E9E9E"  # fallback gray


def get_branch_display_name(key: str) -> str:
    """Get the display name for a branch key (e.g. ACTOR_PLAYER -> 'Actor / Player')."""
    cfg = BRANCH_CONFIG.get(key)
    return cfg["name"] if cfg else key
