import uuid
from datetime import datetime, timezone
from typing import List

from app.storage.database import get_connection


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_chunks(item_id: str, chunks: List[str]) -> List[str]:
    conn = get_connection()
    cursor = conn.cursor()
    chunk_ids: List[str] = []
    for idx, content in enumerate(chunks):
        chunk_id = str(uuid.uuid4())
        cursor.execute(
            """
            INSERT INTO chunks (id, item_id, chunk_index, content, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (chunk_id, item_id, idx, content, now_iso()),
        )
        chunk_ids.append(chunk_id)
    conn.commit()
    conn.close()
    return chunk_ids


def get_chunks_for_item(item_id: str) -> List[dict]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, item_id, chunk_index, content, created_at FROM chunks WHERE item_id = ? ORDER BY chunk_index ASC",
        (item_id,),
    )
    rows = cursor.fetchall()
    conn.close()
    return [
        {
            "id": row["id"],
            "item_id": row["item_id"],
            "chunk_index": row["chunk_index"],
            "content": row["content"],
            "created_at": row["created_at"],
        }
        for row in rows
    ]
