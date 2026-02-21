"""Prompt builder for synthetic legal taxonomy data generation."""

from __future__ import annotations

import random
import re


def _hierarchy_depth(count: int) -> int:
    """Scale hierarchy depth based on requested item count."""
    if count <= 12:
        return 2
    if count <= 25:
        return 3
    return 4


# Pool of example taxonomies — one is randomly selected per call so the LLM
# doesn't anchor on the same starting point every time.
_EXAMPLE_POOL = [
    (
        "Corporate & Transactional\n"
        "\tMergers & Acquisitions\n"
        "\tPrivate Equity\n"
        "Litigation\n"
        "\tCommercial Litigation\n"
        "\tSecurities Litigation"
    ),
    (
        "Employment & Labor\n"
        "\tWorkplace Discrimination\n"
        "\tWage & Hour\n"
        "Regulatory & Compliance\n"
        "\tAntitrust\n"
        "\tEnvironmental Compliance"
    ),
    (
        "Intellectual Property\n"
        "\tPatent Prosecution\n"
        "\tTrademark Licensing\n"
        "Real Estate & Land Use\n"
        "\tCommercial Leasing\n"
        "\tZoning & Development"
    ),
    (
        "Tax & Wealth Planning\n"
        "\tEstate & Trust Administration\n"
        "\tInternational Tax\n"
        "Healthcare & Life Sciences\n"
        "\tFDA Regulatory\n"
        "\tHealth IT & Privacy"
    ),
    (
        "Bankruptcy & Restructuring\n"
        "\tDebtor Representation\n"
        "\tCreditor Rights\n"
        "Government Contracts\n"
        "\tDefense Procurement\n"
        "\tBid Protests"
    ),
]


def build_synthetic_prompt(count: int) -> list[dict[str, str]]:
    """Build chat messages that instruct the LLM to generate tab-indented legal taxonomy items."""
    depth = _hierarchy_depth(count)
    example = random.choice(_EXAMPLE_POOL)

    return [
        {
            "role": "system",
            "content": (
                "You are a legal taxonomy expert. Generate realistic legal practice area "
                "hierarchies that a law firm would use to classify their work. "
                "Output ONLY the taxonomy lines, no commentary or markdown."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Generate a tab-indented legal taxonomy with EXACTLY {count} total lines "
                f"and up to {depth} levels of nesting.\n\n"
                f"CRITICAL: The output must have EXACTLY {count} lines total. "
                f"Every line counts — both parent categories AND their children. "
                f"For example, this is 6 lines (not 2):\n"
                f"{example}\n\n"
                f"Generate a COMPLETELY DIFFERENT taxonomy — do NOT reuse the example "
                f"categories above. Pick different practice areas each time.\n\n"
                f"Rules:\n"
                f"- Use REAL TAB characters (\\t) for indentation, not spaces\n"
                f"- Each line is one taxonomy item — count ALL lines toward the {count} total\n"
                f"- Top-level items have no indentation\n"
                f"- Child items are indented with one more tab than their parent\n"
                f"- Cover a diverse mix of practice areas: litigation, transactional, "
                f"regulatory, advisory, bankruptcy, M&A, funds, employment, IP, tax, "
                f"real estate, environmental, healthcare, data privacy\n"
                f"- Use terminology appropriate for a mix of firm sizes: "
                f"solo practitioners, small firms, midsize firms, and BigLaw\n"
                f"- Be specific — e.g., 'Securities Litigation' not just 'Litigation'\n"
                f"- Do NOT include numbering, bullets, or markdown formatting\n"
                f"- Do NOT include any explanatory text before or after the list\n"
                f"- STOP after exactly {count} lines\n"
            ),
        },
    ]


def sanitize_output(raw: str) -> str:
    """Clean LLM output: strip markdown fences, control chars (except tabs/newlines)."""
    text = raw.strip()
    # Remove markdown code fences (use [^\S\n] to avoid consuming content lines)
    text = re.sub(r"^`{3,}[^\S\n]*(?:\w+)?[^\S\n]*\n?", "", text)
    text = re.sub(r"\n?`{3,}[^\S\n]*$", "", text)
    # Remove control characters except tab (\t) and newline (\n)
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)
    return text.strip()
