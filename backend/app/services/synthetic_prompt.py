"""Prompt builder for synthetic legal taxonomy data generation."""

from __future__ import annotations

import re


def _hierarchy_depth(count: int) -> int:
    """Scale hierarchy depth based on requested item count."""
    if count <= 12:
        return 2
    if count <= 25:
        return 3
    return 4


def build_synthetic_prompt(count: int) -> list[dict[str, str]]:
    """Build chat messages that instruct the LLM to generate tab-indented legal taxonomy items."""
    depth = _hierarchy_depth(count)

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
                f"Generate exactly {count} legal taxonomy items as a tab-indented hierarchy "
                f"with up to {depth} levels of nesting.\n\n"
                "Rules:\n"
                "- Use REAL TAB characters (\\t) for indentation, not spaces\n"
                "- Each line is one taxonomy item\n"
                "- Top-level items have no indentation\n"
                "- Child items are indented with one more tab than their parent\n"
                "- Cover a diverse mix of practice areas: litigation, transactional, "
                "regulatory, advisory, bankruptcy, M&A, funds, employment, IP, tax, "
                "real estate, environmental, healthcare, data privacy\n"
                "- Use terminology appropriate for a mix of firm sizes: "
                "solo practitioners, small firms, midsize firms, and BigLaw\n"
                "- Be specific — e.g., 'Securities Litigation' not just 'Litigation'\n"
                "- Do NOT include numbering, bullets, or markdown formatting\n"
                "- Do NOT include any explanatory text before or after the list\n\n"
                "Example format (2 levels):\n"
                "Corporate & Transactional\n"
                "\tMergers & Acquisitions\n"
                "\tPrivate Equity\n"
                "Litigation\n"
                "\tCommercial Litigation\n"
                "\tSecurities Litigation\n"
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
