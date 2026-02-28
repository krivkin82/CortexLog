import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List

from app.storage.database import get_connection
from app.storage.feedback import list_feedback_for_insight


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_proposed_insight(
    insight_type: str,
    content: str,
    supporting_sources: List[Dict[str, Any]],
    status: str = "pending",
) -> str:
    insight_id = str(uuid.uuid4())
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO proposed_insights (id, insight_type, content, supporting_sources, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            insight_id,
            insight_type,
            content,
            json.dumps(supporting_sources),
            status,
            now_iso(),
        ),
    )
    conn.commit()
    conn.close()
    return insight_id


def list_proposed_insights(status: str | None = None) -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    if status:
        cursor.execute(
            """
            SELECT id, insight_type, content, supporting_sources, status, created_at
            FROM proposed_insights
            WHERE status = ?
            ORDER BY created_at DESC
            """,
            (status,),
        )
    else:
        cursor.execute(
            """
            SELECT id, insight_type, content, supporting_sources, status, created_at
            FROM proposed_insights
            ORDER BY created_at DESC
            """
        )
    rows = cursor.fetchall()
    conn.close()
    insights: List[Dict[str, Any]] = []
    for row in rows:
        insights.append(
            {
                "id": row["id"],
                "insight_type": row["insight_type"],
                "content": row["content"],
                "supporting_sources": json.loads(row["supporting_sources"])
                if row["supporting_sources"]
                else [],
                "status": row["status"],
                "created_at": row["created_at"],
            }
        )
    return insights


def list_filtered_insights() -> List[Dict[str, Any]]:
    insights = list_proposed_insights(status="irrelevant")
    for insight in insights:
        feedback = list_feedback_for_insight(insight["id"])
        insight["feedback"] = feedback
    return insights


def update_proposed_insight_status(insight_id: str, status: str) -> None:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE proposed_insights SET status = ? WHERE id = ?",
        (status, insight_id),
    )
    conn.commit()
    conn.close()


def get_proposed_insight(insight_id: str) -> Dict[str, Any] | None:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT id, insight_type, content, supporting_sources, status, created_at
        FROM proposed_insights
        WHERE id = ?
        """,
        (insight_id,),
    )
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    return {
        "id": row["id"],
        "insight_type": row["insight_type"],
        "content": row["content"],
        "supporting_sources": json.loads(row["supporting_sources"])
        if row["supporting_sources"]
        else [],
        "status": row["status"],
        "created_at": row["created_at"],
    }
