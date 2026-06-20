# AIC — Application specification (as-built + document map)

This file describes the **current implementation** of the AI Companion MVP in this repository, and how it relates to separate Word requirements docs. Last aligned with the codebase layout under `aic-electron/`, `aic-backend/`, `eval/`, and `tests/`.

---

## Related documents (repo root)

| File | Role |
|------|------|
| **AI Companion MVP - Fixtures only.docx** | Golden **fixtures** (example prompts/responses), not an architectural spec. |
| **AI Companion MVP - Fixtures.docx** | Mixed **design notes** (security plans, LLM quality phases, etc.), not a single as-built spec. |
| **AIC MVP – Functional Specification (v1.1).docx** | **Product / requirements** vision. Note: the filename uses a Unicode **en dash** (`–`) between `MVP` and `Functional`; a normal hyphen path may not resolve in some tools. |

Use the **v1.1 functional spec** for goals and acceptance language; use **this markdown** for what the code actually does today.

---

## Purpose

**AIC (AI Companion MVP)** is a **local-first** desktop assistant that:

- Ingests personal content from **local files**, **Gmail** (read-only), and **Facebook / YouTube** export paths.
- Stores items, text **chunks**, **embeddings**, and LLM-derived **entities** / **relations** with **provenance**.
- Provides **journal** and **chat** surfaces with **retrieval-augmented** responses via a **local Ollama** model.
- Surfaces **proposed insights**, **conflicts**, and a simple **knowledge map** (lists/panels, not a full graph renderer).

**MVP constraint (design intent):** connectors are **read-only**; no sending email or posting on behalf of the user.

---

## Repository layout

| Path | Contents |
|------|----------|
| `aic-electron/` | Electron shell: `main.js`, `preload.js`, and React renderer source under `src/` (bundled to `renderer-dist/`). |
| `aic-backend/` | Python **FastAPI** app under `app/`. |
| `eval/` | Fixture evaluation harness (`run_eval.py`, rubric, `outputs/`). |
| `tests/` | Tests and JSON fixtures (e.g. journal cases). |
| `AIC/` | This specification and other umbrella AIC docs (optional). |

---

## Runtime architecture

1. **Electron** (`aic-electron`) loads Vite dev server in dev mode (`127.0.0.1:5173`) and otherwise loads `renderer-dist/index.html`.  
   - **Packaged:** can spawn `aic-backend.exe` from resources and read API token from `resources/backend/data/api_token`.  
   - **Dev:** can start the backend via `aic-backend/run_dev.bat` (or `AIC_BACKEND_CMD`).  
   - Polls **backend** health; may start **`ollama serve`** if the Ollama HTTP API is unreachable.

2. **FastAPI** (`aic-backend`) serves **`http://127.0.0.1:8000`** by default (`uvicorn app.main:app`).  
   - Global middleware requires a **local API token** for all routes except **`/health`** (and health under `api_prefix` if set).  
   - Token file: `aic-backend/data/api_token` (dev) or bundled backend `data/` when packaged.

3. **Ollama** hosts the chat/analysis model.  
   - Defaults: model **`gpt-oss:20b`**, base URL **`http://localhost:11434`**.  
   - Environment: **`AIC_OLLAMA_MODEL`**, **`AIC_OLLAMA_BASE_URL`** (see `app/core/config.py`).  
   - **`GET /health/llm`** probes Ollama with a trivial chat call.

---

## Backend API (high level)

- **Health:** `GET /health`, `GET /health/llm`
- **Auth (password verification flow):** `GET /auth/salt`, `POST /auth/set-password`, `POST /auth/verify`
- **Ingest:** `POST /ingest/local`, `POST /ingest/local/stream`, `POST /ingest/gmail`, `POST /ingest/facebook_export`, `POST /ingest/youtube_export`, `POST /ingest/analyze`
- **Journal:** `GET/POST /journal`, `POST /journal/reflect`, `DELETE /journal/{id}`, `DELETE /journal/{id}/reflection`
- **Chat:** `GET/POST /chat`, `DELETE /chat/{message_id}`
- **Retrieval:** `POST /retrieve`
- **Knowledge:** entities, relations, provenance, cleanup, conflicts — see `app/api/routes.py`
- **Proposed insights:** list, filtered list, update status, restore
- **Secrets:** `/secrets/store`, `/secrets/get`, `/secrets/store-with-key`, `/secrets/get-with-key`
- **Settings:** `GET /settings/{key}`, `POST /settings`
- **Export / wipe:** `GET /export`, `POST /delete_all`

All of the above (except health) expect the **API token** enforced in `app/main.py`.

---

## Persistence (SQLite)

Defined in `app/storage/schema.py` (plus migrations). Notable tables:

- **`items`** — ingested artifacts (source type, path/id, hash, status).
- **`chunks`** / **`embeddings`** — chunked text and vectors for semantic search.
- **`journal_entries`** — content, structured fields, optional **`reflection`**.
- **`chat_messages`** — role, content, **`mode`**, **`session_id`**.
- **`entities`**, **`relations`**, **`provenance`** — knowledge graph–style data with lineage.
- **`proposed_insights`**, **`conflicts`**, **`settings`**, categories, LLM analysis runs, feedback/word stats.

Database and auxiliary files live under **`aic-backend/data/`** in development.

---

## Ingestion pipeline

- **Local paths:** ingest files/folders; streaming variant returns NDJSON events.
- **Gmail:** access token + optional body fetch; capped `max_results`.
- **Facebook / YouTube:** paths to export packages.
- **Analyze:** selects items with chunks needing (or forcing) LLM extraction; calls `extract_and_store` — **503** if Ollama is unavailable (`LLMUnavailableError`).

Chunking, hashing, and format-specific parsers live under `app/ingestion/`.

---

## Retrieval

`app/retrieval/search.py` — **`retrieve(query, limit)`**:

- Embeds the query (`app/llm/embedding.py`).
- Scores embedding records with cosine similarity plus a small **recency** boost.
- Skips chunk content flagged by **`is_prompt_injection`** (`app/llm/policy.py`).
- Returns top matches plus related entity IDs and relation hooks.

---

## Chat behavior and modes

**Endpoint:** `POST /chat` with `content`, optional `mode` (default `journal`), optional `session_id`.

**Effective mode resolution** (`routes.py` + `policy.py`):

1. If **`detect_distress`** matches → **`crisis`**.
2. Else if requested mode normalizes to **`journal`** and **`is_workplace_prompt`** → **`advisor_workplace`**.
3. Else normalized mode: **`journal`**, **`coach`**, **`exploration`**, **`crisis`**, **`advisor_workplace`**.

**Retrieval:**

- Personal retrieval runs for chat **unless** mode is **`exploration`** (exploration skips personal context per route logic).
- Response includes **`citations`** (item id + label from stored items).

**LLM layering** (`app/llm/response.py`):

- Base **`SAFETY_BLOCK`** on all modes.
- Per-mode **`MODE_PROMPTS`**.
- **`advisor_workplace`** uses a strict **six-section scaffold** (what’s happening, what matters, two options + tradeoffs, next step with timeframe, talk track, likelihood/reality check); **one automatic retry** if a lightweight heuristic says sections are missing.
- **`session_id`:** prior **`chat_messages`** for that session are loaded into the messages list for continuity.

---

## Journal

- Entries are stored and mirrored into **`items`** with `source_type="journal"` for indexing/analysis alignment.
- **`/journal/reflect`:** retrieves context, builds journal-oriented system text, calls Ollama, writes **`reflection`** on the entry.

---

## Proposed insights and conflicts

- Insights have statuses updated via API; **accepted** paths can **`create_entity`** and **`create_provenance`**.
- **`/proposed_insights/filtered`** and feedback hooks support review UX and simple ML-adjacent word stats (`ml_stats`, `feedback`).

---

## Electron UI surfaces

Main renderer root is **`aic-electron/src/App.tsx`** (bootstrapped by `aic-electron/src/main.tsx`):

- **Journal** / **Chat** / **Knowledge Map** / **Proposed Insights** toggles.
- Backend + LLM status line; optional **session nudge** strip.
- Knowledge map: entity list, relations, conflicts, detail panel.

**Menu** (`main.js`): **File → Settings** opens the in-app React settings surface.

Preload exposes IPC such as folder/file pickers and **`aic:get-api-key`** for authenticated fetches from the renderer.

---

## Security and policy (implemented)

- **Local API token** on every privileged route.
- **Password hash / salt** endpoints for app-level locking (exact UX depends on renderer).
- **Encrypted secret store** with passphrase or **client-derived key** endpoints (`app/security/`).
- **Distress keywords** force crisis framing.
- **Prompt injection** substrings filtered at **retrieval** time on chunk content.
- **Workplace routing** keywords drive **`advisor_workplace`** for structured career/conflict-style replies.

---

## Evaluation harness

- **`eval/README.md`** — run from repo root with `PYTHONPATH` including `aic-backend` and `.`  
- **`eval/run_eval.py`** — fixture runs; outputs e.g. `eval/outputs/eval_results.json`.  
- Baseline comparison suggested in README.

---

## Known gaps vs functional spec Word doc (non-exhaustive)

The v1.1 functional specification describes many UX and policy behaviors that are **partially implemented** or **not implemented** here, including but not limited to: full setup wizard, rich session limits/nudges as specified, graph visualization parity, scheduling ingestion, OS keychain integration, outbound email/password-reset flows, and all spiritual/knowledge-mode nuances. Treat the Word doc as **north star**; treat this file and `app/api/routes.py` as **truth for behavior**.

---

## Quick dev commands

**Backend** (from `aic-backend/README.md`):

```text
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Ensure **Ollama** is running with the configured model (`AIC_OLLAMA_MODEL`).

**Eval** (Windows PowerShell):

```powershell
$env:PYTHONPATH = "aic-backend;."; python eval/run_eval.py
```

---

## Document maintenance

When the architecture or routes change materially, update this file so it stays accurate for tooling (e.g. ChatGPT context) and onboarding.
