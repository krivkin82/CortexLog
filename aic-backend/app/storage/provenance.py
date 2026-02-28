import uuid
from datetime import datetime, timezone

from app.storage.database import get_connection


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_provenance(
    target_type: str,
    target_id: str,
    source_item_id: str,
    classification: str,
    confidence: str,
    extracted_by: str,
) -> str:
    prov_id = str(uuid.uuid4())
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO provenance (id, target_type, target_id, source_item_id, extracted_at, classification, confidence, extracted_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            prov_id,
            target_type,
            target_id,
            source_item_id,
            now_iso(),
            classification,
            confidence,
            extracted_by,
        ),
    )
    conn.commit()
    conn.close()
    return prov_id


def list_entities_for_item(item_id: str) -> list[str]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT target_id FROM provenance
        WHERE target_type = 'entity' AND source_item_id = ?
        """,
        (item_id,),
    )
    rows = cursor.fetchall()
    conn.close()
    return [row["target_id"] for row in rows]


def list_provenance_for_entity(entity_id: str, include_source_path: bool = True) -> list[dict]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT p.id, p.target_type, p.target_id, p.source_item_id, p.extracted_at,
               p.classification, p.confidence, p.extracted_by, i.path_or_id as source_path
        FROM provenance p
        LEFT JOIN items i ON i.id = p.source_item_id
        WHERE p.target_type = 'entity' AND p.target_id = ?
        ORDER BY p.extracted_at DESC
        """,
        (entity_id,),
    )
    rows = cursor.fetchall()
    conn.close()
    return [
        {
            "id": row["id"],
            "target_type": row["target_type"],
            "target_id": row["target_id"],
            "source_item_id": row["source_item_id"],
            "extracted_at": row["extracted_at"],
            "classification": row["classification"],
            "confidence": row["confidence"],
            "extracted_by": row["extracted_by"],
            "source_path": row["source_path"] if include_source_path else None,
        }
        for row in rows
    ]
