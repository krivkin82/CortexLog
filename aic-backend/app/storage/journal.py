import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.storage.database import get_connection


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_journal_entry(
    content: str,
    structured_fields: Optional[Dict[str, Any]] = None,
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    entry_id = str(uuid.uuid4())
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO journal_entries (id, content, structured_fields, created_at, user_id)
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            entry_id,
            content,
            json.dumps(structured_fields) if structured_fields else None,
            now_iso(),
            user_id,
        ),
    )
    conn.commit()
    conn.close()
    return {
        "id": entry_id,
        "content": content,
        "structured_fields": structured_fields,
        "user_id": user_id,
    }


def list_journal_entries(limit: int = 50, order: str = "ASC") -> List[Dict[str, Any]]:
    """Return journal entries. order='ASC' for oldest-first (feed), 'DESC' for newest-first."""
    conn = get_connection()
    cursor = conn.cursor()
    order_clause = "ASC" if order.upper() == "ASC" else "DESC"
    cursor.execute(
        f"""
        SELECT id, content, structured_fields, created_at, user_id, reflection
        FROM journal_entries
        ORDER BY created_at {order_clause}
        LIMIT ?
        """,
        (limit,),
    )
    rows = cursor.fetchall()
    conn.close()
    entries: List[Dict[str, Any]] = []
    for row in rows:
        entries.append(
            {
                "id": row["id"],
                "content": row["content"],
                "structured_fields": json.loads(row["structured_fields"]) if row["structured_fields"] else None,
                "created_at": row["created_at"],
                "user_id": row["user_id"],
                "reflection": (row["reflection"] or None) if "reflection" in row.keys() else None,
            }
        )
    return entries


def delete_journal_entry(entry_id: str) -> bool:
    """Delete a journal entry by id. Returns True if deleted."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM journal_entries WHERE id = ?", (entry_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted


def update_journal_reflection(entry_id: str, reflection: str) -> bool:
    """Update the reflection on a journal entry. Returns True if updated."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE journal_entries SET reflection = ? WHERE id = ?",
        (reflection, entry_id),
    )
    updated = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return updated


def clear_journal_reflection(entry_id: str) -> bool:
    """Clear the reflection on a journal entry. Returns True if cleared."""
    return update_journal_reflection(entry_id, "")


def get_journal_entry(entry_id: str) -> Dict[str, Any] | None:
    """Return a single journal entry by id, or None if not found."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT id, content, structured_fields, created_at, user_id, reflection
        FROM journal_entries
        WHERE id = ?
        """,
        (entry_id,),
    )
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    return {
        "id": row["id"],
        "content": row["content"],
        "structured_fields": json.loads(row["structured_fields"]) if row["structured_fields"] else None,
        "created_at": row["created_at"],
        "user_id": row["user_id"],
        "reflection": (row["reflection"] or None) if "reflection" in row.keys() else None,
    }
