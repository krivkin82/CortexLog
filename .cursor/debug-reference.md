# Debug reference (index)

This is a **searchable index** for likely issues in the AIC MVP, organized by **symptom → likely causes → where to look → quick checks**.

Also see:
- `.cursor/debug-journal.md` (chronological log of what happened and what fixed it)
- `docs/SECURITY_ARCHITECTURE.md` (auth, API token, secret store, encryption – what, where, how)

---

## How to use this doc

1. Search for the **symptom text** you see (UI message, API error detail, behavior).
2. Check the **likely causes** in order.
3. Jump to the **where to look** section for the exact files/paths.

---

## Symptom index

### Journal / chat

#### “No journal entry found” (when entries appear in the UI)
- **Likely causes**
  - **Client and server disagree on “latest”** (race, stale list, or multiple backend instances)
  - **Save failed but UI cleared input** (silent failure / missing error handling)
  - **Backend is pointing at a different DB** than you think (different process / packaged vs dev)
- **Where to look**
  - **Frontend**: `aic-electron/src/components/JournalMode.tsx` and `aic-electron/src/lib/api.ts`
  - **Backend**: `aic-backend/app/api/routes.py` (`/journal`, `/journal/reflect`)
  - **DB path**: `aic-backend/app/storage/database.py` (`DEFAULT_DB_PATH`)
- **Quick checks**
  - Verify `POST /journal` returns `200` and UI only clears on success.
  - Prefer calling reflect with an explicit `entry_id` (client gets latest ID from `GET /journal`).
  - Confirm only one backend is running on port `8000`.

#### Journal entry “saved” but disappears after restart
- **Likely causes**
  - Backend writing to a different DB path (different build, different working dir assumptions)
  - “Delete all data” flow ran (`POST /delete_all`)
  - Multiple backends and you restarted a different one
- **Where to look**
  - `aic-backend/app/storage/database.py` (DB path)
  - `aic-backend/app/storage/admin.py` (`wipe_all_data`)
  - `aic-electron/src/App.tsx` + `aic-electron/src/lib/api.ts` (data controls and route calls)
  - `aic-electron/main.js` (how backend is started: packaged exe vs `run_dev.bat`)
- **Quick checks**
  - Check whether `aic-backend/data/aic.db` exists and its modified time changes on save.
  - Ensure you’re hitting the same backend instance after restart (port `8000` health check).

---

### Backend availability / process issues

#### UI shows “Backend: Off” / requests fail to `127.0.0.1:8000`
- **Likely causes**
  - Backend process not started (Electron didn’t spawn it; port conflict)
  - Backend crashed during startup/migrations
  - Firewall or policy blocking localhost binding
- **Where to look**
  - `aic-electron/main.js` (`ensureBackendRunning`, spawn logic)
  - Backend entrypoint: `aic-backend/app/main.py`
- **Quick checks**
  - Confirm `GET /health` responds.
  - Check for an existing process already bound to `8000`.

#### “Missing or invalid API key” with `Backend: Ok` (Settings / `/llm/*`)
- **Likely causes**
  - **`X-API-Key` does not match backend** — renderer reads `api_token` from a different path than the frozen backend writes (portable EXE + `%APPDATA%` under `AppData\Local\Temp`, or legacy `resources\backend\data\api_token` install).
- **Where to look**
  - `aic-electron/main.js` — `getApiTokenPath()`, `migrateLegacyApiTokenIfNeeded`
  - Frozen `DATA_DIR`: `aic-backend/app/core/config.py` (`_resolve_data_dir`)
  - Middleware: `aic-backend/app/main.py` (`Missing or invalid API key`)
- **Quick checks**
  - Packaged: token should live under real Roaming: `%APPDATA%\CortexLog\data\api_token` (not under a `Temp\…\resources` path).
  - Rebuild **both** backend + Electron after path changes.

---

### LLM / Ollama / cloud providers

#### Chat or journal returns `503` with detail like “OpenAI API key not configured” or “Local model unavailable”
- **Likely causes**
  - **`model_source` is `cloud`** but no OpenAI key stored under `llm_api_key_openai` (or legacy `openai_api_key`)
  - **`model_source` is `local`** but Ollama is down, wrong model, or bad base URL
  - **Unimplemented cloud provider** selected (Anthropic/Gemini) — not wired yet
- **Where to look**
  - Routing: `aic-backend/app/llm/service.py` (`chat_completion`, `LLMUnavailableError`)
  - Settings: `aic-backend/app/llm/llm_settings.py`, `GET/POST /llm/settings` in `aic-backend/app/api/llm_routes.py`
  - UI: `aic-electron/src/components/ProviderSettings.tsx`, status `GET /llm/status`
- **Quick checks**
  - `GET /llm/status` — `model_source`, `openai_key_configured`, `ollama_reachable`, `active_label`
  - `POST /llm/test` with the same source you use in the app

#### “LLM unavailable. Is Ollama running?” (legacy UI copy)
- **Likely causes**
  - Same as above; older routes may still say “Ollama” while the backend now supports **cloud or local** via `cortexlog_llm`.
- **Where to look**
  - `aic-backend/app/api/routes.py` (`/chat`, `/journal/reflect`, `/health/llm`)
  - Backend config: `aic-backend/app/core/config.py` (`AIC_OLLAMA_MODEL`, `AIC_OLLAMA_BASE_URL`)
- **Quick checks**
  - Confirm Ollama responds to `/api/tags` when using **local** source
  - Confirm OpenAI key is saved when using **cloud** source
  - Confirm configured model exists

#### Settings “LLM test failed” with OpenAI cloud (key appears valid)
- **Likely causes**
  - **OpenAI `429` / `insufficient_quota`** — billing or usage limits on the OpenAI org/project; not a CortexLog wiring bug if the backend log shows `RateLimitError` with `insufficient_quota`
  - **Invalid or revoked key** — usually `401` / `AuthenticationError` from OpenAI
- **Where to look**
  - `aic-backend/app/api/llm_routes.py` (`POST /llm/test` maps OpenAI exceptions to HTTP errors and `detail` text)
  - OpenAI dashboard: billing, usage limits, project API keys
- **Quick checks**
  - Re-run **Test AI** and read the HTTP `detail` returned (after handling, it should mention quota vs key vs network)
  - Confirm spend limits / payment method on the OpenAI account that owns the key

#### Journal reflection feels rigid/template-like (e.g. “Option 1 / Option 2 / Recommendation”) while direct Ollama/OpenAI output is better
- **Likely causes**
  - Response-contract harness over-shaping replies into template formats not suited for journal reflection
  - Journal route passes scaffolded wrapper instructions that bias intent detection away from natural reflection
  - Retry/validation loops reinforce structured response shape instead of adapting to entry tone
- **Where to look**
  - `aic-backend/app/llm/response.py` (ensure direct completion path is used for journal/explore)
  - `aic-backend/app/api/routes.py` (`/journal/reflect` should pass raw entry content)
  - `aic-backend/app/llm/response_contract.py` (legacy harness/template code; ensure not active in journal path)
- **Quick checks**
  - Submit a reflective entry with no explicit request for options and verify response avoids `Option 1`, `Option 2`, `Recommendation`
  - Compare backend prompt path for `/journal/reflect` against direct provider behavior for same entry
  - Confirm current journal/explore generation path uses raw user input plus retrieved context/session continuity, without contract-template injection or behavioral prompt instructions

#### Retrieval quality degrades after backend restart (same query, worse/missing matches)
- **Likely causes**
  - Embedding vectors built with non-deterministic token hashing (`hash(token)`) become incomparable across interpreter processes
- **Where to look**
  - `aic-backend/app/llm/embedding.py`
  - `aic-backend/scripts/reembed_chunks.py`
- **Quick checks**
  - Confirm deterministic token index function is used for embeddings
  - Re-embed existing chunk vectors and compare retrieval quality before/after

#### Journal reflections ignore prior journal memory
- **Likely causes**
  - Journal entries were saved but not chunked/embedded for retrieval
  - Reflection retrieval includes the current entry itself, wasting context slots
- **Where to look**
  - `aic-backend/app/api/routes.py` (`/journal`, `/journal/reflect`)
  - `aic-backend/app/storage/chunks.py`
  - `aic-backend/app/storage/vector_store.py`
  - `aic-backend/app/retrieval/search.py`
- **Quick checks**
  - Verify new journal save creates chunks + embeddings
  - Verify `/journal/reflect` excludes current entry item id from retrieval candidates

#### Explore/chat feels amnesiac in longer sessions
- **Likely causes**
  - Chat retrieval ordered oldest-first with `LIMIT`, dropping recent turns as sessions grow
- **Where to look**
  - `aic-backend/app/storage/chat.py` (`list_chat_messages`)
- **Quick checks**
  - Verify latest N are fetched (`DESC LIMIT`) and then reversed for chronological replay
  - Confirm conversation continuity reflects recent turns, not earliest turns

---

### Data deletion / resets

#### Everything “suddenly empty” (journal/chat/knowledge)
- **Likely causes**
  - Delete-all executed
  - DB file removed from `data/` folder (manual cleanup, reinstall)
- **Where to look**
  - Backend route: `aic-backend/app/api/routes.py` (delete_all endpoint)
  - Deletion implementation: `aic-backend/app/storage/admin.py`
  - UI trigger: `aic-electron/src/App.tsx`

---

## Architectural quick map (for debugging)

- **Electron renderer** talks to backend over HTTP at `http://127.0.0.1:8000` (see `aic-electron/src/lib/api.ts`).
- **Electron main** is responsible for starting the backend (dev: `aic-backend/run_dev.bat`, packaged: `aic-backend.exe`) — see `aic-electron/main.js`.
- **Backend storage** is SQLite under `aic-backend/data/aic.db` (see `DEFAULT_DB_PATH` in `aic-backend/app/storage/database.py`).
- **“Delete all”** removes `aic-backend/data/` entirely (see `aic-backend/app/storage/admin.py`).

---

## Maintenance (how this doc stays useful)

- **At the end of every debugging session**, update this file if additional information surfaced that is **not yet entered** and would be useful for future debugging (e.g. new symptoms, new likely causes, new “where to look” paths, or quick checks that worked).
- Add new symptom entries using the same structure: **Symptom** → Likely causes → Where to look → Quick checks. Add new top-level subsections under “Symptom index” as new areas of the app gain complexity.
- This reference is expected to **grow** as the project grows; keep it as a searchable index so the next session can find relevant clues quickly.
