"""LLM analysis runs tracking."""

import uuid
from datetime import datetime, timezone
from typing import Optional

from app.storage.database import get_connection


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_run(item_id: str, model: str, status: str = "started") -> str:
    """Create an LLM analysis run record."""
    run_id = str(uuid.uuid4())
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO llm_analysis_runs (id, item_id, model, status, created_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (run_id, item_id, model, status, now_iso()),
    )
    conn.commit()
    conn.close()
    return run_id


def update_run_status(run_id: str, status: str) -> None:
    """Update run status (e.g. 'completed', 'failed')."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE llm_analysis_runs SET status = ? WHERE id = ?",
        (status, run_id),
    )
    conn.commit()
    conn.close()


def get_last_run_for_item(item_id: str) -> Optional[dict]:
    """Get the most recent successful run for an item."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT id, item_id, model, status, created_at
        FROM llm_analysis_runs
        WHERE item_id = ? AND status = 'completed'
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (item_id,),
    )
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def list_items_needing_analysis(limit: int = 100) -> list[str]:
    """Return item_ids that have chunks but no completed LLM analysis."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT DISTINCT c.item_id
        FROM chunks c
        LEFT JOIN llm_analysis_runs r ON r.item_id = c.item_id AND r.status = 'completed'
        WHERE r.id IS NULL
        LIMIT ?
        """,
        (limit,),
    )
    rows = cursor.fetchall()
    conn.close()
    return [row["item_id"] for row in rows]


def list_items_with_chunks(limit: int = 100) -> list[str]:
    """Return all item_ids that have chunks (for force re-analyze)."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT DISTINCT item_id FROM chunks LIMIT ?",
        (limit,),
    )
    rows = cursor.fetchall()
    conn.close()
    return [row["item_id"] for row in rows]
