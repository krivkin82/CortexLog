import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.storage.database import get_connection


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def add_feedback(
    insight_id: str,
    source_item_id: Optional[str],
    label: str,
    reason: str,
) -> str:
    feedback_id = str(uuid.uuid4())
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO insight_feedback (id, insight_id, source_item_id, label, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (feedback_id, insight_id, source_item_id, label, reason, now_iso()),
    )
    conn.commit()
    conn.close()
    return feedback_id


def list_feedback_for_insight(insight_id: str) -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT id, insight_id, source_item_id, label, reason, created_at
        FROM insight_feedback
        WHERE insight_id = ?
        ORDER BY created_at DESC
        """,
        (insight_id,),
    )
    rows = cursor.fetchall()
    conn.close()
    return [
        {
            "id": row["id"],
            "insight_id": row["insight_id"],
            "source_item_id": row["source_item_id"],
            "label": row["label"],
            "reason": row["reason"],
            "created_at": row["created_at"],
        }
        for row in rows
    ]
