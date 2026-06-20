"""Recompute stored embeddings from chunk text using current embedding function."""

from __future__ import annotations

import json
from pathlib import Path

from app.storage.database import get_connection
from app.llm.embedding import embed_text


def reembed_all() -> int:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT e.id AS embedding_id, c.content AS chunk_content
        FROM embeddings e
        JOIN chunks c ON e.chunk_id = c.id
        """
    )
    rows = cur.fetchall()
    updated = 0
    for row in rows:
        content = (row["chunk_content"] or "").strip()
        if not content:
            continue
        vec = embed_text(content)
        cur.execute(
            "UPDATE embeddings SET embedding = ? WHERE id = ?",
            (json.dumps(vec), row["embedding_id"]),
        )
        updated += 1
    conn.commit()
    conn.close()
    return updated


if __name__ == "__main__":
    count = reembed_all()
    print(f"Re-embedded {count} chunk vectors.")
