import json
from pathlib import Path
from typing import Dict, List

from app.ingestion.chunking import chunk_text
from app.ingestion.extraction_runner import extract_and_store, LLMUnavailableError
from app.ingestion.hashing import hash_text
from app.llm.embedding import embed_text
from app.storage.chunks import create_chunks
from app.storage.items import create_item, get_item_by_path_and_hash, update_item_status
from app.storage.vector_store import EmbeddingRecord, add_embeddings, now_iso
import uuid


def _find_watch_history(root: Path) -> Path | None:
    candidates = [
        root / "YouTube and YouTube Music" / "history" / "watch-history.json",
        root / "history" / "watch-history.json",
        root / "watch-history.json",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    for path in root.rglob("watch-history.json"):
        return path
    return None


def _parse_watch_history(data: List[Dict]) -> List[Dict]:
    items: List[Dict] = []
    for entry in data:
        title = entry.get("title", "")
        time = entry.get("time", "")
        url = entry.get("titleUrl", "")
        if not title:
            continue
        text = f"{title}\n{url}\n{time}".strip()
        items.append({"text": text, "time": time, "url": url})
    return items


def ingest_youtube_export(export_path: str) -> List[Dict]:
    root = Path(export_path).expanduser().resolve()
    history_file = _find_watch_history(root)
    if not history_file:
        return [{"status": "failed", "reason": "watch_history_not_found"}]

    data = json.loads(history_file.read_text(encoding="utf-8", errors="ignore"))
    entries = _parse_watch_history(data)
    results: List[Dict] = []

    for idx, entry in enumerate(entries):
        content = entry["text"]
        content_hash = hash_text(content)
        external_id = f"yt_watch_{idx}"
        existing = get_item_by_path_and_hash(external_id, content_hash)
        if existing:
            update_item_status(existing["id"], "skipped")
            results.append({"id": external_id, "status": "skipped"})
            continue

        item_id = create_item(
            source_type="youtube_export",
            source_ref=str(history_file),
            path_or_id=external_id,
            content_hash=content_hash,
            raw_meta={"time": entry.get("time"), "url": entry.get("url")},
            ingestion_status="new",
        )

        chunks = chunk_text(content)
        chunk_ids = create_chunks(item_id, chunks)
        try:
            extract_and_store(item_id, chunks)
        except LLMUnavailableError:
            from app.storage.database import get_connection
            conn = get_connection()
            cur = conn.cursor()
            for cid in chunk_ids:
                cur.execute("DELETE FROM chunks WHERE id = ?", (cid,))
            cur.execute("DELETE FROM items WHERE id = ?", (item_id,))
            conn.commit()
            conn.close()
            return [{"status": "failed", "reason": "llm_unavailable"}]
        embeddings = []
        for chunk_id, chunk_text_value in zip(chunk_ids, chunks):
            embeddings.append(
                EmbeddingRecord(
                    id=str(uuid.uuid4()),
                    item_id=item_id,
                    chunk_id=chunk_id,
                    embedding=embed_text(chunk_text_value),
                    created_at=now_iso(),
                )
            )
        add_embeddings(item_id, embeddings)
        update_item_status(item_id, "processed")
        results.append({"id": external_id, "status": "processed"})

    return results
