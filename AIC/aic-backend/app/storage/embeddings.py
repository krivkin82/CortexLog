import json
from typing import Any, Dict, List

from app.storage.database import get_connection


def list_embeddings_with_chunks() -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT
            embeddings.id as embedding_id,
            embeddings.item_id as item_id,
            embeddings.chunk_id as chunk_id,
            embeddings.embedding as embedding,
            embeddings.created_at as embedding_created_at,
            chunks.content as chunk_content,
            items.created_at as item_created_at
        FROM embeddings
        JOIN chunks ON embeddings.chunk_id = chunks.id
        JOIN items ON items.id = embeddings.item_id
        """
    )
    rows = cursor.fetchall()
    conn.close()
    results: List[Dict[str, Any]] = []
    for row in rows:
        results.append(
            {
                "embedding_id": row["embedding_id"],
                "item_id": row["item_id"],
                "chunk_id": row["chunk_id"],
                "embedding": json.loads(row["embedding"]) if row["embedding"] else [],
                "chunk_content": row["chunk_content"],
                "item_created_at": row["item_created_at"],
                "embedding_created_at": row["embedding_created_at"],
            }
        )
    return results
