import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.storage.database import get_connection


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_item(
    source_type: str,
    source_ref: str | None,
    path_or_id: str | None,
    content_hash: str | None,
    raw_meta: Optional[Dict[str, Any]] = None,
    ingestion_status: str | None = None,
) -> str:
    item_id = str(uuid.uuid4())
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO items (id, source_type, source_ref, path_or_id, content_hash, raw_meta, created_at, ingestion_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            item_id,
            source_type,
            source_ref,
            path_or_id,
            content_hash,
            json.dumps(raw_meta) if raw_meta else None,
            now_iso(),
            ingestion_status,
        ),
    )
    conn.commit()
    conn.close()
    return item_id


def get_item(item_id: str) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, source_type, source_ref, path_or_id, content_hash, raw_meta, created_at, ingestion_status FROM items WHERE id = ?",
        (item_id,),
    )
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    return {
        "id": row["id"],
        "source_type": row["source_type"],
        "source_ref": row["source_ref"],
        "path_or_id": row["path_or_id"],
        "content_hash": row["content_hash"],
        "raw_meta": json.loads(row["raw_meta"]) if row["raw_meta"] else None,
        "created_at": row["created_at"],
        "ingestion_status": row["ingestion_status"],
    }


def get_item_by_path(path_or_id: str) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT id, source_type, source_ref, path_or_id, content_hash, raw_meta, created_at, ingestion_status
        FROM items
        WHERE path_or_id = ?
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (path_or_id,),
    )
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    return {
        "id": row["id"],
        "source_type": row["source_type"],
        "source_ref": row["source_ref"],
        "path_or_id": row["path_or_id"],
        "content_hash": row["content_hash"],
        "raw_meta": json.loads(row["raw_meta"]) if row["raw_meta"] else None,
        "created_at": row["created_at"],
        "ingestion_status": row["ingestion_status"],
    }


def get_item_by_path_and_hash(path_or_id: str, content_hash: str) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT id, source_type, source_ref, path_or_id, content_hash, raw_meta, created_at, ingestion_status
        FROM items
        WHERE path_or_id = ? AND content_hash = ?
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (path_or_id, content_hash),
    )
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    return {
        "id": row["id"],
        "source_type": row["source_type"],
        "source_ref": row["source_ref"],
        "path_or_id": row["path_or_id"],
        "content_hash": row["content_hash"],
        "raw_meta": json.loads(row["raw_meta"]) if row["raw_meta"] else None,
        "created_at": row["created_at"],
        "ingestion_status": row["ingestion_status"],
    }


def update_item_status(item_id: str, ingestion_status: str) -> None:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE items SET ingestion_status = ? WHERE id = ?",
        (ingestion_status, item_id),
    )
    conn.commit()
    conn.close()


def update_item_hash(item_id: str, content_hash: str) -> None:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE items SET content_hash = ? WHERE id = ?",
        (content_hash, item_id),
    )
    conn.commit()
    conn.close()


def list_items(limit: int = 100) -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, source_type, source_ref, path_or_id, content_hash, raw_meta, created_at, ingestion_status FROM items ORDER BY created_at DESC LIMIT ?",
        (limit,),
    )
    rows = cursor.fetchall()
    conn.close()
    items: List[Dict[str, Any]] = []
    for row in rows:
        items.append(
            {
                "id": row["id"],
                "source_type": row["source_type"],
                "source_ref": row["source_ref"],
                "path_or_id": row["path_or_id"],
                "content_hash": row["content_hash"],
                "raw_meta": json.loads(row["raw_meta"]) if row["raw_meta"] else None,
                "created_at": row["created_at"],
                "ingestion_status": row["ingestion_status"],
            }
        )
    return items
