from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Iterator, List

from app.ingestion.chunking import chunk_text
from app.ingestion.extraction_runner import extract_and_store, LLMUnavailableError
from app.ingestion.hashing import hash_file
from app.ingestion.text_extraction import extract_text
from app.llm.embedding import embed_text
from app.storage.chunks import create_chunks
from app.storage.items import (
    create_item,
    get_item_by_path_and_hash,
    update_item_hash,
    update_item_status,
)
import uuid

from app.storage.vector_store import EmbeddingRecord, add_embeddings, now_iso


SUPPORTED_EXTENSIONS = {".txt", ".md", ".pdf", ".docx"}


@dataclass
class IngestionResult:
    path: str
    status: str
    item_id: str | None = None
    reason: str | None = None


def iter_files(paths: Iterable[Path]) -> Iterable[Path]:
    for root in paths:
        if root.is_file():
            yield root
            continue
        for path in root.rglob("*"):
            if path.is_file():
                yield path


def ingest_local_paths(paths: List[str]) -> List[IngestionResult]:
    roots = [Path(path).expanduser().resolve() for path in paths]
    results: List[IngestionResult] = []
    for file_path in iter_files(roots):
        if file_path.suffix.lower() not in SUPPORTED_EXTENSIONS:
            results.append(
                IngestionResult(
                    path=str(file_path),
                    status="failed",
                    reason="unsupported_format",
                )
            )
            continue
        try:
            results.append(ingest_file(file_path))
        except LLMUnavailableError as e:
            results.append(
                IngestionResult(
                    path=str(file_path),
                    status="failed",
                    reason="llm_unavailable",
                    item_id=None,
                )
            )
            return results
    return results


def ingest_local_paths_streaming(paths: List[str]) -> Iterator[dict]:
    """Yield NDJSON events as ingestion progresses."""
    roots = [Path(path).expanduser().resolve() for path in paths]
    supported = [
        fp
        for fp in iter_files(roots)
        if fp.suffix.lower() in SUPPORTED_EXTENSIONS
    ]
    total = len(supported)
    yield {"event": "started", "total": total}

    results: List[IngestionResult] = []
    for file_path in iter_files(roots):
        if file_path.suffix.lower() not in SUPPORTED_EXTENSIONS:
            results.append(
                IngestionResult(
                    path=str(file_path),
                    status="failed",
                    reason="unsupported_format",
                )
            )
            yield {
                "event": "file_done",
                "path": str(file_path),
                "status": "failed",
                "reason": "unsupported_format",
            }
            continue
        yield {"event": "file_start", "path": str(file_path)}
        try:
            result = ingest_file(file_path)
            results.append(result)
            yield {
                "event": "file_done",
                "path": result.path,
                "status": result.status,
                "reason": result.reason,
            }
        except LLMUnavailableError:
            results.append(
                IngestionResult(
                    path=str(file_path),
                    status="failed",
                    reason="llm_unavailable",
                    item_id=None,
                )
            )
            yield {
                "event": "error",
                "message": "LLM unavailable. Ingestion stopped. Start Ollama (ollama serve) and ensure the model is available, then try again.",
            }
            yield {
                "event": "complete",
                "results": [r.__dict__ for r in results],
            }
            return
    yield {"event": "complete", "results": [r.__dict__ for r in results]}


def ingest_file(path: Path) -> IngestionResult:
    try:
        content_hash = hash_file(path)
    except OSError:
        return IngestionResult(path=str(path), status="failed", reason="file_read_error")
    existing = get_item_by_path_and_hash(str(path), content_hash)
    if existing:
        update_item_status(existing["id"], "skipped")
        return IngestionResult(path=str(path), status="skipped", item_id=existing["id"])

    try:
        raw_text = extract_text(path)
    except Exception:
        return IngestionResult(path=str(path), status="failed", reason="extract_error")
    if raw_text is None:
        return IngestionResult(path=str(path), status="failed", reason="unsupported_format")

    item_id = create_item(
        source_type="local_file",
        source_ref=None,
        path_or_id=str(path),
        content_hash=content_hash,
        raw_meta={
            "file_name": path.name,
            "file_size": path.stat().st_size,
            "extension": path.suffix.lower(),
        },
        ingestion_status="new",
    )

    chunks = chunk_text(raw_text)
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
        raise
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
    update_item_hash(item_id, content_hash)
    update_item_status(item_id, "processed")
    return IngestionResult(path=str(path), status="processed", item_id=item_id)
