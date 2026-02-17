"""Branch sorting for export tree: default, alphabetical, or custom order."""

from __future__ import annotations

# Mirrors packages/core/src/folio/branch-order.ts
DEFAULT_BRANCH_ORDER: list[str] = [
    "Area of Law",
    "Service",
    "Objectives",
    "Industry and Market",
    "Actor / Player",
    "Forums and Venues",
    "Governmental Body",
    "Document / Artifact",
    "Legal Entity",
    "Event",
    "Location",
    "Engagement Attributes",
    "Asset Type",
    "Legal Authorities",
    "Legal Use Cases",
    "Status",
    "Communication Modality",
    "Financial Concepts and Metrics",
    "Currency",
    "Matter Narrative",
    "Data Format",
    "Language",
    "System Identifiers",
]


def sort_branches(
    branch_list: list[str],
    mode: str = "default",
    custom_order: list[str] | None = None,
) -> list[str]:
    """Sort branch names according to the specified mode.

    Args:
        branch_list: Branch names to sort.
        mode: "default" (PRD order), "alphabetical", or "custom".
        custom_order: Used when mode is "custom".

    Returns:
        Sorted list of branch names.
    """
    if mode == "alphabetical":
        return sorted(branch_list)

    if mode == "custom" and custom_order:
        order_map = {name: i for i, name in enumerate(custom_order)}
        fallback = len(custom_order)
        return sorted(branch_list, key=lambda b: (order_map.get(b, fallback), b))

    # Default: PRD order
    order_map = {name: i for i, name in enumerate(DEFAULT_BRANCH_ORDER)}
    fallback = len(DEFAULT_BRANCH_ORDER)
    return sorted(branch_list, key=lambda b: (order_map.get(b, fallback), b))
