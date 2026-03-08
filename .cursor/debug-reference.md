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
  - **Frontend**: `aic-electron/renderer/renderer.js` (`saveJournalEntry`, `reflectOnJournal`)
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
  - `aic-electron/renderer/settings.js` (`/delete_all`)
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

---

### LLM / Ollama

#### “LLM unavailable. Is Ollama running?”
- **Likely causes**
  - Ollama server not running
  - Model not installed / wrong model name
  - Ollama base URL changed
- **Where to look**
  - Backend config: `aic-backend/app/core/config.py` (`AIC_OLLAMA_MODEL`, `AIC_OLLAMA_BASE_URL`)
  - Client health checks: `aic-electron/renderer/renderer.js`
- **Quick checks**
  - Confirm Ollama responds to `/api/tags`
  - Confirm configured model exists

---

### Data deletion / resets

#### Everything “suddenly empty” (journal/chat/knowledge)
- **Likely causes**
  - Delete-all executed
  - DB file removed from `data/` folder (manual cleanup, reinstall)
- **Where to look**
  - Backend route: `aic-backend/app/api/routes.py` (delete_all endpoint)
  - Deletion implementation: `aic-backend/app/storage/admin.py`
  - UI trigger: `aic-electron/renderer/settings.js`

---

## Architectural quick map (for debugging)

- **Electron renderer** talks to backend over HTTP at `http://127.0.0.1:8000` (see `aic-electron/renderer/renderer.js`).
- **Electron main** is responsible for starting the backend (dev: `aic-backend/run_dev.bat`, packaged: `aic-backend.exe`) — see `aic-electron/main.js`.
- **Backend storage** is SQLite under `aic-backend/data/aic.db` (see `DEFAULT_DB_PATH` in `aic-backend/app/storage/database.py`).
- **“Delete all”** removes `aic-backend/data/` entirely (see `aic-backend/app/storage/admin.py`).

---

## Maintenance (how this doc stays useful)

- **At the end of every debugging session**, update this file if additional information surfaced that is **not yet entered** and would be useful for future debugging (e.g. new symptoms, new likely causes, new “where to look” paths, or quick checks that worked).
- Add new symptom entries using the same structure: **Symptom** → Likely causes → Where to look → Quick checks. Add new top-level subsections under “Symptom index” as new areas of the app gain complexity.
- This reference is expected to **grow** as the project grows; keep it as a searchable index so the next session can find relevant clues quickly.
