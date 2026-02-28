import json
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable, List

from app.storage.database import get_connection


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class EmbeddingRecord:
    id: str
    item_id: str
    chunk_id: str | None
    embedding: List[float]
    created_at: str


def add_embeddings(item_id: str, embeddings: Iterable[EmbeddingRecord]) -> None:
    conn = get_connection()
    cursor = conn.cursor()
    for record in embeddings:
        cursor.execute(
            """
            INSERT INTO embeddings (id, item_id, chunk_id, embedding, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                record.id,
                item_id,
                record.chunk_id,
                json.dumps(record.embedding),
                record.created_at,
            ),
        )
    conn.commit()
    conn.close()


def add_embedding(
    item_id: str,
    embedding: List[float],
    chunk_id: str | None = None,
) -> EmbeddingRecord:
    record = EmbeddingRecord(
        id=str(uuid.uuid4()),
        item_id=item_id,
        chunk_id=chunk_id,
        embedding=embedding,
        created_at=now_iso(),
    )
    add_embeddings(item_id, [record])
    return record


def get_embeddings_for_item(item_id: str) -> List[EmbeddingRecord]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, item_id, chunk_id, embedding, created_at FROM embeddings WHERE item_id = ?",
        (item_id,),
    )
    rows = cursor.fetchall()
    conn.close()
    records: List[EmbeddingRecord] = []
    for row in rows:
        records.append(
            EmbeddingRecord(
                id=row["id"],
                item_id=row["item_id"],
                chunk_id=row["chunk_id"],
                embedding=json.loads(row["embedding"]) if row["embedding"] else [],
                created_at=row["created_at"],
            )
        )
    return records


def delete_embeddings_for_item(item_id: str) -> None:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM embeddings WHERE item_id = ?", (item_id,))
    conn.commit()
    conn.close()
