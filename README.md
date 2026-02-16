# FOLIO Mapper

Map your taxonomy (firm taxonomy, legal tech ontology, practice categories) to the [FOLIO ontology](https://folio.openlegalstandard.org/) — an open standard with ~18,300 legal concepts across 24 branches.

FOLIO Mapper combines fuzzy text matching with optional LLM-assisted ranking to produce high-quality mappings, exportable in 8 formats.

## Features

### Data Input
- **File upload**: Excel (.xlsx), CSV, TSV, TXT, Markdown — with drag-and-drop
- **Text entry**: Paste or type items directly, one per line
- **Hierarchy detection**: Automatically detects parent-child relationships from blank-cell indentation in CSVs
- **Branch pre-filtering**: Select which FOLIO branches to search before mapping begins

### Mapping
- **Candidate search**: Fuzzy label + synonym matching against all ~18,300 FOLIO classes
- **Branch-grouped display**: Candidates organized by FOLIO branch with color coding
- **Top N filter**: Slider to show top 1–50 candidates (or all), works on search-filtered results too
- **Branch states**: Mark branches as mandatory (always shown) or excluded (hidden)
- **Confidence scores**: Color-coded badges (green = strong, yellow = moderate, orange = weak)
- **Detail panel**: View full definition, hierarchy path, children, siblings, related concepts, and translations
- **Search & filter**: Search across all candidates by label, definition, or synonym
- **Selection tree**: Check candidates to accept mappings, with structural grouping
- **Per-item notes**: Add free-text notes to any item
- **Status tracking**: Items marked as completed, pending, skipped, or needs attention — with filter

### LLM-Enhanced Pipeline (Optional)
When an LLM provider is configured, the pipeline adds intelligent ranking on top of local search:

- **Stage 1 — Local search**: Branch-scoped fuzzy matching with synonym expansion and fallback
- **Stage 3 — Judge validation**: LLM reviews each candidate, adjusts scores, and rejects false positives

Supports **9 LLM providers**:

| Provider | Protocol | Notes |
|----------|----------|-------|
| OpenAI | OpenAI SDK | GPT-4o default |
| Anthropic | Anthropic SDK | Claude models (hardcoded list) |
| Google Gemini | HTTP (httpx) | Gemini 2.0 Flash default |
| Mistral | OpenAI-compatible | |
| Cohere | HTTP (httpx) | Command R+ default |
| Meta Llama | OpenAI-compatible | |
| Ollama | OpenAI-compatible | Local, no API key needed |
| LM Studio | OpenAI-compatible | Local, no API key needed |
| Custom | OpenAI-compatible | User-defined endpoint |

### Session Persistence
- **Auto-save**: Debounced (5s) to localStorage — no data loss on refresh
- **Recovery modal**: On startup, resume previous session, start fresh, or download backup
- **Manual save/load**: Ctrl+S to save, load `.json` session files
- **New Project**: Save-and-new or discard-and-new (LLM settings preserved)

### Export (8 Formats)
- CSV, Excel (.xlsx), JSON, RDF/Turtle, JSON-LD, Markdown, HTML, PDF
- 5-row preview before export
- Column toggles: item text, IRI (hash/full/short), score, branch, definition, notes
- Translation columns in 10 languages (English, Spanish, French, German, Italian, Portuguese, Dutch, Polish, Russian, Chinese)
- Ctrl+E keyboard shortcut

### ALEA Suggestion Queue
- Flag items where no good FOLIO match exists (F key)
- Edit suggested label, definition, synonyms, parent class, and branch
- Preview and submit as GitHub issues to improve the FOLIO ontology
- Supports GitHub PAT authentication or clipboard copy fallback

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Left/Right Arrow | Navigate between items |
| Enter | Next item |
| Shift+A | Accept all default selections |
| G | Go to item by number |
| F | Flag item for suggestion |
| ? | Show shortcuts overlay |
| Ctrl+S | Save session |
| Ctrl+E | Open export modal |

## Architecture

```
folio-mapper/
├── packages/
│   ├── core/                  # Shared types + API clients (no React deps)
│   │   └── src/
│   │       ├── input/         # Parse types & API client
│   │       ├── folio/         # FOLIO types, branch colors, display order
│   │       ├── mapping/       # Mapping types, score cutoff calculation
│   │       ├── llm/           # LLM provider types & API client
│   │       ├── pipeline/      # Pipeline types & API client
│   │       ├── session/       # Session file schema (v1.2)
│   │       ├── export/        # Export types
│   │       └── suggestion/    # Suggestion types & GitHub issue body generation
│   └── ui/                    # Pure React components (35 components)
│       └── src/components/
│           ├── input/         # TextInput, FileDropZone, InputScreen
│           ├── confirmation/  # Flat & hierarchical confirmation views
│           ├── layout/        # AppShell, Header
│           ├── mapping/       # MappingScreen + 17 sub-components
│           ├── settings/      # LLMSettings, ProviderCard
│           ├── export/        # ExportModal
│           └── session/       # RecoveryModal, NewProjectModal
├── apps/
│   └── web/                   # Main React app
│       └── src/
│           ├── App.tsx        # Screen flow orchestration
│           ├── hooks/         # useMapping, useSession, useExport, etc.
│           └── store/         # Zustand stores (input, mapping, LLM)
└── backend/                   # FastAPI backend
    ├── app/
    │   ├── main.py            # CORS, router registration
    │   ├── models/            # Pydantic request/response models
    │   ├── routers/           # 6 API routers
    │   └── services/
    │       ├── folio_service.py      # FOLIO singleton, search, hierarchy
    │       ├── file_parser.py        # Excel/CSV/TSV/TXT parsing
    │       ├── export_service.py     # 8 export format generators
    │       ├── llm/                  # Provider implementations
    │       └── pipeline/             # Stages 0–3 orchestration
    └── tests/                 # 155 pytest test cases
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/parse/file` | Parse uploaded file |
| POST | `/api/parse/text` | Parse plain text |
| POST | `/api/mapping/candidates` | Search FOLIO candidates |
| GET | `/api/mapping/status` | FOLIO loading status |
| POST | `/api/mapping/lookup` | Lookup concept by IRI |
| POST | `/api/mapping/detail` | Full concept detail (children, siblings, translations) |
| POST | `/api/mapping/mandatory-fallback` | LLM-assisted search for mandatory branches |
| POST | `/api/llm/test-connection` | Test LLM provider connectivity |
| POST | `/api/llm/models` | Discover available models |
| POST | `/api/pipeline/map` | Run full LLM-enhanced pipeline |
| POST | `/api/export/generate` | Generate export file |
| POST | `/api/export/preview` | Preview first 5 rows |
| POST | `/api/export/translations` | Fetch translations for concepts |
| POST | `/api/github/submit-issue` | Submit suggestion as GitHub issue |

### Tech Stack

**Frontend**: React 19, Zustand 5, Tailwind CSS 3, Vite 6, TypeScript 5.7

**Backend**: FastAPI, Python 3.11+, [folio-python](https://github.com/alea-institute/folio-python), rapidfuzz, OpenAI SDK, Anthropic SDK

**Testing**: vitest (frontend), pytest + pytest-asyncio (backend)

## Getting Started

### Prerequisites
- Node.js 18+
- Python 3.11+
- pnpm

### Install

```bash
# Frontend
pnpm install

# Backend
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

### Run

```bash
# Both frontend + backend
pnpm dev

# Or separately:
pnpm dev:api     # Backend on http://localhost:8000
pnpm dev:web     # Frontend on http://localhost:5173
```

The frontend proxies `/api/*` requests to the backend automatically.

### Test

```bash
pnpm test         # Frontend tests (core + UI + web)
pnpm test:api     # Backend tests (155 cases)
```

## FOLIO Ontology

[FOLIO](https://folio.openlegalstandard.org/) (Financial and Operational Legal Information Ontology) is an open legal standard with ~18,300 classes across 24 branches:

Actor/Player, Area of Law, Asset Type, Communication Modality, Currency, Data Format, Document/Artifact, Engagement Terms, Event, Forums/Venues, Governmental Body, Industry, Language, Legal Authorities, Legal Entity, Location, Matter Narrative, Matter Narrative Format, Objectives, Service, Standards Compatibility, Status, System Identifiers, and more.

The ontology is loaded via [folio-python](https://github.com/alea-institute/folio-python) and cached locally at `~/.folio/cache`.

## License

[MIT](LICENSE)
