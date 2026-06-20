import uuid
from datetime import datetime, timezone

from app.storage.database import get_connection


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_relation(from_entity_id: str, to_entity_id: str, relation_type: str) -> str:
    relation_id = str(uuid.uuid4())
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO relations (id, from_entity_id, to_entity_id, relation_type, created_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (relation_id, from_entity_id, to_entity_id, relation_type, now_iso()),
    )
    conn.commit()
    conn.close()
    return relation_id


def list_relations_for_entity(entity_id: str) -> list[dict]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT id, from_entity_id, to_entity_id, relation_type, created_at
        FROM relations
        WHERE from_entity_id = ? OR to_entity_id = ?
        """,
        (entity_id, entity_id),
    )
    rows = cursor.fetchall()
    conn.close()
    return [
        {
            "id": row["id"],
            "from_entity_id": row["from_entity_id"],
            "to_entity_id": row["to_entity_id"],
            "relation_type": row["relation_type"],
            "created_at": row["created_at"],
        }
        for row in rows
    ]


def list_relations(limit: int = 200) -> list[dict]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT id, from_entity_id, to_entity_id, relation_type, created_at
        FROM relations
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
            "from_entity_id": row["from_entity_id"],
            "to_entity_id": row["to_entity_id"],
            "relation_type": row["relation_type"],
            "created_at": row["created_at"],
        }
        for row in rows
    ]


def delete_relation(relation_id: str) -> None:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM relations WHERE id = ?", (relation_id,))
    conn.commit()
    conn.close()
