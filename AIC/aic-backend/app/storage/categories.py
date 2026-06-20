"""Categories and item_categories storage."""

import uuid
from datetime import datetime, timezone
from typing import List

from app.storage.database import get_connection


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_category(name: str, description: str | None = None) -> str:
    """Get or create a category by name. Returns category id."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id FROM categories WHERE name = ? LIMIT 1",
        (name,),
    )
    row = cursor.fetchone()
    if row:
        conn.close()
        return row["id"]
    cat_id = str(uuid.uuid4())
    cursor.execute(
        """
        INSERT INTO categories (id, name, description, created_at)
        VALUES (?, ?, ?, ?)
        """,
        (cat_id, name, description or "", now_iso()),
    )
    conn.commit()
    conn.close()
    return cat_id


def link_item_category(item_id: str, category_name: str, confidence: float = 1.0) -> None:
    """Link an item to a category."""
    cat_id = ensure_category(category_name)
    link_id = str(uuid.uuid4())
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO item_categories (id, item_id, category_id, confidence, created_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (link_id, item_id, cat_id, confidence, now_iso()),
    )
    conn.commit()
    conn.close()


def list_categories() -> List[dict]:
    """List all categories."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT id, name, description, created_at
        FROM categories
        ORDER BY name
        """
    )
    rows = cursor.fetchall()
    conn.close()
    return [
        {"id": row["id"], "name": row["name"], "description": row["description"], "created_at": row["created_at"]}
        for row in rows
    ]


def get_item_categories(item_id: str) -> List[dict]:
    """Get categories for an item."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT c.id, c.name, c.description, ic.confidence
        FROM item_categories ic
        JOIN categories c ON c.id = ic.category_id
        WHERE ic.item_id = ?
        """,
        (item_id,),
    )
    rows = cursor.fetchall()
    conn.close()
    return [
        {"id": row["id"], "name": row["name"], "description": row["description"], "confidence": row["confidence"]}
        for row in rows
    ]
