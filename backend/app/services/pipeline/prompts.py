"""Prompt templates for pipeline Stages 0, 2, and 3.

All prompts are built dynamically from BRANCH_CONFIG so they stay in sync
with the ontology.
"""

from __future__ import annotations

from app.models.pipeline_models import PreScanResult, RankedCandidate, ScopedCandidate
from app.services.branch_config import BRANCH_CONFIG, EXCLUDED_BRANCHES

# Branch examples for the pre-scan prompt (representative concepts per branch)
_BRANCH_EXAMPLES: dict[str, str] = {
    "Actor / Player": "e.g., Client, Attorney, Judge, Witness",
    "Area of Law": "e.g., Contract Law, Criminal Law, Intellectual Property",
    "Asset Type": "e.g., Real Property, Securities, Intellectual Property Assets",
    "Communication Modality": "e.g., Email, Telephone, In-Person Meeting",
    "Currency": "e.g., USD, EUR, GBP",
    "Data Format": "e.g., PDF, XML, JSON",
    "Document / Artifact": "e.g., Contract, Brief, Memorandum, Court Order",
    "Engagement Attributes": "e.g., Hourly Rate, Fixed Fee, Contingency",
    "Event": "e.g., Filing, Hearing, Deposition, Trial",
    "FOLIO Type": "e.g., meta-concepts describing the ontology itself",
    "Forums and Venues": "e.g., Federal Court, State Court, Arbitration Tribunal",
    "Governmental Body": "e.g., SEC, FDA, EPA, Congress",
    "Industry and Market": "e.g., Healthcare, Technology, Financial Services",
    "Language": "e.g., English, Spanish, Mandarin",
    "Legal Authorities": "e.g., Statute, Case Law, Regulation, Treaty",
    "Legal Entity": "e.g., Corporation, LLC, Partnership, Trust",
    "Location": "e.g., United States, California, New York City",
    "Matter Narrative": "e.g., Case Description, Matter Summary",
    "Matter Narrative Format": "e.g., LEDES, custom narrative formats",
    "Objectives": "e.g., Compliance, Litigation, Risk Mitigation",
    "Service": "e.g., Investigation, Counseling, Enforcement, Drafting",
    "Status": "e.g., Open, Closed, Pending, Active",
    "System Identifiers": "e.g., Matter ID, Client ID, Docket Number",
}


def _get_active_branches() -> list[tuple[str, str]]:
    """Return (display_name, examples) for non-excluded branches."""
    result = []
    for cfg in BRANCH_CONFIG.values():
        name = cfg["name"]
        if name in EXCLUDED_BRANCHES:
            continue
        examples = _BRANCH_EXAMPLES.get(name, "")
        result.append((name, examples))
    result.sort(key=lambda x: x[0])
    return result


def build_prescan_prompt(text: str) -> list[dict]:
    """Build the Stage 0 pre-scan prompt messages.

    Returns a list of message dicts with 'role' and 'content' keys.
    """
    branches = _get_active_branches()
    branch_list = "\n".join(
        f"- {name}: {examples}" for name, examples in branches
    )

    system = (
        "You are a legal ontology specialist. Your task is to analyze legal text "
        "and segment it into conceptual parts, then tag each segment with the most "
        "relevant FOLIO ontology branches.\n\n"
        "Available FOLIO branches:\n"
        f"{branch_list}\n\n"
        "Rules:\n"
        "1. Split the input into logical segments (individual concepts or closely related concepts).\n"
        "2. Assign 1-3 branches per segment that are most likely to contain matching FOLIO concepts.\n"
        "3. Provide brief reasoning for each segment's branch assignment.\n"
        "4. If a concept spans multiple branches, list all relevant ones.\n"
        "5. Use EXACT branch names from the list above.\n"
        "6. For each segment, provide 2-5 synonyms or paraphrases that a legal ontology might use "
        "for the same concept (e.g., legal terminology variants, formal/informal equivalents).\n\n"
        "Respond with ONLY valid JSON (no markdown fences) in this format:\n"
        '{"segments": [{"text": "segment text", "branches": ["Branch Name 1", "Branch Name 2"], '
        '"reasoning": "why these branches", "synonyms": ["synonym1", "synonym2"]}]}'
    )

    user = f"Analyze and segment this legal text, tagging each segment with relevant FOLIO branches:\n\n{text}"

    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


def build_ranking_prompt(
    text: str,
    prescan: PreScanResult,
    candidates: list[ScopedCandidate],
) -> list[dict]:
    """Build the Stage 2 ranking prompt messages.

    Returns a list of message dicts with 'role' and 'content' keys.
    """
    # Build segment analysis context
    segment_lines = []
    for seg in prescan.segments:
        branches_str = ", ".join(seg.branches) if seg.branches else "none"
        segment_lines.append(f'- "{seg.text}" → branches: {branches_str}')
    segment_analysis = "\n".join(segment_lines)

    # Group candidates by branch for presentation
    by_branch: dict[str, list[ScopedCandidate]] = {}
    for c in candidates:
        by_branch.setdefault(c.branch, []).append(c)

    candidate_sections = []
    for branch, cands in sorted(by_branch.items()):
        lines = [f"\n### {branch}"]
        for c in cands:
            parts = [f"  - **{c.label}** (iri_hash: {c.iri_hash})"]
            if c.definition:
                # Truncate long definitions
                defn = c.definition[:200] + "..." if len(c.definition) > 200 else c.definition
                parts.append(f"    Definition: {defn}")
            if c.synonyms:
                parts.append(f"    Synonyms: {', '.join(c.synonyms[:5])}")
            parts.append(f"    Local score: {c.score}")
            lines.append("\n".join(parts))
        candidate_sections.append("\n".join(lines))

    candidates_text = "\n".join(candidate_sections)

    system = (
        "You are a legal ontology mapping specialist. Given a legal text and a list of "
        "candidate FOLIO ontology concepts, rank the top 20 most relevant candidates.\n\n"
        "SCORING SCALE (use the full range — scores MUST be spread out):\n"
        "- 90-100: Near-exact semantic match. The concept directly names or defines the input.\n"
        "- 75-89: Strong relevance. Closely related concept, correct domain and specificity.\n"
        "- 55-74: Moderate relevance. Related domain but different specificity or tangential.\n"
        "- 30-54: Weak relevance. Same broad field but clearly different concept.\n"
        "- 1-29: Very weak. Only superficial connection.\n\n"
        "Rules:\n"
        "1. Score each candidate INDEPENDENTLY based on semantic relevance to the input text. "
        "Ignore the \"Local score\" shown — it is a keyword-matching heuristic and may be inaccurate.\n"
        "2. Use the FULL 0-100 range. Your top candidate and bottom candidate should differ by "
        "at least 30 points. Do NOT give similar scores to dissimilar candidates.\n"
        "3. Consider the segment analysis to understand which parts of the text match which branches.\n"
        "4. Prefer specific concepts over general ones when the text is specific.\n"
        "5. A concept that merely contains the same keyword in a different context should score LOW.\n"
        "6. Return at most 20 candidates, sorted by score descending.\n\n"
        "Respond with ONLY valid JSON (no markdown fences) in this format:\n"
        '{"ranked": [{"iri_hash": "hash", "score": 85, "reasoning": "why this score"}]}'
    )

    user = (
        f"Input text: \"{text}\"\n\n"
        f"Segment analysis:\n{segment_analysis}\n\n"
        f"Candidate concepts:\n{candidates_text}\n\n"
        "Rank the top 20 most relevant candidates with scores and reasoning."
    )

    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


def build_judge_prompt(
    text: str,
    prescan: PreScanResult,
    ranked: list[RankedCandidate],
    scoped_lookup: dict[str, ScopedCandidate],
) -> list[dict]:
    """Build the Stage 3 judge validation prompt messages.

    The judge reviews each ranked candidate and adjusts scores to:
    - Reduce false positives: penalize candidates that look relevant but aren't
    - Reduce false negatives: boost candidates that are relevant but scored low
    - Reject candidates that are clearly wrong matches

    Returns a list of message dicts with 'role' and 'content' keys.
    """
    # Build segment context
    segment_lines = []
    for seg in prescan.segments:
        branches_str = ", ".join(seg.branches) if seg.branches else "none"
        segment_lines.append(f'- "{seg.text}" → branches: {branches_str}')
    segment_analysis = "\n".join(segment_lines)

    # Build candidate list with full context for the judge
    candidate_lines = []
    for r in ranked:
        sc = scoped_lookup.get(r.iri_hash)
        if sc is None:
            continue
        parts = [f"- **{sc.label}** (iri_hash: {r.iri_hash}, branch: {sc.branch}, current_score: {r.score})"]
        if sc.definition:
            defn = sc.definition[:250] + "..." if len(sc.definition) > 250 else sc.definition
            parts.append(f"  Definition: {defn}")
        if sc.synonyms:
            parts.append(f"  Synonyms: {', '.join(sc.synonyms[:5])}")
        if r.reasoning:
            parts.append(f"  Ranker reasoning: {r.reasoning}")
        candidate_lines.append("\n".join(parts))

    candidates_text = "\n".join(candidate_lines)

    system = (
        "You are a judge validating ontology mapping results. You will review candidates "
        "that were ranked by a previous LLM stage and assign each an independent confidence score.\n\n"
        "SCORING SCALE (use the full range — scores MUST be differentiated):\n"
        "- 90-100: Near-exact semantic match. The concept directly names or defines the input.\n"
        "- 75-89: Strong relevance. Closely related concept, correct domain and specificity.\n"
        "- 55-74: Moderate relevance. Related domain but different specificity or tangential.\n"
        "- 30-54: Weak relevance. Same broad field but clearly different concept.\n"
        "- 1-29: Very weak. Only superficial connection (e.g., shared keyword, different meaning).\n"
        "- 0: No connection at all — reject.\n\n"
        "CRITICAL: Score each candidate INDEPENDENTLY based on its semantic match to the input text. "
        "Do NOT cluster scores together. Candidates that are merely in the same legal domain as the "
        "input should score much lower than candidates that directly describe the input concept. "
        "Ignore the current_score shown — evaluate from scratch.\n\n"
        "Your goals:\n"
        "1. REDUCE FALSE POSITIVES: If a candidate has surface-level word overlap but is not "
        "semantically relevant, give it a LOW score (penalize).\n"
        "   - Watch for: shared keywords with different meanings, overly generic concepts, "
        "wrong sense of ambiguous terms.\n"
        "2. REDUCE FALSE NEGATIVES: If a candidate IS relevant but was scored low, "
        "give it a HIGH score (boost).\n"
        "   - Watch for: different terminology for the same concept, broader categories that "
        "correctly encompass the input.\n"
        "3. REJECT clearly wrong matches: Set adjusted_score to 0.\n\n"
        "For each candidate, provide:\n"
        "- adjusted_score: your independent score (0-100) using the scale above\n"
        "- verdict: \"confirmed\" (score changed <10 pts), \"boosted\" (raised 10+), "
        "\"penalized\" (lowered 10+), \"rejected\" (score=0)\n"
        "- reasoning: brief explanation\n\n"
        "Rules:\n"
        "- Score each candidate on its OWN merit. Do not give similar scores to dissimilar candidates.\n"
        "- A concept with the input term in its name but in a completely different context should "
        "score LOW (e.g., \"Enforcement of Visitation Claim\" is NOT a good match for general "
        "\"enforcement\" — it is about family law visitation, not enforcement as a concept).\n"
        "- Be strict and discriminating. The best candidate should score much higher than weak ones.\n\n"
        "Respond with ONLY valid JSON (no markdown fences) in this format:\n"
        '{"judged": [{"iri_hash": "hash", "adjusted_score": 85, "verdict": "confirmed", '
        '"reasoning": "why this judgment"}]}'
    )

    user = (
        f'Input text: "{text}"\n\n'
        f"Segment analysis:\n{segment_analysis}\n\n"
        f"Candidates to validate:\n{candidates_text}\n\n"
        "Review each candidate. Validate, boost, penalize, or reject each one."
    )

    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]
