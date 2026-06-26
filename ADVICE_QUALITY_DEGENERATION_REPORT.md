# Advice Quality Degeneration Report

Prepared: 2026-06-21

Project: CortexLog

Purpose: This report summarizes recent issues where CortexLog's journal/advice responses became more rigid, less natural, and less continuity-aware than direct model output. It is written for review by an outside model or reviewer that does not have Cursor canvas support.

## Executive Summary

Recent journal and advice responses degenerated in quality because CortexLog's orchestration and memory paths changed what the model saw and how it was asked to answer. The primary regression was not evidence that the underlying model had become worse. The same local model, when prompted directly through Ollama, produced more natural output for the same journal content.

The largest confirmed cause was the response-contract harness. It classified the user's intent, selected explicit answer shapes, validated output against those shapes, and retried/repair-generated toward them. For journal entries, that could turn reflective material into rigid formats such as `Option 1 / Option 2 / Recommendation`.

Several fixes have already landed: active journal/explore generation now uses a direct completion path, journal reflection passes raw entry content, embeddings are deterministic across restarts, journal entries are indexed for retrieval, current-entry self-retrieval is excluded, and chat history now fetches the latest messages before chronological replay.

The main remaining risk is journal reflection continuity. The current code defines `JOURNAL_REFLECT_SESSION_ID`, but `/journal/reflect` currently calls `generate_response(..., session_id=None)`, so the intended dedicated journal reflection continuity session is not active in that route.

## Current Readout

The biggest remaining product risk is continuity ambiguity in journal reflections. The code defines a dedicated journal reflection session id, but the current route passes `session_id=None`, so the intended continuity behavior is not active there.

Summary metrics from the incident review:

- Confirmed degeneration clusters: 2
- Primary fixes already applied: 5
- High-risk follow-up items: 1
- Known data-loss findings: 0

## What Degenerated

| Area | Observed effect | Current status |
| --- | --- | --- |
| Template pressure | Journal advice drifted into `Option 1 / Option 2 / Recommendation` even when the entry called for reflection. | Fixed in active path |
| Prompt wrapping | The journal route sent scaffolded reflection instructions rather than the raw entry, biasing model intent. | Fixed |
| Memory retrieval | Advice quality varied after restarts and prior journal context could be missed or self-retrieved. | Partially fixed |
| Continuity | Long sessions could feel amnesiac when history lookup kept earliest rows instead of latest rows. | Fixed for chat |
| Residual role/tone risk | Current instrumentation is still watching for inflated praise, first-person role confusion, and over-interpretation. | Needs cleanup and eval |

## Root Cause Model

Qualitative contribution to the degeneration:

- Response-contract harness: 40%
- Prompt wrapping: 20%
- Retrieval/memory instability: 20%
- Continuity/history behavior: 15%
- Residual tone/role risk: 5%

The contract harness contributed the most: it selected explicit answer shapes, validated against them, and retried toward those same shapes. Retrieval and continuity issues then made otherwise usable advice feel inconsistent or detached.

## Mechanism

### 1. Output-shape templates overrode the entry

The legacy response contract includes labels such as `option 1`, `option 2`, and `recommendation`, plus journal task shapes like `options_with_tradeoffs`. Once selected, validation and repair made those shapes sticky.

Relevant file:

- `aic-backend/app/llm/response_contract.py`

Important observed legacy structures:

- `OUTPUT_SHAPES` includes `options_with_tradeoffs`, `implementation_recommendation`, `step_by_step_plan`, and `decision_memo`.
- `_JOURNAL_TASK_SHAPES` includes `options_with_tradeoffs`, `step_by_step_plan`, `implementation_recommendation`, and `decision_memo`.
- `_SUMMARY_TEMPLATE_LABELS` includes `option 1`, `option 2`, `recommendation`, `upside`, and `downside`.

This explains why a reflective journal entry could be forced into a decision-support shape even when the user's entry did not ask for options.

### 2. Journal prompts were not raw enough

The journal route previously wrapped entries in reflective scaffolding. That made the model respond to CortexLog's framing, not just the user's entry.

The active route now passes raw `entry_content` into `generate_response(...)`:

- `aic-backend/app/api/routes.py`
- Route: `POST /journal/reflect`

### 3. Memory quality was unstable

Retrieval quality could degrade after backend restart because the old embedding path used randomized Python token hashing. That made vectors from different interpreter processes incomparable.

The current embedding code uses deterministic token indexing:

- `aic-backend/app/llm/embedding.py`
- Function: `stable_token_index(token, dims)`
- Mechanism: `hashlib.blake2b(..., digest_size=8)`

This stabilizes new embeddings, but older profile databases still need to be re-embedded.

### 4. Journal memory was not reliably indexed

Journal entries created journal rows but previously could be missed by retrieval because they were not always chunked and embedded as retrievable items.

The active journal save path now calls `_index_journal_entry(entry["id"], request.content)`, which:

- Creates an item with `source_type="journal"`.
- Chunks the content.
- Embeds each chunk.
- Stores embeddings with the journal item id.

Relevant file:

- `aic-backend/app/api/routes.py`

### 5. Current-entry self-retrieval wasted context

For reflection, retrieving the current entry itself can consume context slots and make the response echo the current content rather than drawing on prior memory.

The active route now:

- Finds the journal item with `get_item_by_path(entry_id)`.
- Excludes that item id from retrieval via `exclude_item_ids`.
- Filters exact current-entry content from retrieved context.

Relevant files:

- `aic-backend/app/api/routes.py`
- `aic-backend/app/retrieval/search.py`

### 6. Longer conversations could drop recent turns

Chat history previously returned oldest rows first with a limit, which meant long sessions could lose the recent context that mattered most.

The active `list_chat_messages(...)` implementation now:

- Fetches latest rows with `ORDER BY created_at DESC LIMIT ?`.
- Reverses the result for chronological replay.

Relevant file:

- `aic-backend/app/storage/chat.py`

## Timeline

| Date | Event | Finding |
| --- | --- | --- |
| 2026-06-19 | User compared CortexLog journal reflection with direct Ollama output. | Root cause traced to response-contract orchestration and scaffolded journal prompt wrappers. |
| 2026-06-19 | Direct completion path introduced for journal/explore. | Contract classification, validation, repair, retry, and output templates removed from active generation. |
| 2026-06-20 | Memory/retrieval problems investigated. | Deterministic embeddings, journal indexing, current-entry exclusion, latest-first history, and non-system retrieval context were added. |
| 2026-06-21 | Current code reviewed for report. | A journal continuity discrepancy remains: `JOURNAL_REFLECT_SESSION_ID` exists, but `/journal/reflect` passes `session_id=None`. |

## Fixes Already Landed

### Generation path

`aic-backend/app/llm/response.py` now calls direct `chat_completion()` instead of the response contract harness. Active journal/explore routes no longer depend on contract classification, validation, repair, or retry loops.

### Journal input

`/journal/reflect` passes raw `entry_content`, retrieves earlier context separately, and excludes the current journal item from retrieval.

### Retrieval stability

`embed_text()` now uses `blake2b` deterministic token indexes, and new journal entries are chunked and embedded on save.

### History ordering

`list_chat_messages()` fetches the latest rows by descending timestamp, then reverses them for chronological replay to the model.

### Context authority

Retrieved material is supplied as user-context content rather than system authority, reducing the chance that memory snippets dominate the assistant's behavioral instructions.

### Local model context

Ollama settings now include `local_num_ctx` and pass `num_ctx`, improving headroom for longer context without silently clipping useful history.

## Residual Risks

| Risk | Evidence | Severity |
| --- | --- | --- |
| Journal reflection continuity may not be active | `aic-backend/app/api/routes.py` defines `JOURNAL_REFLECT_SESSION_ID`, but `generate_response(...)` is called with `session_id=None` and reflection messages are not stored. | High |
| Temporary quality-debug logging remains | `response.py` and `routes.py` still write `debug-eff0ce.log` metadata around prompt assembly, output style, and retrieval. | Medium |
| Existing vectors still need migration | Stable hashing fixes new embeddings, but older profile databases need `aic-backend/scripts/reembed_chunks.py` run once. | Medium |
| No formal advice-quality regression suite | Verification is mostly compile/lint plus prompt assembly sanity checks; representative prompts should be captured. | Medium |
| Legacy response-contract code remains | `response_contract.py` is marked legacy, but old setting names and templates can confuse future debugging if not clearly isolated. | Low |

## Recommended Next Actions

1. Decide whether journal reflections should keep a dedicated continuity session. If yes, pass `JOURNAL_REFLECT_SESSION_ID` into `generate_response(...)` and store journal reflection user/assistant turns.

2. Remove temporary `debug-eff0ce.log` instrumentation once the residual role/tone issue is either fixed or captured by tests.

3. Run `python scripts/reembed_chunks.py` once per profile database to regenerate existing vectors with stable token indexes.

4. Create a small advice-quality eval set comparing direct model behavior against CortexLog for reflective, practical, memory-heavy, and crisis-adjacent entries.

5. Audit remaining `response_contract_*` settings and UI labels so the legacy harness cannot be mistaken for active behavior.

## Suggested Quality Gate

Before calling this fully resolved, run a fixed prompt set through CortexLog and directly through the same provider/model.

The pass criteria should be:

- No unsolicited option templates.
- No first-person continuation of the user's entry.
- No grandiose praise or inflated interpretation.
- Relevant use of prior memory when available.
- No degradation after backend restart.
- Similar or better directness than the same provider/model outside CortexLog.

## Suggested Eval Prompt Categories

Use representative examples for each category:

1. Reflective journal entry with no request for advice.
2. Journal entry asking for direct practical advice.
3. Entry asking to choose between two concrete options.
4. Entry with prior related journal memory available.
5. Entry after backend restart, using memory that was embedded before restart.
6. Long exploration session where recent turns contradict or refine earlier turns.
7. Crisis-adjacent but non-acute distress entry.
8. Explicit user instruction to avoid emotional analysis and focus on practical steps.

For each test, compare:

- Direct provider/model response.
- CortexLog response without retrieval.
- CortexLog response with retrieval.
- CortexLog response after restart.

## Questions For Outside Reviewer

1. Does the root-cause model explain the observed degeneration, or is another mechanism more likely?

2. Is the recommendation to keep or remove journal reflection continuity sound? If continuity is kept, should it be a hidden dedicated session, per-entry thread, or normal chat session?

3. Should retrieved journal context be supplied as a `user` message, a separate neutral context message, or some other role/format?

4. Are the current journal system prompt constraints too strong, too weak, or appropriate?

5. What minimal eval suite would catch this class of regression before release?

6. Should the legacy `response_contract.py` module be deleted, moved to tests/experiments, or kept as a disabled reference?

## Source Files Reviewed

- `.cursor/debug-journal.md`
- `.cursor/debug-reference.md`
- `aic-backend/app/llm/response.py`
- `aic-backend/app/api/routes.py`
- `aic-backend/app/llm/embedding.py`
- `aic-backend/app/storage/chat.py`
- `aic-backend/app/retrieval/search.py`
- `aic-backend/app/llm/response_contract.py`

## Notes

This report is based on recent debugging notes and current-code review. It does not claim that all quality issues are resolved. The highest-priority unresolved question is whether journal reflection continuity is supposed to exist and, if so, how it should be implemented without reintroducing over-shaped or stale advice.
