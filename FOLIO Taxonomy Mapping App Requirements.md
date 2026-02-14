# **Product Requirements Document (PRD):**  **FOLIO Mapper**

| Field | Value |
| ----- | ----- |
| Product Name | FOLIO Mapper |
| Version | 1.2 |
| Last Updated | February 2025 |
| Status | Draft |
| Owner | ALEA Institute |

---

## **1\. Executive Summary**

### **1.1 Purpose**

Build an application that maps user-provided data (structured or plain text) to the FOLIO ontology (\~18,000 legal concepts) using semantic similarity matching. Users review candidates in a sequential workflow and export standardized mappings.

### **1.2 Deployment Targets**

* **MVP: Web App** — Hosted by nonprofit, browser-based, no installation. Built on Electron so the same codebase can later ship as a local desktop app.  
* **Future: Local Desktop App** — Downloadable Electron app for air-gapped environments, fully offline capable. Architecture supports this from day one; build-out deferred.

### **1.3 Key Value Propositions**

* Standardize legal data using the open FOLIO ontology  
* Minimize manual mapping effort with AI-assisted candidate ranking  
* Support organizations with varying technical resources and security requirements

---

## **2\. Dependencies & External Resources**

### **2.1 FOLIO Ontology**

* **Repository:** https://github.com/alea-institute/FOLIO  
* **File:** `FOLIO.owl` (\~18,000 concepts)  
* **License:** CC-BY 4.0  
* **Features:** Multilingual (10 languages), unique IRIs per concept  
* **Startup Behavior:** On launch, the system fetches the latest commit SHA from the GitHub API. If the remote SHA differs from the system's cached OWL file version, the system downloads and indexes the new `FOLIO.owl`. The system uses its local OWL file for all ontology lookups and as supplemental context for LLM reasoning.

### **2.2 folio-python Library**

* **Repository:** https://github.com/alea-institute/folio-python  
* **Install:** `pip install folio-python`  
* **Note:** This library was previously named `soli-python`. All references to `soli` map to `folio`. All IRIs use the base `https://folio.openlegalstandard.org/` (replacing the legacy `https://soli.openlegalstandard.org/`).

**Key Methods:**

from folio import FOLIO  
folio \= FOLIO()  
folio.search\_by\_prefix("Mich")  
folio.search\_by\_label("Michigan", threshold=0.6)  
folio.get\_areas\_of\_law(max\_depth=2)  
folio.get\_player\_actors(max\_depth=2)  
await folio.parallel\_search\_by\_llm(term, search\_sets=\[...\])  
owl\_class \= folio\["R8pNPutX0TN6DlEqkyZuxSw"\]  
owl\_class.label, owl\_class.definition, owl\_class.examples  
owl\_class.to\_jsonld(), owl\_class.to\_markdown()

**Accessing class metadata:**

result, score \= folio.search\_by\_label("southern district new york")\[0\]  
print(f"{result.iri} (Score: {score})")  
print(f"Preferred Label: {result.preferred\_label}")  
print(f"Synonyms: {result.alternative\_labels}")  
print(f"Parents: {\[folio\[c\].label for c in result.sub\_class\_of\]}")

**Loading a specific version:**

\# Default: latest from GitHub  
folio \= FOLIO()

\# From a custom URL  
folio \= FOLIO(source\_type="http", http\_url="https://example.com/FOLIO.owl")

\# From a specific repo/branch  
folio \= FOLIO(github\_repo\_owner="alea-institute",  
              github\_repo\_name="FOLIO",  
              github\_repo\_branch="main")

### **2.3 FOLIO Public API**

* **Base URL:** https://folio.openlegalstandard.org  
* **Docs:** https://folio.openlegalstandard.org/docs  
* **OpenAPI:** https://folio.openlegalstandard.org/openapi.json  
* **Endpoints:** `/{iri_hash}`, `/{iri_hash}/jsonld`, `/{iri_hash}/html`, `/{iri_hash}/markdown`, `/{iri_hash}/xml`  
* **Features:** Open CORS, no authentication required

### **2.4 Integration Strategy**

| Environment | Primary Source | Fallback |
| ----- | ----- | ----- |
| Web (hosted, MVP) | FOLIO API \+ cached OWL | CDN-cached shards |
| Local (future) | Bundled folio-python \+ local OWL | Local OWL file |

---

## **3\. Functional Requirements**

### **3.1 Data Input**

#### **FR-3.1.1 File Upload**

* Accept Excel (.xlsx), CSV, TSV files  
* Accept plain text files (.txt, .md)  
* Parse columns/headers from structured data  
* Auto-detect file type

#### **FR-3.1.2 Hierarchical CSV/Excel Detection**

Tabular inputs sometimes express hierarchy through indentation across columns:

Row 1:  Col A: "Litigation"        Col B: (blank)              Col C: (blank)  
Row 2:  Col A: (blank)             Col B: "Class Action"       Col C: (blank)  
Row 3:  Col A: (blank)             Col B: (blank)              Col C: "Securities"

The system must detect and handle both patterns:

* **Hierarchical layout:** Blank cells in leading columns signal parent-child nesting. The system reconstructs the tree: `Litigation > Class Action > Securities`.  
* **Flat layout:** All items in a single column with no blank-cell indentation. Each row stands alone.

**Detection logic:**

1. Scan the first 20 rows for the blank-cell indentation pattern.  
2. If ≥3 rows show progressive blank-leading-columns, treat the file as hierarchical.  
3. Present the detected hierarchy to the user for confirmation before mapping.  
4. Map each leaf node individually, carrying its ancestry as context for the LLM.

#### **FR-3.1.3 Direct Text Entry**

* Text box for typing or pasting  
* Single item: one concept to map  
* Multiple items: one concept per line (auto-detected via line breaks)  
* No mode selection required — system auto-detects input type

#### **FR-3.1.4 Input Interface**

┌─────────────────────────────────────────────────────────────────┐  
│  ENTER YOUR DATA                                                │  
│  ┌─────────────────────────────────────────────────────────┐    │  
│  │ Type or paste text here...                              │    │  
│  └─────────────────────────────────────────────────────────┘    │  
│  — or drag & drop a file —                                      │  
│  Supports: Excel (.xlsx), CSV, TSV, TXT, Markdown               │  
└─────────────────────────────────────────────────────────────────┘

#### **FR-3.1.5 Input Confirmation**

┌─────────────────────────────────────────────────────────────────┐  
│  ✓ Detected: 4 items (one per line)                             │  
│  1\. Agency investigation and/or enforcement                     │  
│  2\. Contract negotiation                                        │  
│  3\. Mergers and acquisitions                                    │  
│  4\. Intellectual property licensing                             │  
│  \[Edit\] \[Continue →\]                                            │  
└─────────────────────────────────────────────────────────────────┘

For hierarchical CSV inputs:

┌─────────────────────────────────────────────────────────────────┐  
│  ✓ Detected: Hierarchical structure (3 levels)                  │  
│  ▼ Litigation                                                   │  
│    ▼ Class Action                                               │  
│      · Securities                                               │  
│      · Employment                                               │  
│    ▼ Commercial                                                 │  
│      · Breach of Contract                                       │  
│  ▼ Transactional                                                │  
│    · Mergers & Acquisitions                                     │  
│  \[Treat as flat list instead\] \[Edit\] \[Continue →\]               │  
└─────────────────────────────────────────────────────────────────┘

---

### **3.2 Five-Stage Mapping Pipeline**

#### **Core Concept: One-to-Many Mapping**

A single input term often maps to MULTIPLE ontology concepts. The system must identify ALL relevant concepts, not just the single "best" match.

**Example:**

INPUT: "Agency investigation and/or enforcement"

OUTPUT MAPPINGS (4 concepts):  
┌────────────────────────┬─────────────────────────────────────────┐  
│ FOLIO Concept          │ Reasoning                               │  
├────────────────────────┼─────────────────────────────────────────┤  
│ Regulator              │ "Agency" → governmental regulatory body │  
│ Regulatory Service     │ Legal work with agencies \= service type │  
│ Regulatory Investigation│ "investigation" → specific service     │  
│ Regulatory Enforcement │ "enforcement" → specific service        │  
└────────────────────────┴─────────────────────────────────────────┘

---

#### **FR-3.2.0 Stage 0: Branch Pre-Scan (LLM Call, \~1K tokens)**

**Purpose:** Before any node-level matching, the system calls an LLM to segment the input into words or compound words and tag each segment with one or more FOLIO top-level branches. This pre-scan narrows all downstream searches.

**FOLIO Top-Level Branches (25 branches):**

| \# | Branch | Color (hex) | Example Concepts |
| ----- | ----- | ----- | ----- |
| 1 | Actor / Player | \#2E86C1 (Cerulean) | Regulator, Court, Law Firm, Client |
| 2 | Area of Law | \#1A5276 (Dark Navy) | Tax Law, IP Law, Environmental Law |
| 3 | Asset Type | \#D4AC0D (Gold) | Real Property, Intellectual Property |
| 4 | Communication Modality | \#AF7AC5 (Orchid) | Email, Letter, Filing |
| 5 | Currency | \#F39C12 (Amber) | USD, EUR, GBP |
| 6 | Data Format | \#85929E (Slate) | PDF, XML, JSON |
| 7 | Document / Artifact | \#E67E22 (Tangerine) | Contract, Brief, Regulation |
| 8 | Engagement Attributes | \#2ECC71 (Emerald) | Billing Rate, Matter Type |
| 9 | Event | \#E74C3C (Crimson) | Filing Deadline, Hearing, Trial |
| 10 | Financial Concepts and Metrics | \#F1C40F (Sunflower) | Revenue, Liability, Damages |
| 11 | Forums and Venues | \#8E44AD (Purple) | Federal Court, Arbitration Panel |
| 12 | Governmental Body | \#3498DB (Cornflower) | Legislature, Agency, Commission |
| 13 | Industry and Market | \#1ABC9C (Teal) | Healthcare, Financial Services |
| 14 | Language | \#D35400 (Burnt Orange) | English, Spanish, Mandarin |
| 15 | Legal Authorities | \#C0392B (Firebrick) | Statute, Case Law, Regulation |
| 16 | Legal Entity | \#27AE60 (Green) | Corporation, Trust, Partnership |
| 17 | Legal Use Cases | \#2980B9 (Steel Blue) | Compliance, Litigation Hold |
| 18 | Location | \#16A085 (Sea Green) | Jurisdiction, State, Country |
| 19 | Matter Narrative | \#7D3C98 (Plum) | Case Summary, Matter Description |
| 20 | Objectives | \#CB4335 (Dark Red) | Damages, Injunction, Enforcement |
| 21 | Service | \#138D75 (Jade) | Advisory, Regulatory, Transactional |
| 22 | Standards Compatibility | \#5D6D7E (Cool Gray) | UTBMS, LEDES, SALI/FOLIO |
| 23 | Status | \#CA6F1E (Copper) | Pending, Active, Closed |
| 24 | System Identifiers | \#7F8C8D (Ash) | IRI, UUID, Matter Number |
| 25 | Currency | \#F39C12 (Amber) | USD, EUR, GBP |

Each branch color maximizes visual distinction: warm/cool alternation, hue separation, and luminance contrast prevent confusion between neighbors (e.g., Teal vs. Green vs. Blue each occupy distinct hue-luminance zones).

**Input/Output Contract:**

INPUT:  "Agency investigation and/or enforcement"

LLM OUTPUT (structured):  
{  
  "input": "Agency investigation and/or enforcement",  
  "segments": \[  
    {  
      "text": "Agency",  
      "branches": \["Actor / Player", "Governmental Body"\],  
      "reasoning": "Regulatory agency \= institutional actor and government body"  
    },  
    {  
      "text": "investigation",  
      "branches": \["Service"\],  
      "reasoning": "Investigation as a type of legal service"  
    },  
    {  
      "text": "and/or",  
      "branches": \[\],  
      "reasoning": "Conjunction — no FOLIO branch"  
    },  
    {  
      "text": "enforcement",  
      "branches": \["Service", "Objectives"\],  
      "reasoning": "Enforcement as regulatory service and as a litigation objective"  
    }  
  \]  
}

**Span Representation:**

\<Actor/Player\>\<GovernmentalBody\>Agency\</GovernmentalBody\>\</Actor/Player\>  
\<Service\>investigation\</Service\>  
and/or  
\<Service\>\<Objectives\>enforcement\</Objectives\>\</Service\>

Segments can carry multiple branch tags. The system treats these as overlapping annotations.

**Compound Word Detection:**

The LLM groups multi-word units that function as a single legal concept:

INPUT:  "Intellectual property licensing"

SEGMENTS:  
  "Intellectual property" → \[Area of Law, Asset Type\]  
  "licensing"            → \[Service\]

**Prompt Template:**

You are a legal ontology expert analyzing legal terminology against the  
FOLIO ontology's top-level branch structure.

FOLIO TOP-LEVEL BRANCHES:  
\- Actor / Player (e.g., Regulator, Court, Law Firm, Client)  
\- Area of Law (e.g., Tax Law, Environmental Law, IP Law)  
\- Asset Type (e.g., Real Property, Intellectual Property)  
\- Communication Modality (e.g., Email, Letter, Filing)  
\- Currency (e.g., USD, EUR, GBP)  
\- Data Format (e.g., PDF, XML, JSON)  
\- Document / Artifact (e.g., Contract, Brief, Regulation)  
\- Engagement Attributes (e.g., Billing Rate, Matter Type)  
\- Event (e.g., Filing Deadline, Hearing, Trial)  
\- Financial Concepts and Metrics (e.g., Revenue, Damages)  
\- Forums and Venues (e.g., Federal Court, Arbitration Panel)  
\- Governmental Body (e.g., Legislature, Agency, Commission)  
\- Industry and Market (e.g., Healthcare, Financial Services)  
\- Language (e.g., English, Spanish, Mandarin)  
\- Legal Authorities (e.g., Statute, Case Law, Regulation)  
\- Legal Entity (e.g., Corporation, Trust, Partnership)  
\- Legal Use Cases (e.g., Compliance, Litigation Hold)  
\- Location (e.g., Jurisdiction, State, Country)  
\- Matter Narrative (e.g., Case Summary, Matter Description)  
\- Objectives (e.g., Damages, Injunction, Enforcement)  
\- Service (e.g., Advisory, Regulatory, Transactional)  
\- Standards Compatibility (e.g., UTBMS, LEDES, SALI/FOLIO)  
\- Status (e.g., Pending, Active, Closed)  
\- System Identifiers (e.g., IRI, UUID, Matter Number)

FULL INPUT: "{full\_input\_text}"

TASK:  
1\. Segment the input into individual words or compound words that  
   function as single legal concepts.  
2\. For EACH segment, identify which FOLIO top-level branch(es) apply.  
3\. Use the FULL INPUT as context — surrounding words clarify each  
   segment's meaning.  
4\. A segment may belong to zero branches (conjunctions, prepositions)  
   or multiple branches (ambiguous legal terms).

OUTPUT FORMAT (JSON):  
{  
  "segments": \[  
    {  
      "text": "word or compound word",  
      "branches": \["Branch1", "Branch2"\],  
      "reasoning": "Brief explanation"  
    }  
  \]  
}

GUIDELINES:  
\- Group compound legal terms (e.g., "intellectual property" \= one segment)  
\- Tag function words (and, or, of, for) with empty branches  
\- Err toward inclusion: if a branch might apply, include it  
\- Use the full input to disambiguate

**Implementation:**

async def stage0\_branch\_prescan(input\_term: str) \-\> BranchScanResult:  
    prompt \= build\_prescan\_prompt(input\_term)  
    response \= await llm.complete(prompt, max\_tokens=500)  
    scan\_result \= parse\_prescan\_response(response)

    branch\_map \= defaultdict(list)  
    for segment in scan\_result.segments:  
        for branch in segment.branches:  
            branch\_map\[branch\].append(segment.text)

    return BranchScanResult(  
        segments=scan\_result.segments,  
        branch\_map=branch\_map,  
        input\_term=input\_term  
    )

**Token Budget:** \~500–1,000 tokens per input.

---

#### **FR-3.2.1 Stage 1: Branch-Scoped Pre-Filter (Zero LLM Tokens)**

Use `folio-python` local search methods, scoped by branch tags from Stage 0:

candidates \= set()

for segment in prescan.segments:  
    for branch in segment.branches:  
        branch\_classes \= folio.get\_branch\_classes(branch, max\_depth=4)  
        candidates |= set(folio.search\_by\_prefix(  
            segment.text, within=branch\_classes))  
        candidates |= set(folio.search\_by\_label(  
            segment.text, threshold=0.5, within=branch\_classes))  
        for syn in get\_synonyms(segment.text):  
            candidates |= set(folio.search\_by\_label(  
                syn, threshold=0.5, within=branch\_classes))

    for candidate in candidates:  
        candidate.source\_segment \= segment.text  
        candidate.source\_branches \= segment.branches

**Fallback:** If branch-scoped search returns \< 5 candidates for any segment, broaden to parent branches or run an unscoped search.

---

#### **FR-3.2.2 Stage 2: Scoped LLM Matching (\~2K tokens)**

The LLM receives branch tags, the full input context, and candidates organized by branch. It identifies the best-matching FOLIO concepts within each tagged branch.

search\_sets \= \[\]  
for branch in prescan.branch\_map.keys():  
    search\_sets.append(folio.get\_branch\_classes(branch, max\_depth=2))

results \= await folio.parallel\_search\_by\_llm(  
    term,  
    search\_sets=search\_sets,  
    prompt\_template=BRANCH\_AWARE\_SEARCH\_PROMPT,  
    branch\_context=prescan.segments  
)

---

#### **FR-3.2.3 Stage 3: Enriched Context Scoring (\~4K tokens)**

**How Confidence Scores Work:**

The system's LLM examines BOTH the entire input context AND each proposed output match's complete metadata — definitions (`skos:definition`), synonyms (`skos:altLabel`), translations, examples (`skos:example`), hierarchy path, and scope notes — to assign a confidence score from 0 (worst match) to 100 (best match).

This dual examination ensures confidence reflects semantic alignment between the input's meaning-in-context and the candidate concept's full ontological definition, not just surface-level label similarity.

For top 10 candidates, the system fetches full metadata from the OWL file:

owl\_class \= folio\[candidate.iri\]  
context \= {  
    "l": owl\_class.label,  
    "d": owl\_class.definition,        \# skos:definition  
    "s": owl\_class.alt\_labels,         \# skos:altLabel (synonyms)  
    "e": owl\_class.examples,           \# skos:example  
    "n": owl\_class.scope\_notes,        \# skos:scopeNote  
    "t": owl\_class.translations,       \# skos:altLabel by language  
    "P": \[p.label for p in folio.get\_parent\_classes(owl\_class)\],  
    "B": candidate.source\_branches  
}

**Scoring Criteria:**

| Score | Meaning |
| ----- | ----- |
| 90–100 | Direct, unambiguous match: the candidate's definition and examples align precisely with the input segment's meaning in context |
| 75–89 | Strong semantic alignment with minor inference required |
| 60–74 | Reasonable match requiring interpretation; the candidate captures the concept but imprecisely |
| 45–59 | Weak but defensible connection |
| \<45 | Poor match, likely false positive |

---

#### **FR-3.2.4 Stage 4: LLM Judge Validation (\~2K tokens)**

The judge validates each mapping, checks branch coverage, and triggers fallback searches for uncovered segments or branches. It can issue four verdicts: `VALID`, `INVALID`, `PARTIAL`, or `WRONG_BRANCH`.

async def stage4\_judge\_validation(  
    input\_term: str,  
    prescan: BranchScanResult,  
    candidates: list\[Candidate\]  
) \-\> JudgeResult:  
    judge\_prompt \= build\_branch\_aware\_judge\_prompt(  
        input\_term, prescan, candidates)  
    judge\_response \= await llm.complete(judge\_prompt)

    validated\_candidates \= \[\]

    for candidate in candidates:  
        verdict \= judge\_response.validations\[candidate.iri\]  
        if verdict.verdict \== "VALID":  
            validated\_candidates.append(candidate)  
        elif verdict.verdict \== "PARTIAL":  
            candidate.confidence \*= 0.8  
            candidate.notes \= verdict.explanation  
            validated\_candidates.append(candidate)  
        elif verdict.verdict \== "WRONG\_BRANCH":  
            candidate.branch \= verdict.correct\_branch  
            validated\_candidates.append(candidate)  
        elif verdict.verdict \== "INVALID":  
            log\_invalid\_mapping(input\_term, candidate, verdict.explanation)

    \# Branch coverage fallback  
    for branch, status in judge\_response.branch\_coverage.items():  
        if not status.covered:  
            fallback \= await search\_within\_branch(input\_term, branch, prescan)  
            validated\_candidates.extend(fallback)

    return validated\_candidates

---

#### **FR-3.2.5 Token Budget**

| Operation | Max Tokens | Method |
| ----- | ----- | ----- |
| Stage 0 (Branch Pre-Scan) | \~1,000 | LLM structured output |
| Stage 1 (Branch-Scoped Pre-Filter) | 0 | folio-python local |
| Stage 2 (Scoped LLM Matching) | \~2,000 | parallel\_search\_by\_llm |
| Stage 3 (Enriched Context Scoring) | \~4,000 | 10 candidates \+ full context |
| Stage 4 (Judge Validation) | \~2,000 | validation \+ coverage \+ fallback |
| **Total per input** | **\~9,000** |  |
| Batch (10 inputs) | \~90,000 | Parallelizable |

#### **FR-3.2.6 Symbolic Compression**

Use shorthand keys in LLM prompts:

* `l` \= label, `d` \= definition, `s` \= synonyms, `e` \= examples  
* `p` \= parent, `P` \= full path, `i` \= IRI hash  
* `C` \= confidence, `R` \= reasoning  
* `V` \= verdict (VALID/INVALID/PARTIAL/WRONG\_BRANCH), `J` \= judge explanation  
* `M` \= matched segment, `B` \= branch tag, `K` \= coverage status

#### **FR-3.2.7 Pipeline Flow Diagram**

┌─────────────────────────────────────────────────────────────────┐  
│ INPUT: "Agency investigation and/or enforcement"                │  
├─────────────────────────────────────────────────────────────────┤  
│ STAGE 0: Branch Pre-Scan (LLM, \~1K tokens)                     │  
│   "Agency" → \[Actor/Player, Governmental Body\]                  │  
│   "investigation" → \[Service\]                                   │  
│   "enforcement" → \[Service, Objectives\]                         │  
├─────────────────────────────────────────────────────────────────┤  
│ STAGE 1: Branch-scoped pre-filter (folio-python, 0 tokens)     │  
│   Search each segment within its tagged branches only           │  
│   → 30–60 branch-scoped candidates                              │  
├─────────────────────────────────────────────────────────────────┤  
│ STAGE 2: Branch-aware LLM matching (\~2K tokens)                 │  
│   Full input context \+ branch tags → focused matching           │  
│   → 10–20 ranked candidates with segment \+ branch attribution   │  
├─────────────────────────────────────────────────────────────────┤  
│ STAGE 3: Enriched context scoring (\~4K tokens)                  │  
│   LLM examines input context \+ each candidate's full metadata   │  
│   (definition, synonyms, examples, translations, hierarchy)     │  
│   → Confidence 0–100 per candidate \+ coverage report            │  
├─────────────────────────────────────────────────────────────────┤  
│ STAGE 4: LLM Judge validation (\~2K tokens)                      │  
│   Validate mappings · Check branch \+ segment coverage           │  
│   Fallback searches for gaps · Final validated set              │  
├─────────────────────────────────────────────────────────────────┤  
│ OUTPUT: Validated, branch-attributed mappings                    │  
│   Regulator (85%, Actor) \+ Reg. Service (78%, Service) \+        │  
│   Reg. Investigation (92%, Service) \+                           │  
│   Reg. Enforcement (94%, Service)                               │  
└─────────────────────────────────────────────────────────────────┘

---

### **3.3 Recall Mitigation (Preventing False Negatives)**

#### **FR-3.3.1 Multi-Method Union (Branch-Scoped)**

Combine results from multiple search approaches within each tagged branch.

#### **FR-3.3.2 Synonym Expansion**

Expand input before Stage 1 using WordNet synonyms, legal thesaurus (Black's Law Dictionary terms), and LLM-generated paraphrases (cached for reuse).

#### **FR-3.3.3 Fallback to Full LLM Search**

If branch-scoped Stage 1 returns \< 10 candidates for a segment, run an unscoped search.

#### **FR-3.3.4 User-Triggered Expansion**

* "Search more broadly" button → re-runs with relaxed branch constraints  
* "Search all branches" → bypasses pre-scan branch scoping  
* "Add branch" → user manually adds a branch to any segment

#### **FR-3.3.5 Confidence Floor Alert with Threshold Slider**

If the highest confidence \< 60%, display an alert with an **adjustable threshold slider**:

┌─────────────────────────────────────────────────────────────────┐  
│  ⚠ No strong matches found (best: 52%)                         │  
│  ─────────────────────────────────────────────────────────────  │  
│                                                                 │  
│  Adjust threshold to show more candidates:                      │  
│  Threshold: \[======52======\] ← drag to lower                   │  
│  Current: 70 → New: 52                                          │  
│                                                                 │  
│  Candidates now visible: 3 (was 0\)                              │  
│  ☐ Regulatory Compliance \[52%\]                                  │  
│  ☐ Administrative Process \[48%\]                                 │  
│  ☐ Enforcement Action \[45%\]                                     │  
│                                                                 │  
│  \[Apply lower threshold\]  \[Search full ontology\]                │  
│  \[Suggest new concept to ALEA\]                                  │  
└─────────────────────────────────────────────────────────────────┘

The slider updates candidate visibility in real-time. Lowering the threshold does not change the confidence scores themselves — it reveals previously hidden candidates.

#### **FR-3.3.6 Submit to ALEA (Batched)**

When no suitable match exists, users queue concepts for batch submission. See §3.9 for full details.

---

### **3.4 Sequential Node Review**

#### **FR-3.4.1 One-at-a-Time Review**

Process input nodes sequentially:

1. Display first input node with branch-tagged segments and candidate matches  
2. User reviews, adjusts selections (defaults pre-checked above threshold)  
3. User clicks "Next" to confirm and advance  
4. Repeat until all nodes reviewed

#### **FR-3.4.2 Navigation Controls**

Controls must have large click targets (minimum 44×44px touch target per WCAG) and prominent visual placement:

| Action | Button | Keyboard Shortcut | Display |
| ----- | ----- | ----- | ----- |
| Confirm & advance | **Next ▶** | `→` or `Enter` | `[Next ▶ →]` |
| Return to previous | **◀ Prev** | `←` | `[← Prev]` |
| Skip for later | **Skip** | `S` | `[Skip (S)]` |
| Jump to node | **Jump to...** | `G` then type number | `[Go to... (G)]` |
| Accept all defaults | **Accept All** | `Shift+A` | `[Accept All (⇧A)]` |
| Save session | **Save** | `Ctrl+S` / `⌘S` | `[Save (⌘S)]` |
| Toggle candidate | *(checkbox)* | `Space` on focused item | — |
| Expand/collapse tree node | *(arrow)* | `→` / `←` on tree | — |
| Select next candidate | — | `↓` / `↑` | — |

**Shortcut discoverability:** Each button label includes its keyboard shortcut in parentheses or as a subscript badge. A `?` key opens a full shortcut cheat sheet overlay.

#### **FR-3.4.3 Progress Tracking**

* Visual progress bar with percentage  
* Counter: "Node X of Y"  
* Status indicators: ✓ completed, ○ pending, ⊘ skipped, ⚠ needs attention

#### **FR-3.4.4 Bulk Actions**

* "Accept all defaults" (`Shift+A`) — Auto-confirm remaining nodes above threshold  
* "Review flagged only" — Jump to nodes with low confidence or no matches

---

### **3.5 Session Persistence (Multi-Day Review)**

#### **FR-3.5.1 Auto-Save**

* Save to browser localStorage every 30 seconds  
* Capture: selections, skipped nodes, threshold, current position, pre-scan results  
* Warn on page close if unsaved changes exist

#### **FR-3.5.2 Manual Save/Resume**

**"Save Session"** (`Ctrl+S`) exports `.folio-session.json`:

{  
  "version": "1.2",  
  "created": "2025-01-02T14:30:00Z",  
  "source\_file": "matter-types.csv",  
  "source\_hash": "sha256:abc123...",  
  "total\_nodes": 1000,  
  "completed": 347,  
  "current\_position": 348,  
  "threshold": 70,  
  "prescan\_results": {  
    "0": {  
      "segments": \[  
        {"text": "Agency", "branches": \["Actor / Player", "Governmental Body"\]}  
      \]  
    }  
  },  
  "selections": { "0": \["R8pNPutX0TN..."\] },  
  "skipped\_nodes": \[45, 89\],  
  "notes": { "45": "Need legal review" }  
}

#### **FR-3.5.3 Session Recovery UI**

┌─────────────────────────────────────────────────────────────────┐  
│  SESSION RECOVERY                                               │  
│  Found saved session from: Jan 2, 2025 2:30 PM                 │  
│  Progress: 347 of 1,000 nodes (34.7%)                          │  
│  \[Resume where I left off\]  \[Start fresh\]  \[Download session\]   │  
└─────────────────────────────────────────────────────────────────┘

---

### **3.6 Confidence Scoring**

#### **FR-3.6.1 Score Range**

0–100 scale. The score reflects how well the candidate's full ontological context (definition, synonyms, examples, translations, hierarchy) aligns with the input term's meaning within its full input context. The LLM examines both sides — input context and output match metadata — to produce the score.

#### **FR-3.6.2 Dynamic Threshold**

* Adaptive threshold based on result distribution  
* Minimum 3 candidates shown per input  
* User-adjustable via slider (real-time updates)

#### **FR-3.6.3 Visual Indicators**

| Score | Color | Label |
| ----- | ----- | ----- |
| 90–100 | Dark green (\#228B22) | Excellent match |
| 75–89 | Light green (\#90EE90) | Strong match |
| 60–74 | Yellow (\#FFD700) | Moderate match |
| 45–59 | Orange (\#FF8C00) | Weak match |
| \<45 | Light gray (\#D3D3D3) | Poor match (hidden by default) |

#### **FR-3.6.4 Default Selection**

* All candidates above threshold pre-checked  
* User accepts defaults with zero clicks  
* Threshold slider updates selections in real-time

---

### **3.7 API Key Management**

#### **FR-3.7.1 Bring Your Own Key (Default)**

* **Default mode:** User provides their own API key  
* Clear onboarding: "Enter your API key to get started"

#### **FR-3.7.2 Supported LLM Providers**

**Cloud Providers (current as of February 2026):**

| Provider | Recommended Models | API Identifier | Notes |
| ----- | ----- | ----- | ----- |
| **OpenAI** | GPT-5, GPT-5 mini, GPT-4.1, o3, o4-mini | `gpt-5`, `gpt-4.1`, `o3`, `o4-mini` | GPT-5 and GPT-5 mini succeed o3/o4-mini. GPT-4.1 excels at instruction-following and coding. |
| **Anthropic** | Claude Opus 4.6, Sonnet 4.5, Haiku 4.5 | `claude-opus-4-6`, `claude-sonnet-4-5-20250929`, `claude-haiku-4-5-20251001` | Opus 4.6 most intelligent. Sonnet 4.5 best coding/agent balance. Haiku 4.5 fastest, 1/3 Sonnet cost. |
| **Google Gemini** | Gemini 3 Pro, Gemini 2.5 Pro, Gemini 2.5 Flash | `gemini-3-pro-preview`, `gemini-2.5-pro`, `gemini-2.5-flash` | 3 Pro newest reasoning model. 2.5 Pro stable flagship. 2.5 Flash cost-optimized. |
| **Mistral AI** | Mistral Large 3, Magistral Medium, Mistral Medium 3, Mistral Small 3.1 | `mistral-large-latest`, `magistral-medium-latest`, `mistral-medium-latest`, `mistral-small-latest` | Large 3 is MoE (41B active / 675B total), Apache 2.0. Magistral \= reasoning models. |
| **Cohere** | Command A, Command A Reasoning, Command A Vision, Command R+ | `command-a-03-2025`, `command-a-reasoning`, `command-a-vision`, `command-r-plus-08-2024` | Command A strongest overall. Vision variant handles images. |
| **Meta Llama** (via API partners) | Llama 4 Scout, Llama 4 Maverick | `llama-4-scout`, `llama-4-maverick` | Scout: 10M context, single GPU. Maverick: 128 experts, 1M context. Access via AWS Bedrock, Together, etc. |

**Local/Open Source Models:**

| Backend | Models | Notes |
| ----- | ----- | ----- |
| Ollama | Llama 4 Scout, Mistral Small 3.1, Ministral 3, Qwen | Recommended for ease |
| LM Studio | Any GGUF model | OpenAI-compatible API |
| llama.cpp | Any GGUF model | Direct server |
| vLLM | Any HuggingFace model | High throughput |
| Custom | Any | OpenAI-compatible endpoint |

**Dynamic Model Discovery:** The system should query each provider's model list endpoint on settings page load to show currently available models. This ensures new models appear without a code update.

| Provider | Model List Endpoint |
| ----- | ----- |
| OpenAI | `GET https://api.openai.com/v1/models` |
| Anthropic | Hard-coded list (no public list endpoint) |
| Google Gemini | `GET https://generativelanguage.googleapis.com/v1beta/models` |
| Mistral AI | `GET https://api.mistral.ai/v1/models` |
| Cohere | `GET https://api.cohere.com/v2/models` |
| Meta Llama | `GET https://api.llama.com/v1/models` |

#### **FR-3.7.3 Modular LLM Architecture**

abstract class LLMProvider {  
  abstract complete(prompt: string, options: LLMOptions): Promise\<LLMResponse\>;  
  abstract stream(prompt: string, options: LLMOptions): AsyncGenerator\<string\>;  
  abstract getTokenCount(text: string): number;  
  abstract getCostEstimate(tokens: number): number;  
  abstract listModels(): Promise\<ModelInfo\[\]\>;  
}

Implementations: `AnthropicProvider`, `OpenAIProvider`, `GoogleProvider`, `MistralProvider`, `CohereProvider`, `MetaLlamaProvider`, `OllamaProvider`, `LMStudioProvider`, `OpenAICompatibleProvider`.

#### **FR-3.7.4 API Key Storage**

* Store in browser session/localStorage (encrypted)  
* Never transmit to backend servers  
* Display masked values (e.g., `sk-...a3b9`)  
* "Test Connection" button to validate  
* Clear on logout; manual delete available

#### **FR-3.7.5 Provider Selection UI**

┌─ LLM Provider Settings ──────────────────────────────────────────┐  
│                                                                  │  
│  Active Provider: \[Anthropic Claude ▼\]                           │  
│                                                                  │  
│  ┌─ Cloud Providers ───────────────────────────────────────────┐ │  
│  │ ● Anthropic Claude   API Key: \[••••••••••\] \[Test\] ✓ Valid   │ │  
│  │   Model: \[claude-sonnet-4-5-20250929 ▼\]                     │ │  
│  │ ○ OpenAI             API Key: \[          \] \[Test\]           │ │  
│  │ ○ Google Gemini      API Key: \[          \] \[Test\]           │ │  
│  │ ○ Mistral AI         API Key: \[          \] \[Test\]           │ │  
│  │ ○ Cohere             API Key: \[          \] \[Test\]           │ │  
│  │ ○ Meta Llama         API Key: \[          \] \[Test\]           │ │  
│  └─────────────────────────────────────────────────────────────┘ │  
│                                                                  │  
│  ┌─ Local Models ──────────────────────────────────────────────┐ │  
│  │ ○ Ollama             URL: \[http://localhost:11434\]          │ │  
│  │                      Model: \[llama4-scout ▼\]   \[Test\]       │ │  
│  │ ○ LM Studio          URL: \[http://localhost:1234/v1\]        │ │  
│  │ ○ Custom Endpoint    URL: \[                        \]        │ │  
│  └─────────────────────────────────────────────────────────────┘ │  
│                                                                  │  
│  Estimated cost: \~$0.003 per input node                          │  
│  \[Save Settings\]                                                 │  
└──────────────────────────────────────────────────────────────────┘

#### **FR-3.7.6 Cost Transparency**

* Show estimated tokens before processing  
* Display running cost during batch operations  
* Post-processing summary with actual usage

---

### **3.8 Export**

#### **FR-3.8.1 Data Formats**

CSV, Excel (.xlsx), JSON, RDF/Turtle, JSON-LD

#### **FR-3.8.2 Human-Readable Formats**

* **HTML report:** Styled document with hierarchy, color-coded confidence, branch tags  
* **Interactive webapp:** Single-file HTML with expandable trees, search, branch filters  
* **Markdown:** Clean document for GitHub, wikis  
* **PDF:** Print-ready report

#### **FR-3.8.3 Export Columns**

* Original source columns (preserving hierarchy if detected)  
* Label  
* IRI (compact hash and/or full URL — user choice)  
* Branch (from pre-scan)  
* Matched Segment  
* Confidence (optional)  
* Notes (optional)  
* Reasoning (optional)

#### **FR-3.8.4 Translation Columns**

* Include `skos:altLabel` translations  
* User selects languages  
* Column format: `Label (Español)`, `Label (Français)`, `Label (Deutsch)`, etc.

#### **FR-3.8.5 Supported Languages**

| Code | Native Name |
| ----- | ----- |
| en | English |
| es | Español |
| fr | Français |
| de | Deutsch |
| zh | 中文 |
| ja | 日本語 |
| pt | Português |
| ar | العربية |
| ru | Русский |
| hi | हिन्दी |

---

### **3.9 Submit Missing Concepts to ALEA (Batched)**

#### **FR-3.9.1 Trigger**

* "Suggest new concept" button when no suitable match exists  
* Adds concept to session queue (not immediate submission)

#### **FR-3.9.2 Queue Management**

* Users add/remove concepts from queue during session  
* Queue visible in sidebar or footer panel  
* Queue persists in session file

#### **FR-3.9.3 Batched Submission**

All queued concepts submit as ONE GitHub Issue on export. Max 1 batch per session.

#### **FR-3.9.4 GitHub Issue Format — Comprehensive Metadata**

Each suggested concept must include everything ALEA needs to implement it directly:

Title: \[Concept Requests\] Batch from FOLIO Mapper session {uuid}

\#\# Summary  
{N} concept requests from FOLIO Mapper.  
Session: {uuid} · Submitted: {timestamp}

\---

\#\# Requested Concepts

\#\#\# 1\. Legal Operations Analytics  
\- \*\*Suggested \`rdfs:label\`:\*\* Legal Operations Analytics  
\- \*\*Suggested \`skos:definition\`:\*\* Analytics tools and metrics for  
  measuring legal department operational performance  
\- \*\*Suggested \`skos:altLabel\` (synonyms):\*\* LegalOps Analytics,  
  Legal Ops Metrics, Legal Department Analytics  
\- \*\*Suggested \`skos:example\`:\*\* "Tracking cycle time for contract  
  review across a legal department"  
\- \*\*Suggested parent class:\*\* Service  
\- \*\*Suggested branch:\*\* Service  
\- \*\*Suggested IRI pattern:\*\* (ALEA to assign)  
\- \*\*Nearest existing FOLIO concepts:\*\*  
  \- \`folio:R8pNPutX...\` (Legal Service, score: 45%)  
  \- \`folio:R3qMNutX...\` (Advisory Service, score: 38%)  
\- \*\*Use case:\*\* Mapping internal legal ops taxonomy from Clio  
\- \*\*Original input term:\*\* "LegalOps analytics and reporting"  
\- \*\*Full input context:\*\* "LegalOps analytics and reporting for  
  corporate legal departments"

\#\#\# 2\. AI Contract Review Service  
\- \*\*Suggested \`rdfs:label\`:\*\* AI Contract Review Service  
\- \*\*Suggested \`skos:definition\`:\*\* Automated contract analysis and  
  review using artificial intelligence and machine learning  
\- \*\*Suggested \`skos:altLabel\`:\*\* AI-Assisted Contract Review,  
  Automated Contract Analysis, ML Contract Review  
\- \*\*Suggested \`skos:example\`:\*\* "Using NLP to extract key terms,  
  obligations, and risks from commercial contracts"  
\- \*\*Suggested parent class:\*\* Legal Service \> Contract Service  
\- \*\*Suggested branch:\*\* Service  
\- \*\*Nearest existing FOLIO concepts:\*\*  
  \- \`folio:RxYzAbCd...\` (Contract Service, score: 52%)  
\- \*\*Use case:\*\* Categorizing AI-powered legal tools  
\- \*\*Original input term:\*\* "AI-based contract review platform"

\---

\#\# Submission Metadata  
\- FOLIO Mapper version: {version}  
\- FOLIO ontology version: {owl\_commit\_sha}  
\- Total items in session: {total\_nodes}  
\- Items without matches: {no\_match\_count}  
\- LLM provider used: {provider\_name}  
\- LLM model used: {model\_name}

#### **FR-3.9.5 Submission Methods**

1. **Automatic (with PAT):** User provides GitHub Personal Access Token  
2. **Manual:** Generate issue body, open GitHub in browser for user to submit

#### **FR-3.9.6 Alternative**

Link to FOLIO community forum: https://discourse.openlegalstandard.org

---

## **4\. User Interface Requirements**

### **4.1 Main Layout Structure**

┌──────────────────────────────────────────────────────────────────┐  
│  HEADER: Source | \[Claude Sonnet 4.5 ▼\] | \[Settings ⚙\] | \[? ⌨\] │  
│  ┌─ Options ─────────────────────────────────────────────────┐   │  
│  │ ☐ Show translations  \[Español ▼\] \[Français ▼\]             │   │  
│  │ ☐ Show full IRIs  ☐ Show branch tags                      │   │  
│  └───────────────────────────────────────────────────────────┘   │  
├──────────────────────────────────────────────────────────────────┤  
│  NODE: 3 of 47     \[← Prev\] \[Next → ⏎\] \[Skip (S)\] \[Go to (G)\]  │  
│  ██████░░░░░░░░░░░░░░ 6%      \[Save (⌘S)\] \[Accept All (⇧A)\]     │  
├─────────────────────────────┬────────────────────────────────────┤  
│                             │                                    │  
│   CANDIDATE TREE (LEFT)     │   INPUT & CONTEXT (RIGHT)          │  
│                             │                                    │  
│   ┌─ Branch Filter ───────┐ │   ┌─ YOUR INPUT ───────────────┐   │  
│   │ ☑ Actor/Player        │ │   │ \[Agency\]  \[investigation\]   │   │  
│   │ ☑ Service             │ │   │ \[and/or\]  \[enforcement\]    │   │  
│   │ ☑ Governmental Body   │ │   └────────────────────────────┘   │  
│   │ ☐ Objectives          │ │                                    │  
│   └───────────────────────┘ │   ┌─ PRE-SCAN TAGS ────────────┐   │  
│                             │   │ Agency → Actor, Gov. Body   │   │  
│   ▼ Actor / Player          │   │ investigation → Service     │   │  
│     └─☑ Regulator \[85\]     │   │ enforcement → Svc, Obj.     │   │  
│   ▼ Service                 │   └────────────────────────────┘   │  
│     ├─☑ Reg. Investigation  │                                    │  
│     │   \[92\]                │   Selected: Regulator              │  
│     └─☑ Reg. Enforcement    │   Branch: Actor / Player           │  
│         \[94\]                │   IRI: R8pNPutX0TN... \[▸ expand\]   │  
│                             │   Definition: ...                  │  
│   \[Select All\] \[Clear\]      │   Synonyms: ...                    │  
│   Threshold: \[====70====\]   │                                    │  
│                             │   Word → Mapping Attribution:      │  
│   ┌─────────────────────┐   │   • "enforcement" → Reg.           │  
│   │ \[Suggest to ALEA\]   │   │     Enforcement (94%, Service)    │  
│   └─────────────────────┘   │   • "investigation" → Reg.         │  
│                             │     Investigation (92%, Service)   │  
├─────────────────────────────┴────────────────────────────────────┤  
│  FOOTER: 4 selected | \[Export CSV ▼\] \[Export\]                    │  
│  Branches: 3/4 · Segments: 3/3 · \[Accept all defaults (⇧A)\]     │  
└──────────────────────────────────────────────────────────────────┘

### **4.2 Keyboard Shortcut Overlay**

Press `?` to toggle:

┌─ Keyboard Shortcuts ─────────────────────────────────────────────┐  
│                                                                  │  
│  Navigation                     Selection                        │  
│  → or Enter    Next node        Space    Toggle candidate        │  
│  ←             Previous node    ↑ / ↓    Move through list       │  
│  S             Skip node        Shift+A  Accept all defaults     │  
│  G             Go to node \#                                      │  
│                                                                  │  
│  General                                                         │  
│  Ctrl/⌘+S     Save session     ?        Toggle this help        │  
│  Ctrl/⌘+E     Export           Esc      Close panel/overlay     │  
│                                                                  │  
└──────────────────────────────────────────────────────────────────┘

### **4.3 Branch Color Coding**

Each of the 25 FOLIO branches carries a unique, maximally distinct color. See the table in §FR-3.2.0. Colors accompany text labels everywhere — no color-only indicators.

### **4.4 IRI Display (Compact with Expand)**

* Default: `R8pNPutX0TN6DlEqkyZuxSw [▸]`  
* Expanded: `https://folio.openlegalstandard.org/R8pNPutX0TN6DlEqkyZuxSw [▾] [copy]`  
* Tooltip on hover shows full IRI

### **4.5 Accessibility**

* Color-blind safe indicators (icons \+ text labels alongside colors)  
* Full keyboard navigation (see §4.2)  
* WCAG 2.1 AA compliance  
* Minimum 44×44px touch targets on all interactive elements

---

## **5\. Non-Functional Requirements**

### **5.1 Performance**

* Stage 0 branch pre-scan: \< 2 seconds  
* Stage 1 pre-filter: \< 100ms  
* Stage 2 LLM call: \< 3 seconds  
* Stage 3 enrichment: \< 2 seconds  
* UI interactions: \< 50ms response

### **5.2 Scalability**

* Support datasets up to 10,000 input nodes  
* Batch processing with progress indicators  
* Pause/resume for large batches

### **5.3 Security**

* API keys stored in browser session only (encrypted)  
* No server-side persistence of user data  
* Clear keys on session end

### **5.4 Reliability**

* Graceful fallback when API unavailable  
* Auto-save every 30 seconds  
* Session recovery on page reload

---

## **6\. Technical Architecture**

### **6.1 Design Principles**

1. **Electron-based:** Single codebase serves both web (MVP) and future desktop  
2. **Web-first MVP:** Deploy as hosted web app; desktop packaging deferred  
3. **Desktop-ready architecture:** Abstract data sources and LLM providers so the Electron desktop build requires only configuration changes, not rewrites  
4. **Modular LLM layer:** Easy provider switching via abstract `LLMProvider` interface  
5. **Branch-first pipeline:** Pre-scan drives all downstream search scoping

### **6.2 Codebase Structure**

/folio-mapper  
  /packages  
    /core                    \# Shared business logic  
      /llm  
        /providers  
          anthropic.ts  
          openai.ts  
          google.ts  
          mistral.ts  
          cohere.ts  
          meta-llama.ts  
          ollama.ts  
          lmstudio.ts  
          base.ts            \# Abstract LLMProvider interface  
          registry.ts        \# Provider registration & model discovery  
        /prompts             \# Prompt templates (incl. pre-scan)  
      /folio                 \# FOLIO ontology integration  
        branches.ts          \# Branch definitions, colors, mappings  
        owl-loader.ts        \# OWL file loading, caching, versioning  
        owl-updater.ts       \# GitHub version check & update logic  
      /mapping               \# Semantic matching pipeline  
        prescan.ts           \# Stage 0: Branch pre-scan  
        prefilter.ts         \# Stage 1: Branch-scoped pre-filter  
        scoped-match.ts      \# Stage 2: Branch-aware LLM matching  
        enriched-score.ts    \# Stage 3: Context scoring  
        judge.ts             \# Stage 4: Judge validation  
      /input                 \# Input parsing  
        csv-hierarchy.ts     \# Hierarchical CSV detection  
        file-parser.ts       \# Excel, CSV, TSV, TXT parsing  
      /session               \# Session persistence logic  
      /export                \# Export formatters  
      /github                \# GitHub issue submission  
    /ui                      \# Shared UI components (React)  
      /branch-tags           \# Branch badge and filter components  
      /shortcuts             \# Keyboard shortcut system  
    /web                     \# Web-specific adapters  
    /desktop                 \# Desktop-specific adapters (Electron)  
  /apps  
    /web                     \# Hosted web app entry point  
    /desktop                 \# Desktop app entry point (future)

### **6.3 Electron Architecture**

**MVP (Web):** The React frontend deploys as a standard web application. The Electron shell wraps the same React app for future desktop distribution.

**Future (Desktop):** Package the same codebase into an Electron app that bundles:

* Embedded Python runtime with folio-python (via child process or WASM)  
* SQLite for local storage  
* (Optional) Bundled Ollama \+ default model

**Abstraction Layer:**

interface FOLIODataSource {  
  getClass(iriHash: string): Promise\<OWLClass\>;  
  search(query: string, options: SearchOptions): Promise\<OWLClass\[\]\>;  
  getSubclasses(iriHash: string, depth: number): Promise\<OWLClass\[\]\>;  
  getBranchClasses(branch: string, depth: number): Promise\<OWLClass\[\]\>;  
}

// Web MVP: remote API \+ cached OWL  
class RemoteFOLIODataSource implements FOLIODataSource { ... }

// Future desktop: bundled local files  
class LocalFOLIODataSource implements FOLIODataSource { ... }

const dataSource: FOLIODataSource \= config.isLocal  
  ? new LocalFOLIODataSource()  
  : new RemoteFOLIODataSource();

### **6.4 OWL File Version Management**

On startup:

async def check\_and\_update\_owl():  
    response \= await fetch(  
        "https://api.github.com/repos/alea-institute/FOLIO/commits/main",  
        headers={"Accept": "application/vnd.github.v3+json"}  
    )  
    latest\_sha \= response.json()\["sha"\]

    if latest\_sha \!= cached\_version\["commit\_sha"\]:  
        \# Download new FOLIO.owl  
        owl\_data \= await fetch(  
            "https://raw.githubusercontent.com/alea-institute/FOLIO/main/FOLIO.owl"  
        )  
        \# Save, index, update version metadata  
        await save\_and\_index(owl\_data)  
        cached\_version\["commit\_sha"\] \= latest\_sha

The system uses this local OWL data for:

* Stage 1 pre-filter searches (via folio-python)  
* Stage 3 enriched context (definitions, synonyms, examples, translations)  
* Export translations  
* Supplemental LLM context (passing OWL metadata into prompts)

### **6.5 Technology Stack**

| Layer | Web MVP | Future Desktop |
| ----- | ----- | ----- |
| Shell | N/A (hosted) | Electron |
| Frontend | React \+ TypeScript | React \+ TypeScript (same) |
| Styling | Tailwind CSS | Tailwind CSS |
| State | Zustand or Jotai | Zustand or Jotai |
| Backend | Node.js or Python (FastAPI) | Embedded (Node.js \+ Python) |
| Database | PostgreSQL or SQLite | SQLite (bundled) |
| FOLIO Data | FOLIO API \+ cached OWL | Bundled OWL file |
| LLM | Cloud APIs | Ollama (bundled) or cloud |

---

## **7\. Build Stages**

Development proceeds in gated stages. Each stage concludes with a **testing checkpoint** — the system owner (Damien) reviews and approves the stage's deliverables before the next stage begins. No stage begins until the prior stage passes acceptance testing.

### **Stage 1: Foundation & Input (Weeks 1–2)**

**Deliverables:**

* Electron project scaffold (web-deployable from day one)  
* React UI shell with Tailwind CSS  
* File upload (Excel, CSV, TSV, TXT, Markdown)  
* Hierarchical CSV detection and flat-vs-tree confirmation UI  
* Direct text entry with auto-detection  
* Input confirmation screen

**Acceptance Test:** Upload a hierarchical CSV, a flat CSV, and pasted text. Confirm correct detection, parsing, and display of all three.

---

### **Stage 2: FOLIO Integration & OWL Management (Weeks 3–4)**

**Deliverables:**

* `folio-python` integration (or TypeScript equivalent via OWL parsing)  
* GitHub-based OWL version check on startup  
* OWL download, caching, and indexing  
* FOLIO class lookup by IRI, label search, prefix search  
* Branch class enumeration (`getBranchClasses`)  
* FOLIO API integration as fallback data source

**Acceptance Test:** Launch the app. Confirm it detects the current OWL version, downloads if stale, and resolves searches against all 25 branches. Query "Michigan" and confirm results include state-level FOLIO concepts.

---

### **Stage 3: LLM Provider Layer (Weeks 5–6)**

**Deliverables:**

* Abstract `LLMProvider` interface  
* Implementations for all 6 cloud providers \+ Ollama \+ LM Studio \+ OpenAI-compatible  
* Dynamic model discovery (query provider endpoints for available models)  
* API key management UI (entry, masking, test connection, encrypted storage)  
* Provider selection UI with model dropdown  
* Cost estimation display

**Acceptance Test:** Configure at least 3 providers (e.g., Anthropic, OpenAI, Ollama). Test connection for each. Switch between providers. Confirm model list populates dynamically.

---

### **Stage 4: Mapping Pipeline — Stages 0–2 (Weeks 7–9)**

**Deliverables:**

* Stage 0: Branch Pre-Scan (LLM call, segment \+ branch tagging)  
* Stage 1: Branch-scoped pre-filter (folio-python local search)  
* Stage 2: Scoped LLM matching with branch-aware prompts  
* Pre-scan results displayed in UI (segment → branch mapping)  
* Synonym expansion integration

**Acceptance Test:** Input "Agency investigation and/or enforcement." Confirm pre-scan produces correct segment/branch tags. Confirm Stage 1 returns branch-scoped candidates. Confirm Stage 2 ranks them with scores and branch attribution.

---

### **Stage 5: Mapping Pipeline — Stages 3–4 (Weeks 10–11)**

**Deliverables:**

* Stage 3: Enriched context scoring (full OWL metadata in prompts, 0–100 confidence)  
* Stage 4: LLM Judge validation (VALID/INVALID/PARTIAL/WRONG\_BRANCH verdicts)  
* Coverage analysis (segment \+ branch coverage)  
* Fallback search for uncovered branches/segments  
* Confidence Floor Alert with adjustable threshold slider

**Acceptance Test:** Process 10 diverse legal terms. Verify confidence scores reflect examination of both input context and candidate metadata. Verify the judge catches at least one false positive and triggers at least one fallback search. Test the threshold slider at the confidence floor.

---

### **Stage 6: Sequential Review UI (Weeks 12–13)**

**Deliverables:**

* Node-by-node review interface (candidate tree \+ context panel)  
* Clickable input words with branch attribution  
* Branch filter checkboxes with color coding  
* Navigation controls with keyboard shortcuts  
* Keyboard shortcut overlay (`?`)  
* Progress bar, node counter, status indicators  
* Bulk actions (Accept All, Review Flagged Only)

**Acceptance Test:** Load a 20-item dataset. Navigate forward, backward, skip, and jump-to. Use only keyboard to complete 5 nodes. Verify all shortcuts work. Verify branch filter toggles candidate visibility.

---

### **Stage 7: Session Persistence & Export (Weeks 14–15)**

**Deliverables:**

* Auto-save to localStorage (every 30 seconds)  
* Manual save/resume (.folio-session.json)  
* Session recovery UI on reload  
* Export: CSV, Excel, JSON, RDF/Turtle, JSON-LD, Markdown, HTML report, PDF  
* Export includes: Branch, Matched Segment, Confidence, Translations  
* Translation column support (10 languages)

**Acceptance Test:** Start a session with 50 items. Complete 25\. Close the browser. Reopen — confirm recovery prompt and seamless resume. Export in CSV and HTML. Verify export columns include branch tags and translations.

---

### **Stage 8: ALEA Submission & Polish (Weeks 16–17)**

**Deliverables:**

* "Suggest new concept" per-node action with queue  
* Submission queue panel (sidebar/footer)  
* Batched GitHub Issue submission with comprehensive metadata (IRIs, definitions, synonyms, examples, nearest concepts)  
* Manual submission fallback (copy issue body)  
* Accessibility audit (WCAG 2.1 AA)  
* Final UI polish, loading states, error handling

**Acceptance Test:** Queue 3 new concept suggestions. Export. Confirm the GitHub Issue contains all required metadata (rdfs:label, skos:definition, skos:altLabel, skos:example, parent class, branch, nearest concepts with IRIs and scores). Verify the issue contains everything ALEA needs to implement directly.

---

## **8\. Future Enhancements**

### **8.1 Electron Desktop Packaging**

Package the web app as a downloadable Electron app with bundled Python runtime, OWL file, and optional Ollama \+ model for fully offline use.

### **8.2 Embedding-Based Pre-Filter**

Pre-compute embeddings for all 18K labels. Vector index (FAISS/Annoy for local, Pinecone for hosted). Reduces LLM calls by 60–80%.

### **8.3 FOLIO Object Properties**

Use semantic relationships to improve matching. Example: "lawyer who drafted contract" → use `folio:drafted` property.

### **8.4 Batch Optimization**

Group similar inputs before querying. Reuse Stage 0/1 results for near-duplicates. Parallel Stage 2 queries.

### **8.5 Multi-Provider Comparison Mode**

Run same query against multiple LLM providers. Compare results side-by-side. Benchmark accuracy and cost.

### **8.6 Fine-Tuned Legal Model**

Train specialized model on FOLIO ontology. Higher accuracy at lower cost. Distribute as Ollama-compatible model.

### **8.7 Team/Enterprise Features**

Shared session files, centralized API key management, usage analytics.

### **8.8 Pre-Scan Learning**

Cache pre-scan results across sessions. Build a local dictionary of segment → branch mappings from confirmed user selections.

---

## **9\. Example User Flow**

1. Open FOLIO Mapper in browser  
2. System checks OWL version against GitHub, updates if needed  
3. Configure LLM provider (enter API key, select model)  
4. Enter data (upload CSV or paste text)  
5. System auto-detects: "4 items detected" (or "Hierarchical structure, 3 levels")  
6. Click "Continue" → processing begins  
7. **Stage 0 runs:** Pre-scan segments each input, tags words with FOLIO branches  
8. Sequential review: a. Node 1 of 4 displayed with branch-tagged segments and candidates b. Branch filter toggles candidate visibility c. Click input words to see branch attribution d. Review pre-checked selections, adjust if needed e. Press `Enter` or click `[Next → ⏎]` → Node 2 f. Repeat (or press `Shift+A` to accept all remaining defaults)  
9. (If multi-day) Press `Ctrl+S` → download .folio-session.json  
10. (Day 2\) Resume session → upload file, continue  
11. Final summary with branch coverage statistics  
12. Export CSV with columns: Source, Label, IRI, Branch, Segment, Confidence, Label (Español)  
13. (Optional) Submit 3 queued new concept suggestions to ALEA as a single GitHub Issue

---

## **10\. Success Metrics**

| Metric | Target |
| ----- | ----- |
| Correct mapping in top 3 candidates | \> 90% |
| User accepts default selection | \> 70% |
| Average time per node review | \< 30 seconds |
| Branch coverage (pre-scan branches with mappings) | \> 85% |
| Session recovery success rate | \> 99% |
| Export completion rate | \> 95% |

---

## **11\. Appendix**

### **A. FOLIO API Endpoints**

| Format | URL |
| ----- | ----- |
| JSON | `/{iri_hash}` |
| JSON-LD | `/{iri_hash}/jsonld` |
| HTML | `/{iri_hash}/html` |
| Markdown | `/{iri_hash}/markdown` |
| OWL XML | `/{iri_hash}/xml` |

### **B. Session File Schema**

{  
  "version": "1.2",  
  "created": "ISO8601 timestamp",  
  "source\_file": "filename",  
  "source\_hash": "sha256:...",  
  "input\_format": "flat|hierarchical",  
  "total\_nodes": 1000,  
  "completed": 347,  
  "skipped": 12,  
  "current\_position": 348,  
  "threshold": 70,  
  "provider": "anthropic",  
  "model": "claude-sonnet-4-5-20250929",  
  "owl\_version": "abc123...",  
  "prescan\_results": {  
    "node\_index": {  
      "segments": \[  
        {"text": "word", "branches": \["Branch"\], "reasoning": "..."}  
      \]  
    }  
  },  
  "selections": { "node\_index": \["iri\_hash"\] },  
  "skipped\_nodes": \[45, 89\],  
  "notes": { "node\_index": "user note" },  
  "suggestion\_queue": \[  
    {  
      "label": "Legal Operations Analytics",  
      "definition": "...",  
      "parent": "Service",  
      "branch": "Service",  
      "original\_input": "LegalOps analytics and reporting"  
    }  
  \]  
}

### **C. Symbolic Compression Keys**

| Key | Meaning |
| ----- | ----- |
| `l` | label |
| `d` | definition |
| `s` | synonyms |
| `e` | examples |
| `p` | parent |
| `P` | full path |
| `i` | IRI hash |
| `C` | confidence |
| `R` | reasoning |
| `B` | branch |
| `M` | matched segment |
| `V` | verdict |
| `J` | judge explanation |
| `K` | coverage status |

### **D. FOLIO Top-Level Branches (Complete)**

| \# | Branch | Description |
| ----- | ----- | ----- |
| 1 | Actor / Player | Entities in legal matters |
| 2 | Area of Law | Legal practice domains |
| 3 | Asset Type | Types of assets involved |
| 4 | Communication Modality | Methods of communication |
| 5 | Currency | Monetary denominations |
| 6 | Data Format | Data encoding formats |
| 7 | Document / Artifact | Legal document types |
| 8 | Engagement Attributes | Matter/engagement properties |
| 9 | Event | Legal events and deadlines |
| 10 | Financial Concepts and Metrics | Financial measures and concepts |
| 11 | Forums and Venues | Where proceedings occur |
| 12 | Governmental Body | Government organizations |
| 13 | Industry and Market | Client industry sectors |
| 14 | Language | Human languages |
| 15 | Legal Authorities | Sources of legal authority |
| 16 | Legal Entity | Organization types |
| 17 | Legal Use Cases | Legal workflows and scenarios |
| 18 | Location | Geographic locations and jurisdictions |
| 19 | Matter Narrative | Descriptions of legal matters |
| 20 | Objectives | Goals of legal action |
| 21 | Service | Legal service types |
| 22 | Standards Compatibility | Data/practice standard compliance |
| 23 | Status | Matter/case states |
| 24 | System Identifiers | Technical identifiers |

