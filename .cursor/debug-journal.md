# Debug journal

Use this file to record what you do and discover during debugging so the next session can resume quickly. **Update it at the end of each debug session** (findings, hypotheses rejected, fixes applied, open questions).

---

## Session: Settings not persisting + dev "Failed to fetch" (2026-05-24)

### User report
- API key / settings not saved between sessions; packaged vs dev data split.
- Dev UI: instant **"Failed to fetch"**, **Backend: Off**; cloud and local Test AI both failed without reaching API.

### Root causes
1. **Split data dirs**: dev used `aic-backend/data`, packaged used `%APPDATA%\CortexLog\data` with different `api_token` files.
2. **No CORS**: Vite UI on `:5173` → API on `:8000` blocked by browser; instant fetch failure.
3. **Vite IPv6**: bound `[::1]:5173` only; `wait-on tcp:127.0.0.1:5173` blocked Electron launch.

### Fixes applied
1. **`config.py`**: Windows always uses `%APPDATA%\CortexLog\data` (dev + packaged).
2. **`data_migration.py`**: migrate missing files from `aic-backend/data` on startup.
3. **`main.js`**: dev Electron reads Roaming `api_token` on Windows.
4. **`main.py`**: `CORSMiddleware` for `http://127.0.0.1:5173` (outermost in stack).
5. **`vite.config.ts`**: `host: "127.0.0.1"`.
6. **`main.js`**: removed auto-open DevTools on `ELECTRON_DEV=1`.

### Verification
- User confirmed **Backend: Ok**, **AI: openai:gpt-4o-mini (ready)** in dev.

---

## Session: OpenAI cloud “LLM test failed” in Settings (2026-05-05)

### User report
- **Test AI** after saving an OpenAI API key showed generic **“LLM test failed.”** in Settings.

### Evidence
- Backend `debug-fbd514.log` (repo root, `_dbg` from `llm_routes.py`): `RateLimitError`, HTTP **429**, OpenAI code **`insufficient_quota`** (“exceeded your current quota… check plan and billing”).
- So the key was accepted and the request reached OpenAI; failure was **account quota / billing**, not CortexLog connectivity.

### Fixes applied
1. **`aic-backend/app/api/llm_routes.py`**: Catch OpenAI `AuthenticationError`, `RateLimitError` (with explicit message when `insufficient_quota`), `APIConnectionError`, and other `APIError`s before the generic handler so the UI gets a clear `detail` instead of a blanket “LLM test failed.”
2. **`.cursor/debug-reference.md`**: Indexed this symptom under LLM / cloud providers.

### Verification
- Pending: user re-runs **Test AI** and confirms the status line shows the quota/billing wording (HTTP 429) rather than the generic message.

---

## Session: Journal "Reflect on this" + entry not persisting (2026-02-28)

### User report
- Save Entry → entry appears in list → "Reflect on this" → error "No journal entry found. Save an entry first."
- After restarting Electron and backend, the entry that had appeared (and the one from the earlier screenshot) is no longer visible. Entries appear to save but do not persist across restart.

### Hypotheses tested (instrumentation in the legacy renderer layer + `routes.py`)
| Id | Hypothesis | Result | Evidence |
|----|------------|--------|----------|
| H1 | Backend `list_journal_entries(limit=1)` returns empty when reflect runs | **REJECTED** | Log: `latest_count: 1`, `first_entry_id` present |
| H2 | Reflect runs before save is committed | **REJECTED** | Log: save completed (entry created, `ok: true`), then reflect ran and found 1 entry |
| H3 | Save fails silently; UI clears input anyway | **REJECTED** | Log: `save response ok: true`, backend "journal entry created" |
| H4 | Reflect request body misinterpreted (wrong branch) | **REJECTED** | Log: `branch: "latest"`, `entry_id: null` |
| H5 | Unsaved-text path: race so "latest" doesn’t include just-saved entry | N/A this run | `unsavedLen: 0` |

### Findings from logs
- In the reproduced run, **save and reflect both succeeded** (backend created entry, reflect saw `latest_count: 1`). So the "No journal entry found" error in the original report may occur when: (1) save failed but UI didn’t show it and list was stale, or (2) user clicked Reflect without having saved (empty DB), or (3) a different backend instance was hit (different DB).
- **Persistence**: Entry disappearing after restart suggests either (a) backend is using a different DB path when started from a different cwd/process, (b) "Delete all data" was used, or (c) data directory is ephemeral. DB path is set in `aic-backend/app/storage/database.py`: `DEFAULT_DB_PATH = Path(__file__).resolve().parents[2] / "data" / "aic.db"` (i.e. `aic-backend/data/aic.db`). This is resolved from `__file__`, so it is absolute and does not depend on process cwd. If the backend is started from different contexts (e.g. packaged app vs dev, or different working directory), the same code path should still resolve to the same file. To verify which DB is used across restarts, add at startup (e.g. in `app/main.py` `on_startup`) a log of `str(DEFAULT_DB_PATH)` to `.cursor/debug.log` or to a known debug location.

### Fixes applied
1. **Save feedback**: Only clear the journal input and reload the list when `saveRes.ok`. On failure, show an alert with server detail and leave the text in the input so the user can retry.
2. **Reflect robustness**: Before calling `/journal/reflect`, the frontend now fetches `GET /journal`, takes the first (latest) entry id, and sends `{ entry_id: latestId }` in the reflect request. If the list is empty, show "No journal entry found. Save an entry first." without calling the API. This avoids 404 when the UI list and backend "latest" could ever disagree (e.g. race or multiple backends).
3. **Reflect unsaved path**: When user has unsaved text and clicks Reflect, we now await the save and check `saveRes.ok`; on failure we show an alert and do not call reflect.

### Open / follow-up
- **Persistence**: If entries still disappear after restart, check `.cursor/debug.log` for `backend_startup` entries and compare `db_path` across runs. Confirm the same path is used when starting via Electron vs run_dev.bat. Check whether any code path calls `wipe_all_data()` or deletes `data/` (e.g. "Delete all data" in settings).
- Status: **Fixed and verified by user.** Debug instrumentation has been removed.

### Files touched
- `aic-electron/src/components/JournalMode.tsx` (current equivalent surface): save response check; reflect resolves latest entry id client-side and sends `entry_id`; unsaved-save check.
- `aic-backend/app/api/routes.py`: debug log regions (to remove after verification).
- `aic-backend/app/main.py`: on startup append one line to `.cursor/debug.log` with `message: backend_startup` and `data.db_path` (resolved `DEFAULT_DB_PATH`) for persistence debugging.

---

## Session: Journal responses over-structured vs direct Ollama quality (2026-06-19)

### User report
- Journal reflection in CortexLog produced rigid `Option 1 / Option 2 / Recommendation` style output, while the same local model (Ollama UI) produced a more natural reflective response for the same entry.

### Root cause
1. Journal and chat/explore were routed through response-contract orchestration (`classify -> validate -> repair -> generate -> validate -> retry`) that can force rigid output shapes.
2. `/journal/reflect` passed a scaffolded prompt wrapper into the generator instead of raw entry content.
3. Existing output-shape templates (especially `options_with_tradeoffs`) made over-structured responses likely once selected.

### Fixes applied
1. Replaced harness-backed generation with direct `chat_completion()` path in `aic-backend/app/llm/response.py`.
2. Added lightweight mode-specific system prompts (journal/exploration/crisis/general) without contract shaping/retry templates.
3. Preserved continuity by passing session history (user + assistant turns) with practical trimming for context size.
4. Updated `/journal/reflect` in `aic-backend/app/api/routes.py` to pass raw `entry_content` instead of scaffolded reflection wrapper.
5. Follow-up: removed journal/exploration behavioral prompt instructions entirely. Journal/explore now rely on raw model capability, with only retrieved note context supplied when present; crisis retains safety guidance.

### Verification
- Python compile check passed for touched modules (`response.py`, `routes.py`).
- Lint diagnostics: no errors in touched files.
- Prompt assembly sanity checks:
  - exploration includes assistant history and avoids duplicate current user turn
  - journal path sends raw journal text and does not include options template instructions in system prompt
  - follow-up check confirmed journal without retrieval sends only a user message; journal with retrieval sends only a minimal context label plus raw entry

### Open / follow-up
- If exploration sessions become long, tune message/character caps in `response.py` to avoid provider truncation while preserving continuity.

### Files touched
- `aic-backend/app/llm/response.py`
- `aic-backend/app/api/routes.py`

---

## Session: Retrieval stability + journal memory indexing + continuity fixes (2026-06-20)

### User report
- Response quality depended on clean direct prompts, but durable memory/retrieval continuity had correctness and privacy concerns.

### Root causes
1. `embed_text()` used randomized `hash(token)` causing embedding index instability across restarts.
2. Journal entries created `items` rows but were not chunked/embedded, so `/journal/reflect` retrieval could miss journal memory.
3. Chat history query returned oldest N rows (`ASC LIMIT`) instead of latest N for long sessions.
4. Non-private profile migration copied repo dev data, risking cross-profile privacy bleed.
5. Retrieved context was passed in system authority.

### Fixes applied
1. Switched to deterministic token indexing (`blake2b`) in `app/llm/embedding.py`.
2. Added re-embedding utility script: `aic-backend/scripts/reembed_chunks.py`.
3. Journal save path now chunks + embeds each new entry and stores a journal-linked item id.
4. `/journal/reflect` excludes the current entry item from retrieval and stores/uses a dedicated journal reflection session for continuity.
5. Retrieval now supports `exclude_item_ids`.
6. Chat list query now fetches latest N then reverses to chronological order.
7. Non-private profile migration now skips legacy copy entirely.
8. Ollama settings/path now include `local_num_ctx` and pass `num_ctx` into chat options.
9. Response-contract runtime references removed from active routes; module marked legacy.
10. Added repo-level `.gitignore` for build/data/secrets artifacts.

### Verification
- Compile/lint checks passed for changed backend files.
- Sanity checks confirmed stable embeddings, latest-first chat query, and retrieved context now passed as non-system context.

### Open / follow-up
- Run `python scripts/reembed_chunks.py` once per profile data DB to regenerate existing vectors under stable hashing.
- Consider migrating debug setting key names away from `response_contract_*` once UI compatibility is updated.

---

## Session: AI model/source appears to revert after restart (2026-06-21)

### User report
- After completely restarting the app, selected AI model/source appeared to revert to cloud/OpenAI (`gpt-4o-mini`-style default) instead of staying on the last-used local model.

### Evidence
- Active profile in `%APPDATA%\CortexLog\app_settings.json`: `demo`.
- Both `private` and `demo` profile DBs had `settings.key = cortexlog_llm` persisted as:
  - `model_source: "local"`
  - `local_model: "gemma4"`
  - `cloud_model: "gpt-4o-mini"`
- Live backend `GET /llm/settings` also returned `model_source: "local"` and `local_model: "gemma4"`.
- Backend defaults in `aic-backend/app/llm/llm_settings.py` are already local-first (`model_source: "local"`).

### Root cause
- The most likely UX trap was that changing the Settings model source/model field did not persist immediately. It only became durable after clicking **Save AI settings**. A user could change/test a model selection and then restart, seeing the last saved value rather than the last selected value.

### Fixes applied
1. Added `saveAiSelection()` in `aic-electron/src/components/ProviderSettings.tsx`.
2. Model source/provider dropdown changes now persist immediately to `/llm/settings`.
3. Cloud/local model text fields now persist on blur.
4. Kept **Save AI settings** as the explicit recovery path and for API-key updates.

### Verification
- `npx tsc --noEmit` passed.
- Lint diagnostics: no errors in `ProviderSettings.tsx`.
- Runtime DB/API evidence before the fix confirmed current backend source persisted local settings correctly.

---

*Next session: append a new "Session: ..." section with date and topic, and update open/follow-up as needed.*
