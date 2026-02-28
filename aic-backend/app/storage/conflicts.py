import uuid
from datetime import datetime, timezone
from typing import List

from app.storage.database import get_connection


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_conflict(entity_id: str, conflicting_entity_id: str, reason: str) -> str:
    conflict_id = str(uuid.uuid4())
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO conflicts (id, entity_id, conflicting_entity_id, reason, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (conflict_id, entity_id, conflicting_entity_id, reason, "pending", now_iso()),
    )
    conn.commit()
    conn.close()
    return conflict_id


def list_conflicts(status: str | None = None) -> List[dict]:
    conn = get_connection()
    cursor = conn.cursor()
    if status:
        cursor.execute(
            """
            SELECT id, entity_id, conflicting_entity_id, reason, status, created_at
            FROM conflicts
            WHERE status = ?
            ORDER BY created_at DESC
            """,
            (status,),
        )
    else:
        cursor.execute(
            """
            SELECT id, entity_id, conflicting_entity_id, reason, status, created_at
            FROM conflicts
            ORDER BY created_at DESC
            """
        )
    rows = cursor.fetchall()
    conn.close()
    return [
        {
            "id": row["id"],
            "entity_id": row["entity_id"],
            "conflicting_entity_id": row["conflicting_entity_id"],
            "reason": row["reason"],
            "status": row["status"],
            "created_at": row["created_at"],
        }
        for row in rows
    ]


def update_conflict_status(conflict_id: str, status: str) -> None:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE conflicts SET status = ? WHERE id = ?",
        (status, conflict_id),
    )
    conn.commit()
    conn.close()
