from typing import Any, Dict, List

from app.storage.database import get_connection


def _fetch_table(conn, table: str) -> List[Dict[str, Any]]:
    cursor = conn.cursor()
    cursor.execute(f"SELECT * FROM {table}")
    rows = cursor.fetchall()
    return [dict(row) for row in rows]


def export_all() -> Dict[str, Any]:
    conn = get_connection()
    export_data = {
        "items": _fetch_table(conn, "items"),
        "entities": _fetch_table(conn, "entities"),
        "relations": _fetch_table(conn, "relations"),
        "provenance": _fetch_table(conn, "provenance"),
        "journal_entries": _fetch_table(conn, "journal_entries"),
        "chat_messages": _fetch_table(conn, "chat_messages"),
        "proposed_insights": _fetch_table(conn, "proposed_insights"),
        "chunks": _fetch_table(conn, "chunks"),
        "embeddings": _fetch_table(conn, "embeddings"),
        "conflicts": _fetch_table(conn, "conflicts"),
        "config": {},
    }
    conn.close()
    return export_data
