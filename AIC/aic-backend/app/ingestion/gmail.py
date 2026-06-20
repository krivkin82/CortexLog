import base64
from typing import Dict, List

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

from app.ingestion.chunking import chunk_text
from app.ingestion.extraction_runner import extract_and_store, LLMUnavailableError
from app.ingestion.hashing import hash_text
from app.llm.embedding import embed_text
from app.storage.chunks import create_chunks
from app.storage.items import create_item, get_item_by_path_and_hash, update_item_status
from app.storage.vector_store import EmbeddingRecord, add_embeddings, now_iso
import uuid


def _decode_base64(data: str) -> str:
    if not data:
        return ""
    decoded = base64.urlsafe_b64decode(data + "==")
    return decoded.decode("utf-8", errors="ignore")


def _extract_headers(payload: Dict) -> Dict[str, str]:
    headers = payload.get("headers", [])
    header_map = {h["name"].lower(): h["value"] for h in headers if "name" in h and "value" in h}
    return {
        "subject": header_map.get("subject", ""),
        "from": header_map.get("from", ""),
        "date": header_map.get("date", ""),
    }


def _extract_body(payload: Dict) -> str:
    if "body" in payload and payload["body"].get("data"):
        return _decode_base64(payload["body"]["data"])
    for part in payload.get("parts", []):
        if part.get("mimeType") == "text/plain":
            return _decode_base64(part.get("body", {}).get("data", ""))
    return ""


def ingest_gmail_messages(
    access_token: str,
    user_id: str = "me",
    include_body: bool = False,
    max_results: int = 50,
) -> List[Dict]:
    creds = Credentials(token=access_token)
    service = build("gmail", "v1", credentials=creds)
    response = service.users().messages().list(userId=user_id, maxResults=max_results).execute()
    messages = response.get("messages", [])

    results: List[Dict] = []
    for msg in messages:
        msg_id = msg["id"]
        detail = service.users().messages().get(userId=user_id, id=msg_id, format="full").execute()
        payload = detail.get("payload", {})
        headers = _extract_headers(payload)
        body = _extract_body(payload) if include_body else detail.get("snippet", "")
        content_hash = hash_text(body)

        existing = get_item_by_path_and_hash(msg_id, content_hash)
        if existing:
            update_item_status(existing["id"], "skipped")
            results.append({"id": msg_id, "status": "skipped"})
            continue

        item_id = create_item(
            source_type="gmail",
            source_ref=user_id,
            path_or_id=msg_id,
            content_hash=content_hash,
            raw_meta={
                "subject": headers.get("subject"),
                "from": headers.get("from"),
                "date": headers.get("date"),
            },
            ingestion_status="new",
        )

        if body:
            chunks = chunk_text(body)
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
        results.append({"id": msg_id, "status": "processed"})

    return results
