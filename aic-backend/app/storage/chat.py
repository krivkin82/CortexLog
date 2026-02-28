import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

from app.storage.database import get_connection


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_chat_message(
    role: str,
    content: str,
    mode: str,
    session_id: Optional[str] = None,
) -> Dict[str, str]:
    message_id = str(uuid.uuid4())
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO chat_messages (id, role, content, mode, created_at, session_id)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            message_id,
            role,
            content,
            mode,
            now_iso(),
            session_id,
        ),
    )
    conn.commit()
    conn.close()
    return {
        "id": message_id,
        "role": role,
        "content": content,
        "mode": mode,
        "session_id": session_id or "",
    }


def list_chat_messages(limit: int = 50, session_id: Optional[str] = None) -> List[Dict[str, str]]:
    conn = get_connection()
    cursor = conn.cursor()
    if session_id:
        cursor.execute(
            """
            SELECT id, role, content, mode, created_at, session_id
            FROM chat_messages
            WHERE session_id = ?
            ORDER BY created_at ASC
            LIMIT ?
            """,
            (session_id, limit),
        )
    else:
        cursor.execute(
            """
            SELECT id, role, content, mode, created_at, session_id
            FROM chat_messages
            ORDER BY created_at ASC
            LIMIT ?
            """,
            (limit,),
        )
    rows = cursor.fetchall()
    conn.close()
    return [
        {
            "id": row["id"],
            "role": row["role"],
            "content": row["content"],
            "mode": row["mode"],
            "created_at": row["created_at"],
            "session_id": row["session_id"],
        }
        for row in rows
    ]
