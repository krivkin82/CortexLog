# Journal Pagination Follow-up (Design Only)

## Goal

Add bounded, incremental journal history loading without changing journal reflection prompt behavior.

## Current state

- Frontend calls `GET /journal` and loads all returned entries into state.
- Backend currently returns a bounded list (internal default limit), but the API does not expose pagination controls.
- UI "See previous entries" only toggles visibility of already loaded items.

## Proposed API contract

### Request

- `GET /journal?limit=20`
- `GET /journal?limit=20&before=<created_at_iso>`

### Response

```json
{
  "entries": [
    {
      "id": "entry_id",
      "content": "text",
      "created_at": "2026-06-20T12:00:00Z",
      "reflection": "optional"
    }
  ],
  "has_more": true,
  "next_before": "2026-06-20T11:32:10Z"
}
```

Notes:
- Return entries newest-first for paging consistency.
- `next_before` should be the oldest timestamp in the returned page.
- `limit` should be clamped server-side (e.g. min 1, max 100).

## Backend changes (follow-up task)

1. Update `GET /journal` route to accept optional `limit` and `before`.
2. Extend storage query to support `created_at < before` filtering.
3. Return pagination metadata (`has_more`, `next_before`).
4. Add/verify index on `journal_entries.created_at` for query performance.
5. Add route tests for first page, subsequent page, and exhausted page.

## Frontend changes (follow-up task)

1. Replace one-shot load with:
   - initial `GET /journal?limit=20`
   - incremental `loadMore` using `next_before`
2. Keep newest entry view unchanged.
3. Keep reflection flow unchanged; pagination only affects history retrieval.
4. Add UI state for loading-more and no-more-items.

## Suggested rollout

1. Backend pagination API + tests.
2. Frontend load-more UI wiring.
3. Manual perf test with large journal history.
