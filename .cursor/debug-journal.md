# Debug journal

Use this file to record what you do and discover during debugging so the next session can resume quickly. **Update it at the end of each debug session** (findings, hypotheses rejected, fixes applied, open questions).

---

## Session: Journal "Reflect on this" + entry not persisting (2026-02-28)

### User report
- Save Entry → entry appears in list → "Reflect on this" → error "No journal entry found. Save an entry first."
- After restarting Electron and backend, the entry that had appeared (and the one from the earlier screenshot) is no longer visible. Entries appear to save but do not persist across restart.

### Hypotheses tested (instrumentation in `renderer.js` + `routes.py`)
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
- `aic-electron/renderer/renderer.js`: save response check; reflect now resolves latest entry id client-side and sends `entry_id`; unsaved-save check.
- `aic-backend/app/api/routes.py`: debug log regions (to remove after verification).
- `aic-backend/app/main.py`: on startup append one line to `.cursor/debug.log` with `message: backend_startup` and `data.db_path` (resolved `DEFAULT_DB_PATH`) for persistence debugging.

---

*Next session: append a new "Session: ..." section with date and topic, and update open/follow-up as needed.*
