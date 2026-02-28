import uuid
from datetime import datetime, timezone
from typing import Optional

from app.storage.database import get_connection


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_entity(entity_type: str, label: str, source: str | None = None) -> str:
    entity_id = str(uuid.uuid4())
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO entities (id, type, label, created_at, source)
        VALUES (?, ?, ?, ?, ?)
        """,
        (entity_id, entity_type, label, now_iso(), source or "legacy"),
    )
    conn.commit()
    conn.close()
    return entity_id


def find_entity(entity_type: str, label: str) -> Optional[str]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id FROM entities WHERE type = ? AND label = ? LIMIT 1",
        (entity_type, label),
    )
    row = cursor.fetchone()
    conn.close()
    return row["id"] if row else None


def list_entities(limit: int = 200, source: str | None = None) -> list[dict]:
    conn = get_connection()
    cursor = conn.cursor()
    if source:
        cursor.execute(
            """
            SELECT id, type, label, created_at, source
            FROM entities
            WHERE source = ?
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (source, limit),
        )
    else:
        cursor.execute(
            """
            SELECT id, type, label, created_at, source
            FROM entities
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (limit,),
        )
    rows = cursor.fetchall()
    conn.close()
    return [
        {
            "id": row["id"],
            "type": row["type"],
            "label": row["label"],
            "created_at": row["created_at"],
            "source": row.get("source"),
        }
        for row in rows
    ]


def list_entities_by_label(label: str) -> list[dict]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT id, type, label, created_at
        FROM entities
        WHERE label = ?
        """,
        (label,),
    )
    rows = cursor.fetchall()
    conn.close()
    return [
        {
            "id": row["id"],
            "type": row["type"],
            "label": row["label"],
            "created_at": row["created_at"],
        }
        for row in rows
    ]


def update_entity_label(entity_id: str, label: str) -> None:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE entities SET label = ? WHERE id = ?",
        (label, entity_id),
    )
    conn.commit()
    conn.close()


def delete_entity(entity_id: str) -> None:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM entities WHERE id = ?", (entity_id,))
    conn.commit()
    conn.close()


def _is_garbage_label(label: str) -> bool:
    """Entity labels that are noise and should not be shown."""
    if not label or not isinstance(label, str):
        return True
    label = label.strip()
    return len(label) < 3 or label.isnumeric()


def cleanup_garbage_entities() -> int:
    """
    Delete entities with garbage labels (numeric, len<3) and legacy source.
    Returns count of deleted entities.
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, label, source FROM entities",
    )
    rows = cursor.fetchall()
    to_delete = [row["id"] for row in rows if _is_garbage_label(row.get("label") or "")]
    for eid in to_delete:
        cursor.execute("DELETE FROM provenance WHERE target_type = 'entity' AND target_id = ?", (eid,))
        cursor.execute("DELETE FROM relations WHERE from_entity_id = ? OR to_entity_id = ?", (eid, eid))
        cursor.execute("DELETE FROM conflicts WHERE entity_id = ? OR conflicting_entity_id = ?", (eid, eid))
        cursor.execute("DELETE FROM entities WHERE id = ?", (eid,))
    conn.commit()
    conn.close()
    return len(to_delete)


def merge_entities(source_id: str, target_id: str) -> None:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE relations SET from_entity_id = ? WHERE from_entity_id = ?",
        (target_id, source_id),
    )
    cursor.execute(
        "UPDATE relations SET to_entity_id = ? WHERE to_entity_id = ?",
        (target_id, source_id),
    )
    cursor.execute(
        "UPDATE provenance SET target_id = ? WHERE target_type = 'entity' AND target_id = ?",
        (target_id, source_id),
    )
    cursor.execute("DELETE FROM entities WHERE id = ?", (source_id,))
    conn.commit()
    conn.close()
