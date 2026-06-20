import json
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from app.storage.database import get_connection


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_setting(key: str) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT key, value, updated_at FROM settings WHERE key = ?", (key,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    return {
        "key": row["key"],
        "value": json.loads(row["value"]) if row["value"] else None,
        "updated_at": row["updated_at"],
    }


def set_setting(key: str, value: Dict[str, Any]) -> None:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO settings (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        """,
        (key, json.dumps(value), now_iso()),
    )
    conn.commit()
    conn.close()
